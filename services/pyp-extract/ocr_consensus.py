"""Two-engine OCR for text that exists only as pixels.

A single OCR engine is confidently wrong often enough on these low-resolution
bitmaps ("1006 mm" for "100 mm", "T%" for "7%") that its output cannot be
trusted on its own. So each text line is read by two independent engines --
tesseract (LSTM, eng) and PaddleOCR's PP-OCRv5 English recogniser -- and a
region's text is accepted only when every line agrees after canonicalisation
(whitespace, quote and dash variants ignored). Otherwise the text is null and
the crop remains the only source of truth.
"""
from __future__ import annotations

import os
import re
import unicodedata

import numpy as np

from pages import Renderer, render_page, tesseract_tsv
from wordcheck import is_fragment

OCR_SCALE = 300 / 72
LINE_OCR_VERSION = 1  # bump when the engines, their settings or the line binarisation change

_PADDLE = None
_PADDLE_ERR = None


def paddle():
    global _PADDLE, _PADDLE_ERR
    if _PADDLE is None and _PADDLE_ERR is None:
        try:
            os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
            import logging
            logging.disable(logging.WARNING)
            from paddleocr import TextRecognition

            _PADDLE = TextRecognition(model_name="en_PP-OCRv5_mobile_rec")
        except Exception as e:  # pragma: no cover - environment dependent
            _PADDLE_ERR = f"{type(e).__name__}: {e}"
    return _PADDLE


def canon(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[‘’`´′]", "'", s)
    s = re.sub(r"[“”″]", '"', s)
    s = re.sub(r"[–—−‐‑]", "-", s)
    s = re.sub(r"\s+", "", s)
    return s[:-1] if s.endswith(".") else s  # a dropped final full stop is not a disagreement


def line_bands(dark: np.ndarray, min_h: int = 8) -> list[tuple[int, int]]:
    """Split a binarised region into text-line bands by horizontal projection."""
    rows = (dark < 170).sum(axis=1) > max(1, int(0.002 * dark.shape[1]))
    bands, start = [], None
    for y, on in enumerate(rows):
        if on and start is None:
            start = y
        elif not on and start is not None:
            bands.append([start, y])
            start = None
    if start is not None:
        bands.append([start, len(rows)])
    # merge bands separated by tiny gaps (super/subscripts, descenders)
    if not bands:
        return []
    med = float(np.median([b - a for a, b in bands]))
    merged = []
    for b in bands:
        small = min(b[1] - b[0], merged[-1][1] - merged[-1][0]) < 0.55 * med if merged else False
        if merged and b[0] - merged[-1][1] <= 6 and small:
            merged[-1][1] = b[1]  # super/subscript or accent fragment
        else:
            merged.append(b)
    return [(a, b) for a, b in merged if b - a >= min_h]


def has_script(band: np.ndarray) -> bool:
    """True if a line image contains a glyph shifted up (superscript) or down
    (subscript) relative to the line: its top AND bottom are both displaced
    by >= 30 % of the typical glyph height. Displacement, not size, is used
    because the low-resolution bitmaps render exponents nearly full size and
    break ordinary glyphs into small pieces. Quotes/degree signs larger than
    40 % of a glyph are also caught -- a conservative false positive."""
    import cv2

    ink = (band < 150).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, 8)
    H = band.shape[0]
    comps = [st[c] for c in range(1, n)
             if st[c, cv2.CC_STAT_AREA] >= 4 and not (st[c, 2] <= 3 and st[c, 3] >= 0.9 * H)]
    # re-join glyphs that the low-resolution bitmap broke into pieces
    # (pieces overlap horizontally)
    comps = sorted(([int(c[0]), int(c[1]), int(c[0] + c[2]), int(c[1] + c[3])] for c in comps), key=lambda b: b[0])
    merged = []
    for b in comps:
        for m in merged:
            ov = min(m[2], b[2]) - max(m[0], b[0])
            if ov >= 0.5 * min(m[2] - m[0], b[2] - b[0]):
                m[0], m[1], m[2], m[3] = min(m[0], b[0]), min(m[1], b[1]), max(m[2], b[2]), max(m[3], b[3])
                break
        else:
            merged.append(b)
    comps = [(b[0], b[1], b[2] - b[0], b[3] - b[1], 0) for b in merged]
    if len(comps) < 3:
        return False
    typ = float(np.percentile([c[3] for c in comps], 75))
    if typ < 8:
        return False
    big = [c for c in comps if c[3] >= 0.8 * typ]
    base = float(np.median([c[1] + c[3] for c in big]))
    top = float(np.median([c[1] for c in big]))
    for x, y, w, h, a in comps:
        if h < 0.4 * typ:
            continue
        if y < top - 0.3 * typ and y + h < base - 0.3 * typ:
            return True
        if y > top + 0.3 * typ and y + h > base + 0.3 * typ:
            return True
    return False


class PageOCR:
    def __init__(self, renderer: Renderer):
        self.renderer = renderer
        self._page = None
        self._img = None

    def _render(self, page):
        if self._page != page:
            self._img = render_page(self.renderer.doc, page, OCR_SCALE)
            self._page = page
        return self._img

    def read_regions(self, page: int, boxes: dict, strip_option_number: set | None = None,
                     cache: dict | None = None) -> dict:
        """boxes: {name: (page, x0, top, x1, bottom)} in points.
        Returns {name: {"text": str|None, "reason": str, "lines": n}}. `cache` maps a line
        image's hash to an earlier (tesseract, paddle, paddle score) reading; readings made
        now are left in self.new_entries for the caller to store."""
        img = self._render(page)
        H, W = img.shape[:2]
        dark = img.min(axis=2)
        items = []  # (name, line_img)
        flagged: set[str] = set()
        for name, (_, x0, top, x1, bottom) in boxes.items():
            X0, X1 = max(0, int(x0 * OCR_SCALE)), min(W, int(x1 * OCR_SCALE))
            Y0, Y1 = max(0, int(top * OCR_SCALE)), min(H, int(bottom * OCR_SCALE))
            if X1 <= X0 or Y1 <= Y0:
                continue
            reg = dark[Y0:Y1, X0:X1].copy()
            # erase vertical rules (frame edges, image borders) running through the region
            if reg.shape[0] > 20:
                reg[:, (reg < 170).mean(axis=0) > 0.8] = 255
            # trim empty columns so each line image is tight
            cols = np.where((reg < 170).any(axis=0))[0]
            if cols.size == 0:
                continue
            reg = reg[:, max(0, cols[0] - 4): cols[-1] + 5]
            for a, b in line_bands(reg):
                band = reg[max(0, a - 3): b + 3]
                items.append((name, band.astype(np.uint8)))
                if has_script(band):
                    flagged.add(name)
        out = {n: {"text": None, "reason": "no_ink", "lines": 0} for n in boxes}
        self.new_entries = {}
        if not items:
            return out
        from ocr_cache import image_key
        keys = [image_key(im) for _, im in items]
        cache = cache if cache is not None else {}
        need = [i for i, k in enumerate(keys) if k not in cache]
        readings: dict[int, tuple] = {i: cache[k] for i, k in enumerate(keys) if k in cache}
        if need:
            tess = self._tesseract_lines([items[i][1] for i in need])
            pad = paddle()
            if pad is None:
                for n in boxes:
                    out[n]["reason"] = f"second_ocr_engine_unavailable:{_PADDLE_ERR}"
                return out
            # paddle reads the binarised line, tesseract the grey one: the two
            # engines also see slightly different inputs, keeping their errors apart
            rgb = [np.stack([np.where(items[i][1] < 170, 0, 255).astype(np.uint8)] * 3, axis=2) for i in need]
            pres = pad.predict(rgb, batch_size=1)
            for i, t, r in zip(need, tess, pres):
                readings[i] = (t, r["rec_text"], float(r["rec_score"]))
                self.new_entries[keys[i]] = readings[i]
        per: dict[str, list] = {}
        for i, (name, _) in enumerate(items):
            per.setdefault(name, []).append(readings[i])
        strip_option_number = strip_option_number or set()
        rx = re.compile(r"^\s*[1-4][.,:]\s*")
        for name, lines in per.items():
            if name in flagged:
                # both engines flatten exponents/subscripts ("m³" -> "m3",
                # "10⁻³" -> "10-3"), so agreement would not make it true
                out[name] = {"text": None, "reason": "superscript_or_subscript_in_image_text", "lines": len(lines)}
                continue
            if name in strip_option_number and lines:
                t0, p0, s0 = lines[0]
                if rx.match(t0) and rx.match(p0):
                    lines[0] = (rx.sub("", t0), rx.sub("", p0), s0)
                else:
                    out[name] = {"text": None, "reason": f"option_number_not_read:{t0[:20]!r}|{p0[:20]!r}", "lines": len(lines)}
                    continue
            agree = all(canon(t) == canon(p) and canon(t) for t, p, _ in lines)
            frag = next(((t, f) for t, _, _ in lines for f in [is_fragment(t)] if f), None) if agree else None
            if agree and frag:
                # both engines read the same cut-off pixels: a line that starts inside a word
                # ("t watering" for "the first watering") is not the printed text
                out[name] = {"text": None, "reason": f"first_token_word_fragment:{frag[1]!r} in {frag[0][:40]!r}",
                             "lines": len(lines), "fragment_lines": sum(1 for t, _, _ in lines if is_fragment(t))}
            elif agree:
                out[name] = {"text": "\n".join(t for t, _, _ in lines), "reason": "tesseract+paddle_agree",
                             "lines": len(lines)}
            else:
                bad = next((t, p) for t, p, _ in lines if canon(t) != canon(p) or not canon(t))
                out[name] = {"text": None, "reason": f"ocr_engines_disagree:{bad[0]!r}|{bad[1]!r}"[:160],
                             "lines": len(lines)}
        return out

    @staticmethod
    def _tesseract_lines(imgs: list[np.ndarray]) -> list[str]:
        """Read many single-line images in one tesseract call by stacking them."""
        if not imgs:
            return []
        gap = 40
        width = max(im.shape[1] for im in imgs) + 2 * gap
        offs, parts, y = [], [], gap
        parts.append(np.full((gap, width), 255, np.uint8))
        for im in imgs:
            h, w = im.shape
            row = np.full((h, width), 255, np.uint8)
            row[:, gap:gap + w] = im
            parts.append(row)
            parts.append(np.full((gap, width), 255, np.uint8))
            offs.append((y, y + h))
            y += h + gap
        canvas = np.concatenate(parts, axis=0)
        rows = tesseract_tsv(np.stack([canvas] * 3, axis=2), psm=6)
        texts = [[] for _ in imgs]
        for r in rows:
            cy = r["top"] + r["height"] / 2
            for i, (a, b) in enumerate(offs):
                if a - gap / 2 <= cy < b + gap / 2:
                    texts[i].append((r["left"], r["text"]))
                    break
        return [" ".join(t for _, t in sorted(ws)) for ws in texts]
