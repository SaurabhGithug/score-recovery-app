#!/usr/bin/env python3
"""Key-free ("clean") question crops for the SSC JE previous-year papers.

The extractor's crops (data/storage/pyp-crops/**) show SSC's answer key: tick/cross icons,
green/red option text, a "Correct Answer" line (2016-17 listings) and sometimes the
candidate's ID box. This tool writes data/storage/pyp-crops-clean/<same relative path>.png
with every key signal removed, so a learner can attempt a question from the image before
submitting. It never writes into the extractor's folders.

How (details in README.md):

* Vector pages (text layer, or glyphs drawn as vector paths): the page is loaded with
  pypdfium2 and edited in memory before rendering -- every red/green (or otherwise strongly
  coloured) text/path object is set to black, the tick/cross icon objects left of each option
  number are deactivated, "Correct Answer" / ID-box text is deactivated, and each option's
  first line is translated so that the four option numbers start at the same x (the tick and
  the cross are different widths, which otherwise pushes the correct option right by ~2 pt).
  The question region is rendered at 2x and saved as 8-bit grayscale.
* Raster pages (scans): the region is rendered, the tick/cross icons found from key-colour
  pixels are painted white, and the image is binarised with a colour-normalised threshold so
  that red, green and black strokes all become the same black.
* Belt and braces: a white box of one size is painted over the icon column of every option,
  the extractor's ID-box blanking is replicated, and the "Correct Answer" line is blanked in
  pixels as well.

Every output is checked before it is kept (no colour, icon boxes blank, tesseract finds no
"Correct Answer" / "Chosen Option" / "Status :"). A question that fails any check gets no
clean crop and any stale one is deleted. Results go to data/storage/pyp-crops-clean/
_manifest.json (one entry per crop, with the inputs' fingerprint, so re-runs skip up-to-date
outputs) and _report.json (counts and the cross-question leak test).

Usage:
  python3 services/pyp-redact/redact.py                 # every parsed JSON present
  python3 services/pyp-redact/redact.py parsed/a.json   # selected parsed files
  python3 services/pyp-redact/redact.py --force         # ignore the manifest
  python3 services/pyp-redact/redact.py --report        # rebuild _report.json only
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import cv2
import numpy as np
import pypdfium2 as pdfium
import pypdfium2.raw as pr
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
PARSED = REPO / "data" / "pyp-sources" / "parsed"
STATUS = PARSED / "_status"
CROPS = REPO / "data" / "storage" / "pyp-crops"
CLEAN = REPO / "data" / "storage" / "pyp-crops-clean"
MANIFEST = CLEAN / "_manifest.json"
REPORT = CLEAN / "_report.json"

VERSION = 4  # bump when the algorithm changes; every output is then rebuilt
SCALE = 2.0  # same bitmap scale as the extractor's crops
GAP_ROWS, GAP_VALUE = 6, 200  # the extractor joins multi-page parts with a 6 px grey band

FORBIDDEN = [
    re.compile(r"correct\s*answer\s*[:;]", re.I),
    re.compile(r"chosen\s*option", re.I),
    re.compile(r"status\s*[:;]", re.I),
]
LABEL_RE = re.compile(
    r"(Chosen\s*Option|Status\s*:|Question\s*ID|Option\s*\d\s*ID|Question\s*Type|Option\s*Shown)",
    re.I,
)
CA_RE = re.compile(r"(?:^|[\r\n])\s*(Correct\s*Answer\s*:)", re.I)
QID_RE = re.compile(r"QID\s*:", re.I)

# Candidate data and browser print furniture. None of this may appear in a crop that is served.
# STRICT is the list the ORIGINAL crop must be free of (original_ok): every term as a bare word.
# The CLEAN crop fails (print_furniture:<what>) on the same URL / timestamp / counter / ID-box
# terms, but the words that also occur in question text are matched only in their label form
# ("Roll No", "Status :", "Candidate Name", "Venue Name", "Application No") -- measured on 400
# clean crops, bare "Roll" / "Application" hit stems ("Roll on, Roll off", "The application of
# curing"), which would drop good crops while the labels themselves are still caught. Likewise
# URLs need URL syntax and a print stamp needs a date with its time (see PII_CLEAN).
_URL = ("url", re.compile(r"https?|www|digialm|://|\.com\b", re.I))
_STAMP = ("timestamp", re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4},?\s+\d{1,2}[:.]\d{2}|\b\d{1,2}:\d{2}\s*[AP]\.?\s?M\b", re.I))
PII_STRICT = [
    ("chosen_option", re.compile(r"chosen\s*opt", re.I)),
    ("status", re.compile(r"\bstatus\b", re.I)),
    ("question_id", re.compile(r"question\s*[il1]d\b", re.I)),
    ("candidate", re.compile(r"\bcandidate\b", re.I)),
    ("roll", re.compile(r"\broll\b", re.I)),
    ("venue", re.compile(r"\bvenue\b", re.I)),
    ("application", re.compile(r"\bapplication\b", re.I)),
    _URL, _STAMP,
]
PII_CLEAN = [
    ("chosen_option", re.compile(r"chosen\s*opt", re.I)),
    ("status", re.compile(r"\bstatus\s*[:;]|\bstatus\s+(answered|not\s*answered|not\s*attempted|marked)", re.I)),
    ("question_id", re.compile(r"question\s*[il1]d\b", re.I)),
    ("candidate", re.compile(r"\bcandidate\s*(name|answer|id|response|[:;])", re.I)),
    ("roll", re.compile(r"\broll\s*(no\b|number|num\b|[:;])", re.I)),
    ("venue", re.compile(r"\b(venue\s*(name|[:;])|test\s*venue)", re.I)),
    ("application", re.compile(r"\bapplication\s*(no\b|number|num\b|id\b|[:;])", re.I)),
    # URL syntax, not the letters: tesseract reads "WwW" off mirror-image figures and letter
    # series ("PWWWNJL"); a print stamp is a date AND a time ("11/23/22, 12:44 PM"), a bare
    # "5:00 a.m." is question text
    ("url", re.compile(r"https?\s*:|www\s*\.|digialm|://|\.com\b", re.I)),
    ("timestamp", re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4},?\s*\d{1,2}[:.]\d{2}", re.I)),
]
COUNTER_RE = re.compile(r"^(\d{1,3})\s*/\s*(\d{1,3})$")
FURNITURE_LINE = re.compile(r"https?|www\.|digialm|://|\.com\b|\.php|thepracticetest|\b\d{1,2}/\d{1,2}/\d{2,4}\b|"
                            r"\b\d{1,2}:\d{2}\s*[AP]\.?\s?M\b", re.I)
Q_MARK = re.compile(r"^\s*Q\s?[.,]\s?\d{1,3}\b")
Q_TEXT_RE = re.compile(r"(?:^|[\r\n])\s*(Q\.\s?\d{1,3})")
QID_MARK_RE = re.compile(r"(QID\s*:\s*\d{1,4})")
QID_OPT_RE = re.compile(r"(?:^|[\r\n])\s*([1-4]\))")

sys.path.insert(0, str(REPO / "services" / "pyp-extract"))
from pages import neutralise_hidden_clip  # noqa: E402  (the extractor renders with a hiding print clip undone)


# ------------------------------------------------------------------ colours
def key_masks(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Strong green / red key-colour pixels (the extractor's measured thresholds)."""
    a = arr.astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g >= 100) & (g - r >= 45) & (g - b >= 40) & (r <= 170)
    red = (r >= 110) & (r - g >= 60) & (r - b >= 55) & (g <= 130)
    return green, red


def key_mask(arr: np.ndarray) -> np.ndarray:
    g, r = key_masks(arr)
    return g | r


def colour_class(rgb) -> str:
    """'G' / 'R' for the key colours, 'C' for any other strong colour, '' otherwise (0..255)."""
    if rgb is None:
        return ""
    r, g, b = rgb
    if g >= 140 and g - r >= 64 and g - b >= 51:
        return "G"
    if r >= 178 and r - g >= 102 and r - b >= 102:
        return "R"
    if max(rgb) - min(rgb) >= 80 and min(rgb) <= 150:
        return "C"
    return ""


def get_colour(raw, stroke=False):
    r, g, b, a = (ctypes.c_uint() for _ in range(4))
    fn = pr.FPDFPageObj_GetStrokeColor if stroke else pr.FPDFPageObj_GetFillColor
    if not fn(raw, r, g, b, a):
        return None, None
    return (r.value, g.value, b.value), a.value


def set_black(raw) -> None:
    for stroke in (False, True):
        rgb, a = get_colour(raw, stroke)
        if rgb is None:
            continue
        (pr.FPDFPageObj_SetStrokeColor if stroke else pr.FPDFPageObj_SetFillColor)(raw, 0, 0, 0, a)


def text_of(raw, textpage) -> str:
    n = pr.FPDFTextObj_GetText(raw, textpage.raw, None, 0)
    if n <= 2:
        return ""
    buf = ctypes.create_string_buffer(n)
    pr.FPDFTextObj_GetText(raw, textpage.raw, ctypes.cast(buf, ctypes.POINTER(pr.FPDF_WCHAR)), n)
    return buf.raw[: n - 2].decode("utf-16le", "replace").replace("\x00", "")


# ------------------------------------------------------------------ geometry helpers
def mat_mul(m1, m2):
    """PDF matrices as (a,b,c,d,e,f); returns m1 then m2 (p' = p * m1 * m2)."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2, c1 * b2 + d1 * d2,
            e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2)


def apply_box(m, l, b, r, t):
    pts = [(l, b), (l, t), (r, b), (r, t)]
    xs = [x * m[0] + y * m[2] + m[4] for x, y in pts]
    ys = [x * m[1] + y * m[3] + m[5] for x, y in pts]
    return min(xs), min(ys), max(xs), max(ys)


IDENT = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


class Obj:
    __slots__ = ("raw", "type", "x0", "x1", "top", "bottom", "cls", "text", "to_page", "level", "wrapper")

    def __init__(self, raw, typ, box, cls, text, to_page, level, wrapper):
        self.raw, self.type = raw, typ
        self.x0, self.top, self.x1, self.bottom = box
        self.cls, self.text, self.to_page, self.level, self.wrapper = cls, text, to_page, level, wrapper

    @property
    def w(self):
        return self.x1 - self.x0

    @property
    def h(self):
        return self.bottom - self.top

    @property
    def cy(self):
        return (self.top + self.bottom) / 2


# ------------------------------------------------------------------ page model
class Page:
    """One PDF page: an untouched render plus an edited (key-free) document page."""

    def __init__(self, doc_orig, doc_clean, index: int, family: str):
        self.index = index
        self.family = family
        self.pg = doc_clean[index]
        self.pg_orig = doc_orig[index]
        # one 2019 sitting was printed with a clip that hides the left/bottom of each page; the
        # extractor's crops are rendered with it undone, so both renders here must be too
        self.clip_removed = neutralise_hidden_clip(self.pg) is not None
        neutralise_hidden_clip(self.pg_orig)
        self._zones = None
        self.declared_zones: list[tuple[float, float]] = []
        cb = self.pg.get_cropbox()
        self.cb = cb
        self.width, self.height = cb[2] - cb[0], cb[3] - cb[1]
        self.textpage = self.pg.get_textpage()
        self.objs: list[Obj] = []
        self._walk()
        self.has_text = self.textpage.count_chars() > 0
        self.hidden: set[int] = set()
        self.recoloured = 0
        self.blank_rects: list[tuple[float, float, float, float]] = []  # render coords (pt)
        self.ca_tops: list[float] = []
        self._labels()
        self._recolour()
        self.rows = self._number_rows()
        self._orig_arr = None
        self._clean_arr = None

    # -- coordinates: render space = pt from the top-left of the crop box
    def _to_render(self, l, b, r, t):
        cb = self.cb
        return (l - cb[0], cb[3] - t, r - cb[0], cb[3] - b)

    def _walk(self):
        stack: list[tuple[int, tuple]] = []  # (level, to_page matrix of that level's children)
        for o in self.pg.get_objects(max_depth=15):
            while stack and stack[-1][0] >= o.level:
                stack.pop()
            parent_m = stack[-1][1] if stack else IDENT
            try:
                l, b, r, t = o.get_bounds()
            except Exception:
                continue
            l, b, r, t = apply_box(parent_m, l, b, r, t)
            typ = o.type
            cls = ""
            txt = ""
            if typ in (1, 2):
                fill, _ = get_colour(o.raw)
                strk, _ = get_colour(o.raw, True)
                cf = colour_class(fill)
                cs = colour_class(strk) if typ == 1 else ""  # path stroke colour matters only if stroked
                if typ == 2:
                    fm, sm = ctypes.c_int(), ctypes.c_int()
                    if pr.FPDFPath_GetDrawMode(o.raw, ctypes.byref(fm), ctypes.byref(sm)):
                        if not fm.value:
                            cf = ""
                        if sm.value:
                            cs = colour_class(strk)
                cls = cf or cs
                if typ == 1:
                    txt = text_of(o.raw, self.textpage)
            self.objs.append(Obj(o.raw, typ, self._to_render(l, b, r, t), cls, txt, parent_m, o.level, o))
            if typ == 5:
                m = o.get_matrix()
                fm = tuple(m.get())
                stack.append((o.level, mat_mul(fm, parent_m)))

    def hide(self, o: Obj):
        if id(o) in self.hidden:
            return
        pr.FPDFPageObj_SetIsActive(o.raw, False)
        self.hidden.add(id(o))
        self._clean_arr = None  # the cached render is stale now

    def _labels(self):
        """Deactivate "Correct Answer ..." runs and ID-box label lines; remember their boxes."""
        tp = self.textpage
        n = tp.count_chars()
        if n <= 0:
            return
        chars = []
        for i in range(n):
            u = pr.FPDFText_GetUnicode(tp.raw, i)
            chars.append(chr(u) if 0 < u < 0x110000 else "�")
        text = "".join(chars)

        def box(i):
            try:
                l, b, r, t = tp.get_charbox(i)
            except Exception:
                return None
            if r <= l and t <= b:
                return None
            return self._to_render(l, b, r, t)

        by_ptr = {ctypes.cast(o.raw, ctypes.c_void_p).value: o for o in self.objs if o.type == 1}

        def hide_range(i0, i1):
            xs0, tops, bots = [], [], []
            for i in range(i0, i1):
                bx = box(i)
                if bx:
                    xs0.append(bx[0])
                    tops.append(bx[1])
                    bots.append(bx[3])
                raw = pr.FPDFText_GetTextObject(tp.raw, i)
                if raw:
                    o = by_ptr.get(ctypes.cast(raw, ctypes.c_void_p).value)
                    if o is not None:
                        self.hide(o)
            if tops:
                return min(xs0), min(tops), max(bots)
            return None

        if self.family == "qid":
            # 2016-17 listings: "Correct Answer: <text>" up to the next "QID :" (or page end)
            qids = [m.start() for m in QID_RE.finditer(text)]
            for m in CA_RE.finditer(text):
                s0 = m.start(1)
                end = next((q for q in qids if q > s0), n)
                got = hide_range(s0, end)
                if got:
                    x0, top, bottom = got
                    self.ca_tops.append(top)
                    self.blank_rects.append((0.0, top - 2.0, self.width, bottom + 2.0))
            return
        # digialm ID box (right-hand column): hide every label line (label to end of line)
        for m in LABEL_RE.finditer(text):
            b0 = box(m.start())
            if not b0 or b0[0] < 0.45 * self.width:
                continue
            end = m.end()
            while end < n and text[end] not in "\r\n":
                end += 1
            got = hide_range(m.start(), end)
            if got:
                x0, top, bottom = got
                self.blank_rects.append((x0 - 4.0, top - 3.0, self.width, bottom + 3.0))

    def _recolour(self):
        for o in self.objs:
            if o.type in (1, 2) and o.cls:
                set_black(o.raw)
                self.recoloured += 1

    def _is_period(self, o: Obj, d: Obj, merged: bool = False) -> bool:
        """A period right after number glyph `d`. With merged=True also a path that starts with
        the period but carries the next glyph too (2022 files sometimes join "." and "-")."""
        if not (o.cls in ("R", "G") and o is not d and d.x1 - 0.5 <= o.x0 <= d.x1 + 3.5
                and abs(o.bottom - d.bottom) <= 1.2):
            return False
        if o.w <= 2.2 and o.h <= 2.2:
            return True
        return merged and o.type == 2 and o.h <= 0.8 * d.h

    def _row_ref(self, d: Obj, keyed: list[Obj]) -> float | None:
        """A layout reference that is identical for every option row of a question unless the
        row was pushed sideways: the text pen origin of the number, or -- for glyphs drawn as
        paths -- the left edge of its period (digits are tabular, so the period sits at the same
        x after any digit)."""
        if d.type == 1:
            e, f = d.wrapper.get_matrix().get()[4:6]
            m = d.to_page
            x_pdf = e * m[0] + f * m[2] + m[4]
            return x_pdf - self.cb[0]
        periods = [o for o in keyed if self._is_period(o, d)] or [o for o in keyed if self._is_period(o, d, True)]
        if not periods:
            return None
        return min(periods, key=lambda o: o.x0).x0

    def _number_rows(self):
        """Option-number glyphs ("1." .. "4." in the key colour, leftmost on their line)."""
        keyed = [o for o in self.objs if o.type in (1, 2) and o.cls in ("R", "G") and o.h > 0]
        rows = []
        for d in keyed:
            if d.h < 3.0 or d.h > 14.0:
                continue
            if d.type == 1:
                t = d.text.strip()
                if not re.fullmatch(r"[1-4](\.|\. .*|\.)?", t) and not re.match(r"^[1-4]\.\s*", t):
                    continue
                digit = t[0]
                if len(t) == 1 and not any(self._is_period(o, d) or (o.type == 1 and o.text.strip().startswith(".")
                                                                   and abs(o.bottom - d.bottom) <= 1.5
                                                                   and d.x1 - 0.5 <= o.x0 <= d.x1 + 3.5)
                                           for o in keyed):
                    continue
            else:
                if d.w > 7.0 or d.w < 0.8:
                    continue
                if not any(self._is_period(o, d, True) for o in keyed):
                    continue
                digit = None
            # leftmost key-coloured glyph on its line (ignoring icon-sized objects)
            left = [o for o in keyed if o is not d and o.x1 <= d.x0 + 0.3 and o.w < 7.0
                    and min(o.bottom, d.bottom) - max(o.top, d.top) > 0.5 * min(o.h, d.h)]
            if left:
                continue
            rows.append({"digit_obj": d, "digit": digit, "x0": d.x0, "top": d.top, "bottom": d.bottom,
                         "ref": self._row_ref(d, keyed)})
        rows.sort(key=lambda r: (r["top"], r["x0"]))
        # a digit "1." split into '1' + '.' objects can both qualify: keep one per line
        out = []
        for r in rows:
            if out and abs(out[-1]["top"] - r["top"]) < 1.0 and abs(out[-1]["x0"] - r["x0"]) < 4:
                continue
            out.append(r)
        return out

    # -- icons and first-line bands for a set of rows (called per question)
    def icons_for(self, row, next_top: float | None) -> list[Obj]:
        """Objects in the icon column of this option: left of its number, from the number's
        line down to the next option (icons sit mid-row beside tall option figures)."""
        d = row["digit_obj"]
        lim = next_top - 4.0 if next_top is not None else d.bottom + 60
        out = []
        for o in self.objs:
            if o is d or id(o) in self.hidden:
                continue
            if o.x1 > d.x0 + 0.5 or o.x0 < d.x0 - 25:
                continue
            if o.bottom <= d.top - 6 or o.top >= lim:
                continue
            if o.w > 30 or o.h > 30:
                continue
            if o.type == 3 or (o.type == 2 and o.cls and o.w >= 5 and o.h >= 5):
                out.append(o)
        return out

    def band_objs(self, row, next_top: float | None) -> list[Obj]:
        d = row["digit_obj"]
        out = []
        for o in self.objs:
            if id(o) in self.hidden or o.type == 5:
                continue
            if o.x0 < d.x0 - 0.8:
                continue
            if o.w > 0.8 * self.width or o.h > 0.5 * self.height:
                continue  # page frames, watermarks
            ov = min(o.bottom, d.bottom) - max(o.top, d.top)
            centred = d.top - 0.35 * d.h <= o.cy <= d.bottom + 0.35 * d.h
            if ov < 0.4 * d.h and not centred:
                continue
            if next_top is not None and o.top >= next_top - 0.5:
                continue
            out.append(o)
        return out

    def translate(self, o: Obj, dx_pt: float):
        self._clean_arr = None
        # dx is in page space; convert to the object's parent space (inverse of the linear part)
        a, b, c, d, _, _ = o.to_page
        det = a * d - b * c
        if abs(det) < 1e-9:
            return
        # solve [dx', dy'] * [[a,b],[c,d]] = [dx, 0]
        dxp = (dx_pt * d) / det
        dyp = (-dx_pt * b) / det
        pr.FPDFPageObj_Transform(o.raw, 1, 0, 0, 1, dxp, dyp)

    def add_label(self, text: str, x: float, baseline: float, size: float):
        """Insert a black Helvetica text object at render coords (x, baseline)."""
        font = pr.FPDFText_LoadStandardFont(self.pg.pdf.raw, b"Helvetica")
        obj = pr.FPDFPageObj_NewTextObj(self.pg.pdf.raw, b"Helvetica", ctypes.c_float(size))
        ws = (text + "\x00").encode("utf-16le")
        buf = ctypes.create_string_buffer(ws, len(ws))
        pr.FPDFText_SetText(obj, ctypes.cast(buf, ctypes.POINTER(pr.FPDF_WCHAR)))
        pr.FPDFPageObj_SetFillColor(obj, 0, 0, 0, 255)
        pr.FPDFPageObj_Transform(obj, 1, 0, 0, 1, x + self.cb[0], self.cb[3] - baseline)
        pr.FPDFPage_InsertObject(self.pg.raw, obj)
        self._clean_arr = None
        del font

    # -- renders
    def render(self, clean: bool) -> np.ndarray:
        if clean:
            if self._clean_arr is None:
                self._clean_arr = np.asarray(self.pg.render(scale=SCALE).to_pil().convert("RGB"))
            return self._clean_arr
        if self._orig_arr is None:
            self._orig_arr = np.asarray(self.pg_orig.render(scale=SCALE).to_pil().convert("RGB"))
        return self._orig_arr

    def invalidate(self):
        self._clean_arr = None

    def text_marks(self, rx) -> list[tuple[float, float, str]]:
        """(x0, top, text) in render pt of every match of `rx` in the page's text layer."""
        tp = self.textpage
        n = tp.count_chars()
        if n <= 0:
            return []
        if not hasattr(self, "_fulltext"):
            self._fulltext = "".join(chr(u) if 0 < (u := pr.FPDFText_GetUnicode(tp.raw, i)) < 0x110000 else "?"
                                     for i in range(n))
        out = []
        for m in rx.finditer(self._fulltext):
            try:
                l, b, r, t = tp.get_charbox(m.start(1) if m.groups() else m.start())
            except Exception:
                continue
            x0, top, _, _ = self._to_render(l, b, r, t)
            out.append((x0, top, m.group(0)))
        return out

    def furniture_zones(self) -> list[tuple[float, float]]:
        """Print header/footer bands of this page (pt, from the top), found independently of the
        extractor: tesseract reads the top and bottom 7 % of the untouched render, and a line
        with a URL, a print timestamp or a trailing page counter makes a zone from the page edge
        to that line (+2 pt). The extractor's declared zones for this page size are added."""
        if self._zones is not None:
            return self._zones
        arr = self.render(False)
        H, W = arr.shape[:2]
        band = int(0.07 * H)
        zones = list(self.declared_zones)
        for y0, y1, edge in ((0, band, "head"), (H - band, H, "foot")):
            sub = arr[y0:y1]
            if int((sub.min(axis=2) < 200).sum()) < 20:
                continue
            for line in ocr_lines(Image.fromarray(np.ascontiguousarray(sub))):
                text = line["text"]
                last = line["words"][-1]
                m = COUNTER_RE.match(last["text"])
                counter = bool(m) and int(m.group(1)) <= int(m.group(2)) and last["x1"] > 0.8 * W
                if FURNITURE_LINE.search(text) or counter:
                    if edge == "head":
                        zones.append((0.0, (y0 + line["y1"]) / SCALE + 2.0))
                    else:
                        zones.append(((y0 + line["y0"]) / SCALE - 2.0, H / SCALE))
        self._zones = zones
        return zones


# ------------------------------------------------------------------ crop parts
def split_parts(crop: np.ndarray) -> list[tuple[int, int]]:
    """Row ranges of the per-page parts of an extractor crop (joined by 6 grey rows)."""
    grey = np.all(crop == GAP_VALUE, axis=(1, 2))
    parts, start, y, H = [], 0, 0, crop.shape[0]
    while y < H:
        if grey[y] and y + GAP_ROWS <= H and grey[y:y + GAP_ROWS].all() and (y + GAP_ROWS == H or not grey[y + GAP_ROWS]):
            parts.append((start, y))
            start = y + GAP_ROWS
            y += GAP_ROWS
            continue
        y += 1
    parts.append((start, H))
    return [p for p in parts if p[1] > p[0]]


def locate(part: np.ndarray, page_arr: np.ndarray, guess: tuple[int, int] | None):
    """(X, Y, mismatch) of `part` inside the page render. Exact match expected (same renderer)."""
    h, w = part.shape[:2]
    H, W = page_arr.shape[:2]
    lw = max(40, min(w, int(w * 0.5)))

    def score(X, Y):
        if X < 0 or Y < 0 or Y + h > H or X + lw > W:
            return 1.0
        sub = page_arr[Y:Y + h, X:X + lw].astype(np.int16)
        ref = part[:, :lw].astype(np.int16)
        # where the crop is pure white the extractor may have painted over content (ID box,
        # "Candidate Answer" line): only non-white crop pixels must match the render
        d = (np.abs(sub - ref).max(axis=2) > 12) & (ref.min(axis=2) < 250)
        return float(d.mean())

    best = None
    if guess is not None:
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                s = score(guess[0] + dx, guess[1] + dy)
                if best is None or s < best[2]:
                    best = (guess[0] + dx, guess[1] + dy, s)
        if best and best[2] <= 0.02:
            return best
    g_page = cv2.cvtColor(np.ascontiguousarray(page_arr), cv2.COLOR_RGB2GRAY)
    g_part = cv2.cvtColor(np.ascontiguousarray(part[:, :lw]), cv2.COLOR_RGB2GRAY)
    if g_part.shape[0] > g_page.shape[0] or g_part.shape[1] > g_page.shape[1]:
        return best or (0, 0, 1.0)
    # normalised correlation: a mostly white part (a continuation with one line of text) must
    # not "match" any blank area of the page
    res = cv2.matchTemplate(g_page, g_part, cv2.TM_CCOEFF_NORMED)
    _, _, _, loc = cv2.minMaxLoc(res)
    s = score(loc[0], loc[1])
    if best is None or s < best[2]:
        best = (loc[0], loc[1], s)
    return best


# ------------------------------------------------------------------ neutral labels
_FONT_CACHE: dict[int, object] = {}


def label_font(px: int):
    from PIL import ImageFont
    if px not in _FONT_CACHE:
        font = None
        for cand in ("/System/Library/Fonts/Supplemental/Arial.ttf",
                     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
            if Path(cand).exists():
                font = ImageFont.truetype(cand, size=px)
                break
        _FONT_CACHE[px] = font or ImageFont.load_default(size=px)
    return _FONT_CACHE[px]


def draw_labels(img: Image.Image, labels) -> Image.Image:
    """Draw "1." .. "4." in plain black, right-aligned at one x, on each row's number baseline."""
    from PIL import ImageDraw
    out = img.convert("L")
    d = ImageDraw.Draw(out)
    for text, x_right, baseline, digit_px in labels:
        font = label_font(int(round(digit_px * 1.4)))
        l, t, r, b = d.textbbox((0, 0), "4.", font=font, anchor="ls")  # one box for every label
        d.text((x_right - (r - l) - l, baseline), text, fill=0, font=font, anchor="ls")
    return out.convert("1") if img.mode == "1" else out


# ------------------------------------------------------------------ OCR check
class TesseractError(RuntimeError):
    pass


def ocr_lines(img: Image.Image, psm: int = 6) -> list[dict]:
    """tesseract TSV grouped into lines: [{"text", "y0", "y1", "words": [{"text", "x0", "x1"}]}] (px)."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        path = f.name
    try:
        img.save(path)
        proc = subprocess.run(["tesseract", path, "-", "-l", "eng", "--psm", str(psm), "tsv"],
                              capture_output=True, text=True, timeout=120)
        if proc.returncode != 0 or not proc.stdout.startswith("level"):
            # a failed tesseract must never read as "nothing found": the row fails (and is retried)
            raise TesseractError(f"rc={proc.returncode}:{proc.stderr.strip()[:120]}")
        out = proc.stdout
    finally:
        os.unlink(path)
    lines: dict[tuple, dict] = {}
    for row in out.splitlines()[1:]:
        c = row.split("\t")
        if len(c) < 12 or c[0] != "5" or not c[11].strip():
            continue
        x, y, w, h = int(c[6]), int(c[7]), int(c[8]), int(c[9])
        ln = lines.setdefault((c[2], c[3], c[4]), {"words": [], "y0": y, "y1": y + h})
        ln["words"].append({"text": c[11].strip(), "x0": x, "x1": x + w})
        ln["y0"], ln["y1"] = min(ln["y0"], y), max(ln["y1"], y + h)
    out_lines = []
    for ln in lines.values():
        ln["words"].sort(key=lambda w: w["x0"])
        ln["text"] = " ".join(w["text"] for w in ln["words"])
        out_lines.append(ln)
    out_lines.sort(key=lambda l: l["y0"])
    return out_lines


def pii_hits(img: Image.Image, patterns=None) -> tuple[list[str], int, str]:
    """(hits, n_q_markers, text) for a crop: candidate/print patterns tesseract finds (psm 6 and
    psm 11, so a stray label beside a figure is read too), a trailing page counter "n/m" in the
    right quarter of a line, and the number of lines that start with a "Q.n" marker."""
    W = img.size[0]
    hits, text_all, qm = [], [], 0
    for psm in (6, 11):
        lines = ocr_lines(img, psm)
        for ln in lines:
            text_all.append(ln["text"])
            last = ln["words"][-1]
            m = COUNTER_RE.match(last["text"])
            if m and int(m.group(1)) <= int(m.group(2)) and int(m.group(2)) >= 2 and last["x1"] > 0.75 * W:
                hits.append(f"page_counter:{last['text']}")
        if psm == 6:
            qm = sum(1 for ln in lines if Q_MARK.match(ln["text"]))
    text = "\n".join(text_all)
    for name, rx in (patterns or PII_STRICT):
        m = rx.search(text)
        if m:
            hits.append(f"{name}:{m.group(0)[:30]}")
    return sorted(set(hits)), qm, text


def ocr_text(img: Image.Image) -> str:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        path = f.name
    try:
        img.save(path)
        out = subprocess.run(["tesseract", path, "-", "-l", "eng", "--psm", "6"],
                             capture_output=True, text=True, timeout=60)
        if out.returncode != 0:
            raise TesseractError(f"rc={out.returncode}:{out.stderr.strip()[:120]}")
        return out.stdout
    finally:
        os.unlink(path)


# ------------------------------------------------------------------ raster rows
def watermark_mask(a16: np.ndarray) -> np.ndarray:
    """The light pink Adda247 watermark: reddish but weakly saturated and light."""
    r, g = a16[..., 0], a16[..., 1]
    mn = a16.min(axis=2)
    return (r > g) & (r - g <= 60) & (mn >= 140)


def ink_mask(a16: np.ndarray) -> np.ndarray:
    return (a16.min(axis=2) < 200) & ~watermark_mask(a16)


def raster_icons(crop: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Tick/cross icons in a scanned crop: the leftmost column of coloured blobs >= 12 px."""
    a16 = crop.astype(np.int16)
    chroma = (a16.max(axis=2) - a16.min(axis=2) >= 40) & (a16.min(axis=2) < 215) & ~watermark_mask(a16)
    m = cv2.dilate(chroma.astype(np.uint8), np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    W = crop.shape[1]
    cand = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if w >= 12 and h >= 12 and w <= 60 and h <= 60 and x < 0.4 * W and a >= 60:
            cand.append((int(x), int(y), int(x + w), int(y + h)))
    if not cand:
        return []
    xmin = min(c[0] for c in cand)
    out = [c for c in cand if c[0] <= xmin + 14]
    out.sort(key=lambda b: b[1])
    return out


FWHM_FRACTION = 0.4  # cut every blob at 40% of its own contrast (same fraction for every colour)


def binarise_fwhm(rgb: np.ndarray) -> np.ndarray:
    """Binarise so a stroke's width does not depend on its colour or contrast.

    Scans print the green option text/numbers lighter than the red ones, so any global
    threshold makes the correct option look thinner. Here every connected ink blob is cut at
    half of its own contrast (full width at half maximum on the min channel, which is ~0 at
    the core of black, red and green strokes alike). Light pink watermark blobs are dropped."""
    a16 = rgb.astype(np.int16)
    mn = a16.min(axis=2)
    wm = watermark_mask(a16)
    faint = (mn < 235) & ~wm
    n, lab = cv2.connectedComponents(faint.astype(np.uint8), connectivity=8)
    out = np.full(mn.shape, 255, dtype=np.uint8)
    if n <= 1:
        return out
    flat = lab.ravel()
    vals = mn.ravel()
    order = np.argsort(flat, kind="stable")
    sorted_lab = flat[order]
    bounds = np.searchsorted(sorted_lab, np.arange(n + 1))
    core = np.full(n, 255.0)
    for i in range(1, n):
        seg = vals[order[bounds[i]:bounds[i + 1]]]
        if seg.size:
            core[i] = float(np.percentile(seg, 3)) if seg.size >= 20 else float(seg.min())
    thr = 255.0 - FWHM_FRACTION * (255.0 - core)
    keep = core <= 200  # blobs with no real core are noise
    t = thr[lab]
    black = (lab > 0) & keep[lab] & (mn <= t)
    out[black] = 0
    return out


def row_features(final: np.ndarray, x_from: int, y0: int, y1: int) -> dict:
    """Per-option measurements for the leak test (see leak_report)."""
    H, W = final.shape
    y0, y1 = max(0, y0), min(H, y1)
    band = final[y0:y1, max(0, x_from):W]
    ink = band < 128
    cols = np.where(ink.any(axis=0))[0]
    if y1 <= y0 or cols.size == 0:
        return {"x": None, "dig_ink": None, "dig_dark": None, "width": None, "yc": (y0 + y1) / 2}
    x = int(cols[0])
    dig = band[:, x:x + 10]
    rest = ink[:, x + 12:]
    area = int(rest.sum())
    if area:
        pad = np.pad(rest, 1)
        interior = pad[1:-1, 1:-1] & pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        perim = area - int(interior.sum())
        width = round(2.0 * area / max(1, perim), 3)
    else:
        width = None
    return {"x": x + max(0, x_from), "dig_ink": int((dig < 128).sum()),
            "dig_dark": int((255 - dig.astype(np.int32)).sum()), "width": width, "yc": (y0 + y1) / 2}


# ------------------------------------------------------------------ one question
def family_of(parsed: dict, status_kind: str | None) -> str:
    if status_kind == "qid_answer_text":
        return "qid"
    if any(q["key"].get("basis") == "answer_text" for q in parsed["questions"]):
        return "qid"
    return "digialm"


def fingerprint(parsed: dict, q: dict, crop_path: Path, ocr: bool = True) -> str:
    """Inputs of a manifest row. Whether the tesseract checks ran is part of it, so a row made
    with --no-ocr (no "Correct Answer" / "Chosen Option" / furniture check, original_ok never
    true) is never reused by a full run."""
    h = hashlib.sha256()
    h.update(str(VERSION).encode())
    h.update(b"ocr" if ocr else b"no-ocr")
    h.update(parsed["source"]["sha256"].encode())
    h.update(json.dumps([q.get("page"), q.get("pages"), q.get("bbox")]).encode())
    crop_sha = hashlib.sha256(crop_path.read_bytes()).hexdigest()
    h.update(crop_sha.encode())
    return h.hexdigest(), crop_sha


class Fail(Exception):
    pass


def clean_question(q: dict, family: str, pages: dict, get_page, crop: np.ndarray, ocr: bool):
    """Returns (PIL image, info dict). Raises Fail(reason)."""
    parts = split_parts(crop)
    page_nums = q.get("pages") or [q["page"]]
    if len(parts) != len(page_nums):
        raise Fail(f"parts:{len(parts)}!=pages:{len(page_nums)}")
    W = crop.shape[1]
    info = {"mode": None, "rows": [], "parts": len(parts)}

    placed = []  # (page, X, Y, y_off, h, diffmask)
    for k, ((a, b), pno) in enumerate(zip(parts, page_nums)):
        pg = get_page(pno - 1)
        part = crop[a:b]
        guess = None
        if k == 0 and q.get("bbox"):
            x0, top = q["bbox"][0], q["bbox"][1]
            guess = (int(x0 * SCALE), int(top * SCALE))
        X, Y, mis = locate(part, pg.render(False), guess)
        if mis > 0.03:
            raise Fail(f"part{k}_not_located:{mis:.3f}")
        placed.append((pg, X, Y, a, b - a))

    # ---- rows (vector pages): option numbers inside this question's region
    vec_rows = []  # (pg, row, crop_y_offset, X, Y)
    for pg, X, Y, a, h in placed:
        x_lo, x_hi = X / SCALE, (X + W) / SCALE
        y_lo, y_hi = Y / SCALE, (Y + h) / SCALE
        for r in pg.rows:
            if x_lo - 1 <= r["x0"] <= x_hi and y_lo - 1 <= r["top"] and r["bottom"] <= y_hi + 1:
                vec_rows.append((pg, r, a, X, Y))
    any_key_objs = any(
        o.cls in ("R", "G") and not (o.x1 < X / SCALE or o.x0 > (X + W) / SCALE or o.bottom < Y / SCALE or o.top > (Y + h) / SCALE)
        for pg, X, Y, a, h in placed for o in pg.objs)

    # continuation lines of a coloured option can look like a number line; the real option
    # numbers share one column (within the tick/cross width difference)
    if len(vec_rows) > 4:
        med = float(np.median([r["x0"] for _, r, _, _, _ in vec_rows]))
        vec_rows = [v for v in vec_rows if abs(v[1]["x0"] - med) <= 4.0]
    boxes_crop = []  # icon boxes in crop px (x0, y0, x1, y1)
    line_bands = []  # per option row: (y0, y1) of its number line in crop px
    if family == "digialm":
        if len(vec_rows) == 4:
            info["mode"] = "vector"
            # hide icons, measure the icon column
            icon_boxes = []
            for pg, r, a, X, Y in vec_rows:
                later = [rr["top"] for pp, rr, _, _, _ in vec_rows if pp is pg and rr["top"] > r["bottom"]]
                if later:
                    r["_next_top"] = min(later)
                else:  # last row on its page: one typical row pitch
                    tops = sorted(rr["top"] for pp, rr, _, _, _ in vec_rows if pp is pg)
                    pitches = [b - a for a, b in zip(tops, tops[1:])]
                    r["_next_top"] = r["top"] + float(np.median(pitches)) if pitches else None
                icons = pg.icons_for(r, r["_next_top"])
                for o in icons:
                    pg.hide(o)
                    icon_boxes.append((pg, o.x0, o.top, o.x1, o.bottom, a, X, Y))
                    r.setdefault("_icon_dy", []).append((o.top + o.bottom) / 2 - (r["top"] + r["bottom"]) / 2)
                r["_icons"] = len(icons)
            # align the option numbers: shift each first line so all digits start at min x0
            if any(r["ref"] is None for _, r, _, _, _ in vec_rows):
                raise Fail("row_reference_missing")
            target = min(r["ref"] for _, r, _, _, _ in vec_rows)
            for i, (pg, r, a, X, Y) in enumerate(vec_rows):
                dx = target - r["ref"]
                r["_dx"] = dx
                if abs(dx) < 0.01 or r.get("_shifted") is not None:
                    continue
                nxt = None
                later = [rr for pp, rr, _, _, _ in vec_rows if pp is pg and rr["top"] > r["bottom"]]
                if later:
                    nxt = min(rr["top"] for rr in later)
                for o in pg.band_objs(r, nxt):
                    pg.translate(o, dx)
                r["_shifted"] = dx
                pg.invalidate()
            # numbers drawn as vector paths (2022): the producer snapped every glyph to its own
            # grid, so the shifted number sits ~0.1 pt off where a wrong option's number would.
            # Replace all four numbers with identical text objects at one x.
            if any(r["digit_obj"].type == 2 for _, r, _, _, _ in vec_rows):
                hs = [r["bottom"] - r["top"] for _, r, _, _, _ in vec_rows]
                size = float(np.median(hs)) / 0.72
                origin = target - 0.556 * size - 0.25
                for i, (pg, r, a, X, Y) in enumerate(vec_rows):
                    d = r["digit_obj"]
                    per = [o for o in pg.objs if pg._is_period(o, d)]
                    merged = [o for o in pg.objs if pg._is_period(o, d, True)] if not per else []
                    if not per and not merged:
                        raise Fail("path_number_period_missing")
                    pg.hide(d)
                    for o in per:
                        pg.hide(o)
                    # a period joined to the next glyph stays (aligned by the shift); the label
                    # then carries the digit only. Which rows are joined depends on the option
                    # text, not on the key.
                    pg.add_label(f"{i + 1}." if per else f"{i + 1}", origin, d.bottom, size)
                    r["_label"] = True
                pg.invalidate()
            # the icon column (union), one box size for every option row
            if icon_boxes:
                cx0 = min(b[1] for b in icon_boxes) - 1.0
                cx1 = max(b[3] for b in icon_boxes) + 1.0
                bh = max(b[4] - b[2] for b in icon_boxes) + 2.0
            else:
                raise Fail("no_icon_objects")
            left_digit = min(r["x0"] + r.get("_dx", 0.0) for _, r, _, _, _ in vec_rows)
            if cx1 - 1.0 > left_digit - 0.1:
                raise Fail(f"icon_column_overlaps_numbers:{cx0:.1f}-{cx1:.1f}:{left_digit:.1f}")
            cx1 = min(cx1, left_digit - 0.3)
            # one vertical offset (icon centre relative to the number) for every row
            dys = [dy for _, r, _, _, _ in vec_rows for dy in r.get("_icon_dy", [])]
            icon_dy = float(np.median(dys)) if dys else 0.0
            for pg, r, a, X, Y in vec_rows:
                cy = (r["top"] + r["bottom"]) / 2 + icon_dy
                y0 = a + int(round((cy - bh / 2) * SCALE)) - Y
                y1 = a + int(round((cy + bh / 2) * SCALE)) - Y
                boxes_crop.append((int(cx0 * SCALE) - X, y0, int(np.ceil(cx1 * SCALE)) - X, y1))
            for pg, r, a, X, Y in vec_rows:
                line_bands.append((a + int((r["top"] - 1.0) * SCALE) - Y, a + int(np.ceil((r["bottom"] + 1.0) * SCALE)) - Y))
            info["rows"] = [{"digit": r["digit"], "dx_pt": round(r.get("_dx", 0.0), 2),
                             "icons": r.get("_icons", 0)} for _, r, _, _, _ in vec_rows]
            info["rows_ok"] = True
        elif any_key_objs:
            raise Fail(f"vector_rows:{len(vec_rows)}")
        else:
            info["mode"] = "raster"
    else:
        info["mode"] = "vector" if any(pg.has_text for pg, *_ in placed) else "raster"

    # ---- assemble the clean crop from the edited renders
    out = np.full_like(crop, 255)
    orig_assembled = np.full_like(crop, 255)
    ca_seen = False
    ca_cut = None
    for pg, X, Y, a, h in placed:
        for arr, dst in ((pg.render(True), out), (pg.render(False), orig_assembled)):
            H2, W2 = arr.shape[:2]
            sub = arr[Y:min(Y + h, H2), X:min(X + W, W2)]
            dst[a:a + sub.shape[0], :sub.shape[1]] = sub
        # the extractor's ID-box blanking and right padding: wherever the crop differs from
        # the untouched render, the crop was painted white -> paint the clean crop white too
        part_orig = crop[a:a + h]
        diff = np.abs(orig_assembled[a:a + h].astype(np.int16) - part_orig.astype(np.int16)).max(axis=2) > 12
        if diff.any():
            ys, xs = np.nonzero(diff)
            # the extractor blanks a rectangle to the right edge
            blank = np.zeros_like(diff)
            blank[ys.min():ys.max() + 1, xs.min():] = True
            blank &= (part_orig.min(axis=2) >= 250)
            out[a:a + h][blank | diff] = 255
        # label boxes found in the text layer
        for rx0, rt, rx1, rb in pg.blank_rects:
            x0p, x1p = int(rx0 * SCALE) - X, int(np.ceil(rx1 * SCALE)) - X
            y0p, y1p = int(rt * SCALE) - Y, int(np.ceil(rb * SCALE)) - Y
            if y1p <= 0 or y0p >= h or x1p <= 0:
                continue
            out[a + max(0, y0p):a + min(h, y1p), max(0, x0p):min(W, x1p)] = 255
        # 2016-17: everything from the "Correct Answer" line down belongs to the key (the answer
        # can be an image, possibly continued on the next page): blank to the end of the crop
        if ca_seen:
            out[a:a + h, :] = 255
        for ct in pg.ca_tops:
            y0p = int(ct * SCALE) - Y - 4
            if -4 <= y0p < h:
                out[a + max(0, y0p):a + h, :] = 255
                if not ca_seen:
                    ca_cut = a + max(0, y0p)
                ca_seen = True
    # ---- print furniture (browser header/footer: URL, print time, page counter). A zone inside
    # the crop must already be blank in the ORIGINAL crop (else the original is not servable);
    # in the clean crop it is blanked here, whatever the original shows.
    furn = []
    q_marks, qid_marks, opt_marks = 0, 0, set()
    for pg, X, Y, a, h in placed:
        for zt, zb in pg.furniture_zones():
            r0, r1 = max(0, int(zt * SCALE) - Y), min(h, int(np.ceil(zb * SCALE)) - Y)
            if r1 <= r0:
                continue
            if bool((crop[a + r0:a + r1].min(axis=2) < 235).any()):
                furn.append(f"p{pg.index + 1}:{zt:.0f}-{zb:.0f}pt")
            out[a + r0:a + r1] = 255
        # question markers printed in the text layer inside this part
        x_lo, x_hi, y_lo, y_hi = X / SCALE - 1, (X + W) / SCALE, Y / SCALE - 1, (Y + h) / SCALE
        inside = lambda m: x_lo <= m[0] <= x_hi and y_lo <= m[1] <= y_hi  # noqa: E731
        if family == "qid":
            qid_marks += sum(1 for m in pg.text_marks(QID_MARK_RE) if inside(m))
            opt_marks.update(m[2].strip()[0] for m in pg.text_marks(QID_OPT_RE) if inside(m))
        else:
            q_marks += sum(1 for m in pg.text_marks(Q_TEXT_RE) if inside(m))
    info["furniture_in_original"] = furn
    info["q_markers_text"] = q_marks
    if family == "qid":
        info["rows_ok"] = qid_marks == 1 and opt_marks == {"1", "2", "3", "4"}
        info["qid_markers"] = qid_marks
        info["option_markers"] = sorted(opt_marks)
    elif q_marks > 1:
        info["rows_ok"] = False
    for (a, b) in parts[1:]:
        out[a - GAP_ROWS:a] = GAP_VALUE  # keep the extractor's part separator
    if family == "qid":
        if not ca_seen:
            raise Fail("qid_correct_answer_line_not_found")
        # cut the image at the "Correct Answer" line: the height of the blanked answer block
        # would otherwise hint at the length of the correct option
        cut = max(1, ca_cut)
        while cut > 1 and np.all(out[cut - 1] == GAP_VALUE):
            cut -= 1  # no dangling part separator
        out = np.ascontiguousarray(out[:cut])

    # ---- raster rows: icons from key-colour pixels in the ORIGINAL crop. In scans the option
    # numbers are key-coloured pixels too, and the green ones are printed lighter than the red
    # ones, so no threshold gives them equal weight. The whole icon + number zone is therefore
    # blanked (one box size for every row) and neutral labels "1." .. "4." are drawn instead.
    labels = []  # (text, x_right, y_centre, px height)
    if family == "digialm" and info["mode"] == "raster":
        icons = raster_icons(crop)
        if len(icons) != 4:
            raise Fail(f"raster_icons:{len(icons)}")
        xs0 = [b[0] for b in icons]
        if max(xs0) - min(xs0) > 14:
            raise Fail("raster_icons_not_aligned")
        ys = [(b[1] + b[3]) / 2 for b in icons]
        if min(ys[i + 1] - ys[i] for i in range(3)) < 20:
            raise Fail("raster_icons_overlap")
        cx0 = min(xs0) - 3
        icon_x1 = max(b[2] for b in icons)
        bh = max(b[3] - b[1] for b in icons) + 6
        a16 = crop.astype(np.int16)
        ink = ink_mask(a16)
        ends, digit_h, text_starts = [], [], []
        for b in icons:
            cy = (b[1] + b[3]) // 2
            y0, y1 = max(0, cy - bh // 2), cy + bh // 2
            prof = ink[y0:y1, icon_x1 + 1:icon_x1 + 80].any(axis=0)
            cols = np.where(prof)[0]
            if cols.size == 0 or cols[0] > 25:
                raise Fail("raster_number_not_found")
            run_end = cols[0]
            nxt = None
            for c in cols[1:]:
                if c - run_end > 5:
                    nxt = c
                    break
                run_end = c
            if run_end - cols[0] > 30:
                raise Fail("raster_number_too_wide")
            ends.append(icon_x1 + 1 + int(run_end))
            text_starts.append(icon_x1 + 1 + int(nxt) if nxt is not None else None)
            rows_ = np.where(ink[y0:y1, icon_x1 + 1 + int(cols[0]):icon_x1 + 2 + int(run_end)].any(axis=1))[0]
            if rows_.size:
                digit_h.append(int(rows_[-1] - rows_[0] + 1))
        zone_x1 = max(ends) + 3
        # Scans whose option TEXT (not just the number) is green/red: the green text is printed
        # lighter and comes out measurably bolder after any binarisation (leak test: the correct
        # option's stroke width is above its neighbours' in 94% of such crops). No clean crop.
        text_key = int(key_mask(crop[:, zone_x1 + 5:]).sum())
        if text_key > 200:
            raise Fail(f"raster_coloured_option_text:{text_key}")
        for b in icons:  # the zone edge must fall in the gap before every option's text
            cy = (b[1] + b[3]) // 2
            y0, y1 = max(0, cy - bh // 2), cy + bh // 2
            if ink[y0:y1, zone_x1 - 1:zone_x1 + 2].any():
                raise Fail(f"raster_number_zone_hits_text:{ends}:{text_starts}")
        for b in icons:
            cy = (b[1] + b[3]) // 2
            y0, y1 = max(0, cy - bh // 2), cy + bh // 2
            boxes_crop.append((cx0, y0, zone_x1, y1))
        # label baseline = each row's number baseline, measured on the colour-normalised
        # binarisation (so a lighter green number does not measure differently)
        binf = binarise_fwhm(crop) < 128
        dh = int(np.median(digit_h)) if digit_h else 12
        for i, b in enumerate(icons):
            cy = (b[1] + b[3]) // 2
            y0, y1 = max(0, cy - bh // 2), cy + bh // 2
            rr = np.where(binf[y0:y1, icon_x1 + 1:zone_x1].any(axis=1))[0]
            base = y0 + int(rr[-1]) + 1 if rr.size else cy + dh // 2
            labels.append((f"{i + 1}.", zone_x1 - 2, base, max(9, min(18, dh))))
            line_bands.append((base - int(dh * 1.6) - 2, base + 4))
        info["rows"] = [{"icon_box": list(b)} for b in icons]
        info["number_zone"] = [int(cx0), int(zone_x1)]
        info["rows_ok"] = True
        # verify: no key-colour pixels left in the icon column outside the boxes
        km = key_mask(crop)
        col = km[:, max(0, cx0 - 4):zone_x1].copy()
        for (bx0, by0, bx1, by1) in boxes_crop:
            col[max(0, by0):max(0, by1), :] = False
        top_y = min(b[1] for b in icons) - bh
        bot_y = max(b[3] for b in icons) + bh
        if col[max(0, top_y):max(0, bot_y)].sum() > 6:
            raise Fail("raster_icon_column_residue")

    # ---- belt and braces: the white icon column boxes (one size for all options)
    for (bx0, by0, bx1, by1) in boxes_crop:
        pre = out[max(0, by0):max(0, by1), max(0, bx0):max(0, bx1)]
        if info["mode"] == "vector" and pre.size and (pre.min(axis=2) < 150).sum() > 3:
            raise Fail(f"icon_box_not_blank_before_paint:{(bx0, by0, bx1, by1)}:{pre.shape}")
        out[max(0, by0):max(0, by1), max(0, bx0):max(0, bx1)] = 255

    # ---- colour
    residue = int(key_mask(out).sum())
    info["key_px_after_objects"] = residue
    if info["mode"] == "raster" or residue > 0:
        gray = binarise_fwhm(out)
        img = Image.fromarray(gray).convert("1")
        info["output"] = "1bit"
    else:
        gray = cv2.cvtColor(np.ascontiguousarray(out), cv2.COLOR_RGB2GRAY)
        img = Image.fromarray(gray, mode="L")
        info["output"] = "L"

    # ---- checks on the final image (before the neutral labels are drawn)
    final = np.asarray(img.convert("L"))
    for (bx0, by0, bx1, by1) in boxes_crop:
        reg = final[max(0, by0):max(0, by1), max(0, bx0):max(0, bx1)]
        if reg.size and reg.min() < 250:
            raise Fail("icon_box_not_blank")
    if labels:
        img = draw_labels(img, labels)
        final = np.asarray(img.convert("L"))
    rgb_final = np.asarray(img.convert("RGB")).astype(np.int16)
    if int((rgb_final.max(axis=2) - rgb_final.min(axis=2) > 30).sum()):
        raise Fail("colour_left")
    if ocr:
        hits, _, txt = pii_hits(img, PII_CLEAN)  # tesseract psm 6 + psm 11
        for rx in FORBIDDEN:
            if rx.search(txt):
                raise Fail(f"ocr_forbidden:{rx.pattern}")
        info["ocr_chars"] = len(txt.strip())
        if hits:
            raise Fail(f"print_furniture:{','.join(hits)}")

    # geometry for the leak test (final image), measured on each option's number line
    if boxes_crop and len(line_bands) == len(boxes_crop):
        info["feats"] = [row_features(final, bx1, y0, y1) for (_, _, bx1, _), (y0, y1) in zip(boxes_crop, line_bands)]
    return img, info


def original_checks(orig: Image.Image, info: dict, ocr: bool) -> dict:
    """original_ok: the ORIGINAL crop (it shows SSC's tick) may be served after the learner
    answers only when (i) the row checks proved it holds exactly one question -- four option
    rows (digialm: number glyphs or icons; 2016-17 listings: "1)".."4)" in the text layer),
    one question marker ("Q.n" / "QID") -- (ii) tesseract (psm 6 and 11) finds no candidate or
    print data in it (Chosen Option, Status, Question ID, Candidate, Roll, Venue, Application,
    http/www/digialm/://.com, a print timestamp, a trailing page counter), and (iii) no print
    header/footer zone inside it shows ink."""
    why = []
    if info.get("rows_ok") is not True:
        why.append("rows_not_proven")
    if info.get("furniture_in_original"):
        why.append("furniture_zone_not_blank:" + ";".join(info["furniture_in_original"][:3]))
    if not ocr:
        why.append("ocr_check_skipped")
        return {"original_ok": False, "original_checks": {"why_false": why}}
    hits, qm, _ = pii_hits(orig, PII_STRICT)
    if hits:
        why.append("ocr:" + ",".join(hits))
    if qm > 1:
        why.append(f"q_markers:{qm}")
    return {"original_ok": not why, "original_checks": {"why_false": why} if why else {"q_markers_ocr": qm}}


# ------------------------------------------------------------------ per parsed file
def status_kind(parsed_path: Path, parsed: dict) -> str | None:
    src = Path(parsed["source"]["file"])
    cand = STATUS / f"{parsed['source'].get('publisher', src.parent.name)}__{src.stem}.json"
    try:
        return json.loads(cand.read_text()).get("kind")
    except Exception:
        return None


def declared_zones(parsed: dict) -> dict:
    """The extractor's print-furniture zones for this source, per page size ("612x792": {head, foot})."""
    src = Path(parsed["source"]["file"])
    st = STATUS / f"{parsed['source'].get('publisher', src.parent.name)}__{src.stem}.json"
    try:
        return json.loads(st.read_text()).get("print_furniture", {}).get("groups", {})
    except Exception:
        return {}


def process_file(parsed_path: str, manifest: dict, force: bool, ocr: bool) -> dict:
    parsed_path = Path(parsed_path)
    parsed = json.loads(parsed_path.read_text())
    src = REPO / parsed["source"]["file"]
    fam = family_of(parsed, status_kind(parsed_path, parsed))
    results = {}
    todo = []
    for q in parsed["questions"]:
        crop_rel = q.get("crop")
        if not crop_rel:
            continue
        crop_path = REPO / crop_rel
        rel = Path(crop_rel).relative_to("data/storage/pyp-crops").as_posix()
        out_path = CLEAN / rel
        if not crop_path.exists():
            results[rel] = {"status": "failed", "reason": "crop_missing", "family": fam}
            continue
        fp, crop_sha = fingerprint(parsed, q, crop_path, ocr)
        prev = manifest.get(rel)
        # a deterministic failure is cached like a success; an unexpected error is retried
        retry = prev is not None and str(prev.get("reason", "")).startswith("error")
        if not force and prev and not retry and prev.get("fp") == fp and (prev["status"] != "ok" or out_path.exists()):
            results[rel] = prev
            continue
        todo.append((q, crop_path, out_path, rel, fp, crop_sha))
    if not todo:
        return {"file": parsed_path.name, "results": results}

    doc_orig = pdfium.PdfDocument(str(src))
    doc_clean = pdfium.PdfDocument(str(src))
    cache: dict[int, Page] = {}

    declared = declared_zones(parsed)

    def get_page(i):
        if i not in cache:
            if len(cache) > 8:
                old = min(cache)
                cache.pop(old)
            pg = Page(doc_orig, doc_clean, i, fam)
            z = declared.get(f"{round(pg.width)}x{round(pg.height)}", {})
            pg.declared_zones = ([(0.0, float(z["head"]))] if "head" in z else []) + \
                ([(float(z["foot"]), pg.height)] if "foot" in z else [])
            cache[i] = pg
        return cache[i]

    for q, crop_path, out_path, rel, fp, crop_sha in todo:
        entry = {"fp": fp, "crop_sha256": crop_sha, "family": fam, "paper_key": parsed["paper"].get("paper_key"),
                 "position": q["position"], "key": q["key"].get("printed_number"),
                 "text_quality": q.get("text_quality"), "has_figure": q.get("has_figure")}
        entry["original_ok"] = False  # proven below, or stays false
        try:
            crop = np.asarray(Image.open(crop_path).convert("RGB"))
            img, info = clean_question(q, fam, cache, get_page, crop, ocr)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = out_path.with_suffix(".tmp.png")
            img.save(tmp, optimize=True)
            os.replace(tmp, out_path)
            clean_sha = hashlib.sha256(out_path.read_bytes()).hexdigest()
            entry.update({"status": "ok", "clean_sha256": clean_sha, **info})
            entry.update(original_checks(Image.fromarray(crop), info, ocr))
        except Fail as e:
            entry.update({"status": "failed", "reason": str(e), "original_checks": {"why_false": "clean_failed"}})
            if out_path.exists():
                out_path.unlink()
        except Exception as e:  # never leave a half-checked crop behind
            entry.update({"status": "failed", "reason": f"error:{type(e).__name__}:{e}"[:300],
                          "original_checks": {"why_false": "clean_failed"}})
            if out_path.exists():
                out_path.unlink()
        results[rel] = entry
    return {"file": parsed_path.name, "results": results}


# ------------------------------------------------------------------ leak report
def leak_report(manifest: dict) -> dict:
    """Could the key be read off the clean crops? For each group of like crops and each
    per-option measurement (number x, number ink, number darkness, stroke width of the first
    line, row centre gap), an attacker who knows the typical value of every option slot when
    it is WRONG picks the option that deviates most. Chance is 25%; a leak shows well above.
    'effect' is (mean when correct - mean when wrong) / sd, pooled over slots."""
    groups: dict[str, list] = {}
    for e in manifest.values():
        if e.get("status") != "ok" or not e.get("feats") or not e.get("key") or len(e["feats"]) != 4:
            continue
        pk = e.get("paper_key") or "?"
        parts = pk.split("-")
        year = parts[3] if len(parts) > 3 else "?"
        grp = f"{e['family']}/{e.get('mode')}/{year}/{parts[-1]}"
        groups.setdefault(grp, []).append(e)
    out = {}
    for grp, es in sorted(groups.items()):
        res = {"n": len(es)}
        for feat in ("x", "dig_ink", "dig_dark", "width", "gap"):
            def val(e, k):
                fs = e["feats"]
                if feat == "gap":
                    return fs[k]["yc"] - fs[k - 1]["yc"] if k > 0 else None
                return fs[k].get(feat)
            wrong: dict[int, list] = {k: [] for k in range(4)}
            right: dict[int, list] = {k: [] for k in range(4)}
            for e in es:
                for k in range(4):
                    v = val(e, k)
                    if v is not None:
                        (right if e["key"] == k + 1 else wrong)[k].append(float(v))
            mu = {k: (float(np.mean(v)) if v else None) for k, v in wrong.items()}
            # sd floor: deterministic renders make some slots constant; a 2% / 1-unit floor
            # keeps a single odd value from dominating the effect size
            sd = {k: max(float(np.std(v)), 0.02 * abs(mu[k]), 1.0) if len(v) > 1 else None
                  for k, v in wrong.items()}
            hits = n = 0.0
            for e in es:
                zs = []
                for k in range(4):
                    v = val(e, k)
                    if v is None or mu[k] is None or sd[k] is None:
                        zs.append(None)
                    else:
                        zs.append(abs(v - mu[k]) / sd[k])
                valid = [z for z in zs if z is not None]
                if len(valid) < 3:
                    continue
                best = max(valid)
                ties = [k for k, z in enumerate(zs) if z is not None and z == best]
                n += 1
                if e["key"] - 1 in ties:
                    hits += 1.0 / len(ties)
            effs = []
            for k in range(4):
                if right[k] and wrong[k] and sd[k]:
                    effs.append((float(np.mean(right[k])) - mu[k]) / sd[k])
            res[feat] = {"n": int(n), "hit_rate": round(hits / n, 3) if n else None,
                         "effect": round(float(np.mean(effs)), 3) if effs else None}
        out[grp] = res
    return out


def write_report(manifest: dict) -> dict:
    ok = sum(1 for e in manifest.values() if e.get("status") == "ok")
    failed = {k: e.get("reason") for k, e in manifest.items() if e.get("status") != "ok"}
    reasons: dict[str, int] = {}
    for r in failed.values():
        key = (r or "?").split(":")[0]
        reasons[key] = reasons.get(key, 0) + 1
    by_family: dict[str, dict] = {}
    for e in manifest.values():
        pk = e.get("paper_key") or "?"
        d = by_family.setdefault(pk, {"ok": 0, "failed": 0})
        d["ok" if e.get("status") == "ok" else "failed"] += 1
    orig_true = sum(1 for e in manifest.values() if e.get("original_ok") is True)
    why_false: dict[str, int] = {}
    for e in manifest.values():
        if e.get("original_ok") is True:
            continue
        w = (e.get("original_checks") or {}).get("why_false") or ["unknown"]
        for x in ([w] if isinstance(w, str) else w):
            k = x.split(":")[0] if not x.startswith("ocr:") else "ocr:" + ",".join(sorted({h.split(":")[0] for h in x[4:].split(",")}))
            why_false[k] = why_false.get(k, 0) + 1
    rep = {"version": VERSION, "crops_ok": ok, "crops_failed": len(failed), "fail_reasons": reasons,
           "original_ok": {"true": orig_true, "false": len(manifest) - orig_true,
                           "why_false": dict(sorted(why_false.items(), key=lambda kv: -kv[1]))},
           "by_paper": by_family, "leak_test": leak_report(manifest),
           "failed": dict(sorted(failed.items()))}
    REPORT.write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    return rep


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-ocr", action="store_true", help="skip the tesseract check (NOT for production output)")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--workers", type=int, default=int(os.environ.get("REDACT_WORKERS", "6")))
    args = ap.parse_args(argv)

    CLEAN.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    if args.report:
        rep = write_report(manifest)
        print(json.dumps({k: rep[k] for k in ("crops_ok", "crops_failed", "fail_reasons", "original_ok", "leak_test")}, indent=1))
        return 0
    if args.no_ocr:
        print("warning: --no-ocr skips a required check", file=sys.stderr)
    files = [Path(f).resolve() for f in args.files] if args.files else sorted(
        p for p in PARSED.glob("*.json") if not p.name.startswith("_"))
    todo = [str(f) for f in files]
    done = 0
    failed_files = 0
    results_by_file: dict[str, list] = {}
    with ProcessPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = {ex.submit(process_file, f, manifest, args.force, not args.no_ocr): f for f in todo}
        for fut in as_completed(futs):
            try:
                res = fut.result()
            except Exception as e:  # a broken parsed file must not stop the rest
                print(f"FAILED {futs[fut]}: {e}", file=sys.stderr)
                failed_files += 1
                continue
            manifest.update(res["results"])
            results_by_file[futs[fut]] = list(res["results"])
            done += 1
            ok = sum(1 for e in res["results"].values() if e.get("status") == "ok")
            print(f"[{done}/{len(todo)}] {res['file']}: {ok}/{len(res['results'])} clean", flush=True)
            tmp = MANIFEST.with_suffix(".tmp")
            tmp.write_text(json.dumps(manifest, indent=0, ensure_ascii=False))
            os.replace(tmp, MANIFEST)
    # a full run owns the whole folder: forget crops no parsed file refers to any more
    if not args.files and not failed_files:
        seen = set()
        for f in todo:
            seen.update(results_by_file.get(f, ()))
        for rel in [r for r in manifest if r not in seen]:
            p = CLEAN / rel
            if p.exists():
                p.unlink()
            del manifest[rel]
    # drop manifest rows whose clean file should not exist any more
    for rel, e in manifest.items():
        p = CLEAN / rel
        if e.get("status") != "ok" and p.exists():
            p.unlink()
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, indent=0, ensure_ascii=False))
    os.replace(tmp, MANIFEST)
    rep = write_report(manifest)
    print(json.dumps({k: rep[k] for k in ("crops_ok", "crops_failed", "fail_reasons", "original_ok")}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
