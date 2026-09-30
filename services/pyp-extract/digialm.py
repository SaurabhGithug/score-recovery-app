"""Parser for SSC / TCS-iON "digialm" candidate response sheets.

Input: PageData list (text-layer or OCR tokens). Output: list of Shift dicts
with questions, each question carrying the two independent key signals.

Layout facts this relies on (verified on the 2018-2024 files):
  * a question starts with "Q.<n>" at the left margin; numbering restarts per
    section in 2018-2021 papers, so position is assigned sequentially;
  * the options follow an "Ans" label, one per line, numbered "1." .. "4.";
    each option number (and its text, when text) is filled GREEN for the key
    and RED otherwise;
  * a tick / cross icon sits immediately left of each option number (or, when
    the option is a tall figure, left of the figure's middle) -- so the icon
    for option k is searched between option k's number and option k+1's;
  * the "Question ID / Option n ID / Status / Chosen Option" box is to the
    right; its values other than the IDs are never emitted.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

from common import OPTION_IDS, pixel_masks
from pages import Box, PageData, Renderer, Token

# ------------------------------------------------------------------ regexes
RE_Q = re.compile(r"^Q\.?\s?(\d{1,3})\.?$")
RE_Q_OCR = re.compile(r"^[QO0][.,:]?\s?(\d{1,3})[.,]?$")
OCR_DIGITS = str.maketrans({"§": "5", "S": "5", "s": "5", "O": "0", "o": "0", "l": "1", "I": "1", "|": "1",
                            "B": "8", "Z": "2", "z": "2", "g": "9", "q": "9", "?": "7"})
KNOWN_SECTIONS = re.compile(r"(General\s+Intelligence.*|General\s+Awareness.*|(Part\s*-?\s*A\s+)?General\s+Engineering.*)", re.I)
RE_OPT = re.compile(r"^([1-4])[.,](.*)$")
RE_OPT_OCR = re.compile(r"^([1-4])(?:[.,:](.*))?$")
HEADER_LABELS = [
    ("roll", re.compile(r"^Roll\s*(Number|No\.?)", re.I)),
    ("registration", re.compile(r"^Registration\s*No", re.I)),
    ("candidate", re.compile(r"^(Candidate\s*)?Name\b", re.I)),
    ("venue", re.compile(r"^(Venue\s*Name|Test\s*Venue)", re.I)),
    ("date", re.compile(r"^(Exam|Test)\s*Date", re.I)),
    ("time", re.compile(r"^(Exam|Test)\s*Time", re.I)),
    ("subject", re.compile(r"^Subject\b", re.I)),
]
IDBOX_LABEL = re.compile(r"^(Question\s*ID|Option\s*\d\s*ID|Status|Chosen\s*Option|Not\s*Attempted|Marked\s*For|Answered|Not\s*Answered)", re.I)


@dataclass
class Line:
    page: int
    tokens: list[Token]

    @property
    def top(self):
        return min(t.top for t in self.tokens)

    @property
    def bottom(self):
        return max(t.bottom for t in self.tokens)

    @property
    def x0(self):
        return min(t.x0 for t in self.tokens)

    @property
    def x1(self):
        return max(t.x1 for t in self.tokens)

    @property
    def text(self):
        return " ".join(t.text for t in self.tokens)


def build_lines(tokens: list[Token]) -> list[Line]:
    """Group tokens into visual lines (vertical-overlap clustering)."""
    toks = sorted(tokens, key=lambda t: (t.top, t.x0))
    lines: list[list[Token]] = []
    for t in toks:
        h = max(1.0, t.bottom - t.top)
        placed = False
        for ln in reversed(lines[-4:]):
            lt, lb = min(x.top for x in ln), max(x.bottom for x in ln)
            ov = min(lb, t.bottom) - max(lt, t.top)
            if ov >= 0.5 * min(h, lb - lt):
                ln.append(t)
                placed = True
                break
        if not placed:
            lines.append([t])
    out = [Line(ln[0].page, sorted(ln, key=lambda t: t.x0)) for ln in lines]
    out.sort(key=lambda l: (l.top, l.x0))
    return out


def split_line_at_gaps(line: Line, gap: float) -> list[Line]:
    """Split a visual line where two tokens are more than `gap` pt apart (used
    to separate the ID box column from option text on the same baseline)."""
    parts = [[line.tokens[0]]]
    for t in line.tokens[1:]:
        if t.x0 - parts[-1][-1].x1 > gap:
            parts.append([t])
        else:
            parts[-1].append(t)
    return [Line(line.page, p) for p in parts]


# ------------------------------------------------------------------ header
def _label_text(line) -> str:
    return re.sub(r"^\W+", "", line.text.strip())


def parse_header(lines: list[Line], start_idx: int) -> tuple[dict, int, int]:
    """Parse the header table around lines[start_idx] (a Date line).
    Returns (header_fields, first_line_idx, last_line_idx). Only the title,
    date, time and subject are kept -- roll number, name and venue are
    recognised solely so they can be skipped."""
    page = lines[start_idx].page
    # walk up to the title
    i0 = start_idx
    while i0 - 1 >= 0 and lines[i0 - 1].page == page and start_idx - (i0 - 1) <= 9:
        prev = lines[i0 - 1]
        txt = _label_text(prev)
        if any(rx.match(txt) for _, rx in HEADER_LABELS) or re.search(r"Junior|Engineer|Examination|Paper|Contract|Surveying|20\d\d|Name|enue|Roll|Number|Registration", txt):
            i0 -= 1
            continue
        break
    # walk down to Subject
    i1 = start_idx
    j = start_idx
    while j + 1 < len(lines) and lines[j + 1].page == page and j + 1 - start_idx <= 8:
        txt = _label_text(lines[j + 1])
        if any(rx.match(txt) for _, rx in HEADER_LABELS):
            j += 1
            i1 = j
            if re.match(r"^Subject", txt, re.I):
                break
            continue
        break
    fields: dict = {"title_lines": []}
    for k in range(i0, i1 + 1):
        txt = _label_text(lines[k])
        label = next((name for name, rx in HEADER_LABELS if rx.match(txt)), None)
        if k == start_idx:
            label = "date"  # the line that opened the header (may be OCR-garbled "Exam Vale")
        if label is None:
            if k < start_idx and not fields.get("seen_label"):
                fields["title_lines"].append(txt)
            continue
        fields["seen_label"] = True
        if label == "date":
            m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", txt)
            if m:
                fields["exam_date"] = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        elif label == "time":
            m = re.findall(r"(\d{1,2}):(\d\d)\s*([AP]M)", txt, re.I)
            if len(m) >= 2:
                def hh(x):
                    h, mi, ap = int(x[0]), x[1], x[2].upper()
                    if ap == "PM" and h != 12:
                        h += 12
                    if ap == "AM" and h == 12:
                        h = 0
                    return f"{h:02d}:{mi}"
                fields["exam_time"] = f"{hh(m[0])}-{hh(m[1])}"
        elif label == "subject":
            fields["subject"] = re.sub(r"^Subject\s*:?\s*", "", txt, flags=re.I).strip()
        # roll / registration / candidate / venue: intentionally discarded
    fields.pop("seen_label", None)
    title = " ".join(fields.pop("title_lines"))
    title = re.sub(r"^.*?(Junior\s+Engineer)", r"\1", title)
    fields["header_title"] = title.strip() or None
    return fields, i0, i1


def header_meta(fields: dict) -> dict:
    title = fields.get("header_title") or ""
    subj = fields.get("subject") or ""
    m = re.search(r"(20\d\d)", title)
    cycle = int(m.group(1)) if m else None
    paper = None
    for src in (title, subj):
        mm = re.search(r"Paper[\s\-]*(II|I|2|1)\b", src, re.I)
        if mm:
            paper = "P2" if mm.group(1).upper() in ("II", "2") else "P1"
            break
    return {"cycle_year": cycle, "paper": paper}


# ----------------------------------------------------------------- model
@dataclass
class Segment:
    """Reading-order span [start, end) over the document's line list."""
    lines: list[Line]
    q_number: int
    section: str | None
    shift_idx: int
    warnings: list[str] = field(default_factory=list)
    closed: bool = False  # ID box seen (OCR pages)
    stop: tuple | None = None  # (page, top) of the line that ended the segment (next Q, section, header)


def is_section_line(line: Line) -> str | None:
    m = re.match(r"^Section\s*[:;]\s*(.+)$", line.text.strip(), re.I)
    if m:
        return m.group(1).strip()
    if line.tokens[0].src == "ocr" and len(line.tokens) <= 12:
        # OCR often garbles the grey "Section :" label; accept a known section name
        m = KNOWN_SECTIONS.search(line.text)
        if m and not re.match(r"^(Q|Ans)\b", line.text):
            return m.group(1).strip()
    return None


def q_anchor(line: Line, margin: float, ocr: bool) -> int | None:
    t = line.tokens[0]
    if t.x0 > margin:
        return None
    rx = RE_Q_OCR if (ocr or t.src == "ocr") else RE_Q
    m = rx.match(t.text)
    if not m:
        # "Q.12Which" glued, or OCR "Q.1" split as "Q." + "1"
        m2 = re.match(r"^Q\.(\d{1,3})\D", t.text)
        if m2 and t.src == "text":
            return int(m2.group(1))
        if t.text in ("Q.", "Q", "Q,") and len(line.tokens) > 1 and re.fullmatch(r"\d{1,3}", line.tokens[1].text):
            return int(line.tokens[1].text)
        return None
    return int(m.group(1))


def ans_follows(all_lines, i, qcol, frames, max_lines=40) -> bool:
    """An "Ans" label in the Q column follows line i (same or next page) before any ID-box
    outline, and before another line that starts a question ("Q.n")."""
    ln = all_lines[i]
    for j in range(i + 1, min(len(all_lines), i + max_lines)):
        nx = all_lines[j]
        if nx.page > ln.page + 1:
            return False
        t = nx.tokens[0]
        box_between = any((f[1] > ln.top if f is not None else False) and f[3] <= nx.top + 2
                          for f in frames.get(ln.page, ()) if nx.page == ln.page)
        if box_between:
            return False
        if abs(t.x0 - qcol) <= 5 and re.match(r"^Ans\W?$", t.text):
            return True
        if abs(t.x0 - qcol) <= 5 and RE_Q_OCR.match(t.text):
            return False
    return False


def segment_document(pages: list[PageData], frames: dict | None = None):
    """Split the document into shifts (by header) and question segments.

    `frames` maps a page to the ID boxes found from their drawn outline (idbox_frames). On OCR
    pages a question is "closed" -- ready for the next Q anchor -- once its ID box has been
    passed, whether the box's labels were read (text) or only its outline was seen (pixels).
    Without the outline, a question whose "Question ID" labels OCR misread swallowed the next
    question when that question's "Q.n" was misread too (the next one was dropped)."""
    frames = frames or {}
    all_lines: list[Line] = []
    for pd in pages:
        if pd.ad_page:
            continue
        all_lines.extend(build_lines(pd.tokens))
    # Left margin for Q anchors: Q tokens sit left of everything but the frame.
    widths = {pd.index: pd.width for pd in pages}
    # Q column on OCR pages: median x0 of cleanly read "Q.n" tokens
    qx = [l.tokens[0].x0 for l in all_lines if l.tokens[0].src == "ocr" and RE_Q_OCR.match(l.tokens[0].text)
          and l.tokens[0].x0 <= 0.2 * widths[l.page]]
    qcol = float(np.median(qx)) if len(qx) >= 5 else None

    shifts: list[dict] = []
    segments: list[Segment] = []
    cur: Segment | None = None
    section = None
    i = 0
    header_skip_until = -1
    while i < len(all_lines):
        ln = all_lines[i]
        txt = ln.text.strip()
        margin = 0.2 * widths[ln.page]
        if i > header_skip_until and (re.match(r"^\W{0,2}(Exam|Test)\s*Date", txt, re.I) or (
                ln.tokens[0].src == "ocr" and re.match(r"^\W{0,2}\w?(Exam|Test)\s*\w{3,5}\s", txt, re.I)
                and i + 1 < len(all_lines) and re.match(r"^\W{0,2}(Exam|Test)\s*Time", all_lines[i + 1].text, re.I))):
            fields, i0, i1 = parse_header(all_lines, i)
            # close the running question before the header
            if cur is not None:
                # remove lines of the header block that were appended
                cur.lines = [l for l in cur.lines if all(l is not all_lines[k] for k in range(i0, i1 + 1))]
                cur.stop = (all_lines[i0].page, all_lines[i0].top)
                segments.append(cur)
                cur = None
            fields["first_page"] = ln.page
            shifts.append(fields)
            section = None
            header_skip_until = i1
            i = i1 + 1
            continue
        if i <= header_skip_until:
            i += 1
            continue
        sec = is_section_line(ln)
        if sec:
            if cur is not None:
                cur.stop = (ln.page, ln.top)
                segments.append(cur)
                cur = None
            section = sec
            i += 1
            continue
        if cur is not None and not cur.closed and ln.tokens[0].src == "ocr":
            first = cur.lines[0]
            if any(f[3] <= ln.top + 2 and (ln.page != first.page or f[1] > first.top) for f in frames.get(ln.page, ())):
                cur.closed = True  # this question's ID box (outline) lies above this line
        qn = q_anchor(ln, margin, ln.tokens[0].src == "ocr")
        seg_warn = []
        t0 = ln.tokens[0]
        if t0.src == "ocr":
            # OCR pages: "Q.n" is often misread ("9.50", "Q.§", "2-39"), so the
            # anchor is decided by layout -- a line starting in the Q column
            # after the previous question's ID box -- and the printed number
            # is the expected one; the OCR'd number is only a cross-check.
            prev = cur.q_number if (cur is not None and cur.section == section) else 0
            expected = prev + 1
            in_qcol = qcol is not None and abs(t0.x0 - qcol) <= 5 and not re.match(r"^Ans\W?$", t0.text)
            ready = cur is None or cur.section != section or cur.closed
            if qn is not None and expected < qn <= expected + 3 and ready and in_qcol:
                pass  # cleanly read number ahead of the count: a question was missed -> keep it (gap is reported)
            elif qn is not None and qn != expected and not (qn == 1 and prev == 0):
                if ready and in_qcol:
                    seg_warn.append(f"printed_number_ocr_read_{qn}_taken_as_{expected}")
                    qn = expected
                else:
                    qn = None  # a stray "Q.5"-like token inside an open question
            if qn is None and ready and in_qcol and (re.search(r"\d", t0.text) or re.match(r"^[QO0][.,:]", t0.text)) \
                    and len(t0.text) <= 6:
                digits = re.sub(r"^\D{0,2}[.,\-:]?", "", t0.text).translate(OCR_DIGITS)
                qn = expected
                if digits != str(expected):
                    seg_warn.append(f"q_anchor_by_layout(ocr_read:{t0.text})")
            elif qn is None and ready and in_qcol and cur is not None and ans_follows(all_lines, i, qcol, frames):
                # the whole "Q.n" line was misread, but the layout is unambiguous: the previous
                # question's ID box has been passed, this line starts in the Q column, and an
                # "Ans" label in the Q column follows before any other ID box
                qn = expected
                seg_warn.append(f"q_anchor_by_layout(ocr_read:{t0.text[:12]})")
        if cur is not None and not cur.closed and re.search(r"Question\s*ID|Chosen\s*Option", txt):
            cur.closed = True
        if qn is not None:
            if cur is not None:
                cur.stop = (ln.page, ln.top)
                segments.append(cur)
            if not shifts:
                shifts.append({"first_page": ln.page, "header_title": None, "missing_header": True})
            cur = Segment([ln], qn, section, len(shifts) - 1, list(seg_warn))
            i += 1
            continue
        if cur is not None:
            cur.lines.append(ln)
        i += 1
    if cur is not None:
        segments.append(cur)
    return shifts, segments


def stem_column(segments) -> float | None:
    """x of the stem text column on OCR pages: the median left edge of the token after "Q.n"."""
    xs = [seg.lines[0].tokens[1].x0 for seg in segments
          if seg.lines and seg.lines[0].tokens[0].src == "ocr" and len(seg.lines[0].tokens) > 1]
    return float(np.median(xs)) if len(xs) >= 5 else None


# ------------------------------------------------------------ ID box outline
def idbox_frames(renderer: Renderer, pd: PageData) -> list[tuple[float, float, float, float]]:
    """ID boxes found from their drawn outline: a grey (~153) rounded rectangle 170-260 pt wide
    and 25-110 pt tall in the right half of the page. Found as a pair of horizontal grey edges
    of the same extent, confirmed by grey vertical edges at both ends. Returns rectangles in
    points (with 2 pt margin). Families whose box has no outline (2023-24 text layer) return
    none; their box is found from its labels."""
    import cv2

    s = renderer.scale
    a = renderer.page_array(pd.index).astype(np.int16)
    H, W = a.shape[:2]
    mn, mx = a.min(axis=2), a.max(axis=2)
    grey = ((mn < 200) & (mx - mn < 40)).astype(np.uint8)
    hor = cv2.morphologyEx(grey, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (int(80 * s), 1)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(hor, 8)
    segs = [tuple(int(v) for v in st[c][:4]) for c in range(1, n)
            if 170 * s <= st[c][2] <= 260 * s and st[c][3] <= 4 * s and st[c][0] > 0.35 * W]
    segs.sort(key=lambda b: b[1])
    out = []
    used = set()
    for i, (x, y, w, h) in enumerate(segs):
        if i in used:
            continue
        for j in range(i + 1, len(segs)):
            x2, y2, w2, h2 = segs[j]
            dy = y2 - y
            if dy < 25 * s:
                continue
            if dy > 110 * s:
                break
            if abs(x2 - x) > 4 * s or abs((x2 + w2) - (x + w)) > 4 * s:
                continue
            # vertical edges: grey ink near both ends over most of the inner height
            inner = slice(y + int(0.25 * dy), y + int(0.75 * dy))
            left = grey[inner, max(0, min(x, x2) - int(3 * s)):min(x, x2) + int(4 * s)].any(axis=1).mean()
            xr = max(x + w, x2 + w2)
            right = grey[inner, xr - int(4 * s):min(W, xr + int(3 * s))].any(axis=1).mean()
            if left < 0.8 or right < 0.8:
                continue
            used.update((i, j))
            out.append((min(x, x2) / s - 2, y / s - 2, xr / s + 2, (y2 + h2) / s + 2))
            break
    return out


# ------------------------------------------------------------ question
def find_idbox(seg: Segment):
    """Locate the ID box by its labels. Returns (rect_per_page, qid, option_ids)."""
    label_tokens = []
    for ln in seg.lines:
        for j, t in enumerate(ln.tokens):
            if t.text in ("Question", "Chosen", "Status", "Status:", "Status :") or (
                t.text == "Option" and j + 2 < len(ln.tokens) and re.fullmatch(r"\d", ln.tokens[j + 1].text)
                and ln.tokens[j + 2].text.startswith("ID")
            ):
                nxt = " ".join(x.text for x in ln.tokens[j:j + 3])
                if IDBOX_LABEL.match(nxt):
                    label_tokens.append((ln, t))
    if not label_tokens:
        return {}, None, None
    rects = {}
    for ln, t in label_tokens:
        r = rects.setdefault(ln.page, [t.x0, ln.top, 0, ln.bottom])
        r[0] = min(r[0], t.x0)
        r[1] = min(r[1], ln.top)
        r[3] = max(r[3], ln.bottom)
    for p, r in rects.items():
        r[0] -= 4
        r[1] -= 3
        r[2] = 10_000
        r[3] += 16  # status values can wrap ("Not Attempted and / Marked For Review")
    qid, opt_ids = None, {}
    for ln in seg.lines:
        r = rects.get(ln.page)
        if not r:
            continue
        inside = [t for t in ln.tokens if t.x0 >= r[0] and r[1] <= t.top <= r[3]]
        s = " ".join(t.text for t in inside)
        m = re.search(r"Question\s*ID\s*:?\s*(\d{6,})", s)
        if m:
            qid = m.group(1)
        m = re.search(r"Option\s*(\d)\s*ID\s*:?\s*(\d{6,})", s)
        if m:
            opt_ids[int(m.group(1))] = m.group(2)
    ids = [opt_ids.get(k) for k in (1, 2, 3, 4)] if opt_ids else None
    if ids and any(v is None for v in ids):
        ids = None
    return rects, qid, ids


def in_rect(t, rects) -> bool:
    r = rects.get(t.page)
    return bool(r) and t.x0 >= r[0] and r[1] <= t.top <= r[3]


def question_spans(seg: Segment, pages: dict[int, PageData]) -> dict[int, tuple[float, float]]:
    """Per page of the segment, the vertical band that can only hold this question: from its
    "Q.n" line (first page) or the content top (continuation pages) to just above the line that
    ended the segment (next question, section or shift header) or the content bottom. Content
    top/bottom exclude the print header/footer zones."""
    from furniture import content_limits

    first = seg.lines[0]
    last_page = seg.stop[0] if seg.stop else max(ln.page for ln in seg.lines)
    out = {}
    for p in range(first.page, max(last_page, max(ln.page for ln in seg.lines)) + 1):
        if p not in pages or pages[p].ad_page:
            continue
        ctop, cbot = content_limits(pages[p])
        top = first.top - 4 if p == first.page else ctop
        bottom = seg.stop[1] - 5 if (seg.stop and seg.stop[0] == p) else cbot  # the next one starts at its top - 4
        top, bottom = max(top, ctop), min(bottom, cbot)
        if bottom > top:
            out[p] = (top, bottom)
    return out


def own_frames(spans, frames) -> dict[int, list]:
    """ID-box outlines that lie inside this question's spans."""
    out = {}
    for p, (top, bottom) in spans.items():
        fs = [f for f in frames.get(p, ()) if f[1] >= top - 3 and f[3] <= bottom + 3]
        if fs:
            out[p] = fs
    return out


def parse_question(seg: Segment, pages: dict[int, PageData], renderer: Renderer, frames: dict | None = None,
                   stem_col: float | None = None) -> dict:
    warnings = list(seg.warnings)
    rects, qid, opt_ids = find_idbox(seg)
    spans = question_spans(seg, pages)
    oframes = own_frames(spans, frames or {})
    # tokens to drop: inside the ID box found from its labels, or inside its drawn outline
    excl = {p: list(r) for p, r in rects.items()}
    for p, fs in oframes.items():
        for f in fs:
            r = excl.setdefault(p, [f[0], f[1], 10_000, f[3]])
            r[0], r[1], r[3] = min(r[0], f[0]), min(r[1], f[1]), max(r[3], f[3])
    # drop ID-box tokens; split mixed lines
    lines: list[Line] = []
    for ln in seg.lines:
        toks = [t for t in ln.tokens if not in_rect(t, excl)]
        if toks:
            lines.append(Line(ln.page, toks))
    n_qid_labels = sum(1 for ln in seg.lines for j, t in enumerate(ln.tokens)
                       if t.text == "Question" and j + 1 < len(ln.tokens) and ln.tokens[j + 1].text.startswith("ID"))
    n_boxes = max(n_qid_labels, sum(len(v) for v in oframes.values()))
    if n_boxes > 1:
        warnings.append(f"segment_holds_{n_boxes}_id_boxes(a question anchor was missed)")
    q_line = lines[0]
    q_tok = q_line.tokens[0]
    ocr = q_tok.src == "ocr"
    stem_first = q_line.tokens[1:]
    if q_tok.text in ("Q.", "Q", "Q,") and stem_first and re.fullmatch(r"\d{1,3}", stem_first[0].text):
        stem_first = stem_first[1:]
    m = re.match(r"^Q\.\d{1,3}(\D.*)$", q_tok.text)
    glued = [Token(q_tok.page, q_tok.x0, q_tok.top, q_tok.x1, q_tok.bottom, m.group(1), q_tok.cls, q_tok.src)] if (m and not ocr) else []

    # ---- find Ans line
    ans_idx = None
    for k, ln in enumerate(lines):
        t0 = ln.tokens[0]
        if re.fullmatch(r"Ans[.:]?" if not ocr else r"Ans\W?", t0.text) and t0.x0 < 0.2 * pages[ln.page].width:
            ans_idx = k
            break
        # glued "Ans1." etc.
    if ans_idx is None:
        warnings.append("ans_label_not_found")

    # ---- option number anchors
    opt_starts: list[tuple[int, int, Token, str]] = []  # (k, line_idx, token, rest)
    rx = RE_OPT_OCR if ocr else RE_OPT
    if ans_idx is not None:
        expected = 1
        ref_x = None
        for k in range(ans_idx, len(lines)):
            ln = lines[k]
            toks = ln.tokens
            if k == ans_idx:
                toks = toks[1:]
            if not toks:
                continue
            if ocr:
                # OCR reads the tick/cross icon as a glyph ("X", "v", "%") left of the number
                while len(toks) > 1 and not re.search(r"\d", toks[0].text) and len(toks[0].text) <= 3 and (
                        ref_x is None or toks[0].x1 < ref_x + 2):
                    toks = toks[1:]
            t = toks[0]
            mm = rx.match(t.text)
            num = None
            rest = ""
            if mm:
                d = mm.group(1)
                num = int(d)
                rest = mm.group(2) or ""
            elif ocr and re.fullmatch(r"[1-4]", t.text):
                num = int(t.text)
            if num == expected and (ref_x is None or abs(t.x0 - ref_x) <= 8):
                if ref_x is None:
                    ref_x = t.x0
                opt_starts.append((num, k, t, rest))
                expected += 1
                if expected > 4:
                    break
    if ocr and ans_idx is not None:
        # OCR text is unreliable for the small option numbers next to icons;
        # locate options from the key colours instead (see pixel_option_rows)
        px = pixel_option_lines(lines, ans_idx, rects, renderer, pages)
        if px is not None:
            lines = lines[:ans_idx] + [Line(lines[ans_idx].page, [lines[ans_idx].tokens[0]])] + px
            opt_starts = []
            n = 0
            for li in range(ans_idx + 1, len(lines)):
                t = lines[li].tokens[0]
                if t.text.endswith("."):
                    n += 1
                    opt_starts.append((n, li, t, ""))
    if len(opt_starts) != 4:
        warnings.append(f"options_found:{len(opt_starts)}")

    # ---- collect stem / option tokens
    stem_lines: list[list[Token]] = []
    first_stem = glued + stem_first
    if first_stem:
        stem_lines.append(first_stem)
    stop = ans_idx if ans_idx is not None else len(lines)
    for ln in lines[1:stop]:
        stem_lines.append(ln.tokens)

    opt_tokens: list[list[list[Token]]] = [[] for _ in range(4)]
    opt_num_tok: list[Token | None] = [None] * 4
    for idx, (num, k, t, rest) in enumerate(opt_starts):
        end_k = opt_starts[idx + 1][1] if idx + 1 < len(opt_starts) else len(lines)
        for kk in range(k, end_k):
            toks = lines[kk].tokens
            if kk == ans_idx:
                toks = toks[1:]
            if kk == k:
                toks = toks[1:]
                head = [Token(t.page, t.x0, t.top, t.x1, t.bottom, rest, t.cls, t.src)] if rest else []
                opt_tokens[num - 1].append(head + toks)
                continue
            opt_tokens[num - 1].append(toks)
        opt_num_tok[num - 1] = t

    def join(lines_):
        out = []
        for toks in lines_:
            s = join_tokens([x for x in toks if x.text])
            if s.strip():
                out.append(s)
        return "\n".join(out).strip()

    stem = join(stem_lines)
    options = [join(o) for o in opt_tokens]

    # ---- geometry per page
    all_toks = [t for ln in lines for t in ln.tokens]
    seg_pages = sorted({ln.page for ln in seg.lines})
    # images/drawings belonging to the question: wholly inside its span on that page (a
    # watermark or a page scan that also covers the neighbours is not this question's figure)
    last_line = seg.lines[-1]

    def in_span(page, top, bottom):
        sp = spans.get(page)
        if sp is None or page not in seg_pages:
            return False
        if top < sp[0] - 3 or bottom > sp[1] + 3:
            return False
        if page == last_line.page and top > max(l.bottom for l in seg.lines if l.page == page) + 2:
            return False
        return True

    icons, figures, drawings = [], [], []
    for p in seg_pages:
        pd = pages[p]
        for b in pd.images:
            if b.kind == "chrome" or not in_span(p, b.top, b.bottom):
                continue
            if in_rect(Token(p, b.x0, b.top, b.x1, b.bottom, "", "D"), excl):
                continue
            ref = opt_num_tok[0].x0 if opt_num_tok[0] else 1e9
            if b.kind == "icon?" and b.x1 <= ref + 2:
                icons.append(b)
            else:
                figures.append(b)
        for d in pd.drawings:
            if d.kind == "chrome" or not in_span(p, d.top, d.bottom):
                continue
            if in_rect(Token(p, d.x0, d.top, d.x1, d.bottom, "", "D"), excl):
                continue
            drawings.append(d)

    # ---- key signals
    text_sig, text_detail = text_colour_signal(opt_tokens, opt_num_tok)
    icon_sig, icon_detail = icon_signal(opt_starts, lines, opt_num_tok, rects, renderer, pages, seg)

    # ---- bbox / crop regions (per page)
    regions, crop_why = crop_regions(seg, lines, figures, icons, drawings, rects, oframes, spans, pages, renderer, ocr)

    if n_boxes > 1:
        crop_why = "segment_holds_2_questions"
    elif ocr and not (oframes or rects):
        crop_why = "id_box_not_located"  # an un-blanked Chosen Option could be inside
    elif not regions:
        crop_why = "no_region"

    # ---- regions whose text is only available as pixels (image stems/options)
    # The OCR box is the union of the images themselves (padded 1.5 pt): an option image can
    # start left of its printed number (the number sits on the line above it), so a box that
    # starts after the number cut the first letters off ("t watering" for "the first watering").
    def image_box(p, top, bottom, x_min):
        fs = [f for f in figures if f.page == p and f.x1 > x_min and f.top >= top - 3 and f.bottom <= bottom + 3
              and f.bottom - f.top >= 4]
        if not fs:
            return None
        return (p, min(f.x0 for f in fs) - 1.5, min(f.top for f in fs) - 1.5,
                max(f.x1 for f in fs) + 1.5, max(f.bottom for f in fs) + 1.5)

    ocr_needs = {}
    reg_by_page = {r[0]: r for r in regions}
    if not stem.strip() and ans_idx is not None and lines[ans_idx].page == q_line.page:
        box = image_box(q_line.page, q_line.top - 3, lines[ans_idx].top - 1, q_tok.x1)
        if box:
            ocr_needs["stem"] = box
    if len(opt_starts) == 4:
        ivs = option_intervals(opt_starts, lines, pages, rects)
        for oi in range(4):
            if options[oi].strip():
                continue
            p, a, b = ivs[oi]
            t = opt_starts[oi][2]
            box = image_box(p, a, b, t.x1)
            if box:
                ocr_needs[f"opt{oi}"] = box

    # ---- whole-page-OCR questions: every text part is re-read by two engines
    ocr_verify = {}
    if ocr:
        if ans_idx is not None and lines[ans_idx].page == q_line.page:
            p = q_line.page
            x1 = reg_by_page[p][3] if p in reg_by_page else pages[p].width * 0.75
            # left edge: the document's stem column (stems are left-aligned), never right of the
            # first stem token, never inside the "Q.n" label
            sx0 = q_tok.x1 + 1
            if stem_col is not None:
                sx0 = min(sx0, max(stem_col - 2.0, q_tok.x0 + 12))
            if len(q_line.tokens) > 1:
                sx0 = min(sx0, q_line.tokens[1].x0 - 1.5)
            ocr_verify["stem"] = (p, sx0, q_line.top - 3, x1, lines[ans_idx].top - 1)
        if len(opt_starts) == 4:
            ivs = option_intervals(opt_starts, lines, pages, rects)
            for oi in range(4):
                p, a, b = ivs[oi]
                t = opt_starts[oi][2]
                x1 = reg_by_page[p][3] if p in reg_by_page else pages[p].width * 0.75
                ocr_verify[f"opt{oi}"] = (p, t.x0 - 1.5, a + 2, x1, b)

    # no OCR box may reach into an ID box (its values are the candidate's)
    def above_boxes(box):
        p, x0, top, x1, bottom = box
        for f in list(oframes.get(p, ())) + ([excl[p]] if p in excl else []):
            if f[1] > top and f[1] < bottom and f[0] < x1:
                bottom = f[1] - 1
        return (p, x0, top, x1, bottom) if bottom - top >= 4 else None
    ocr_needs = {k: b for k, b in ((k, above_boxes(v)) for k, v in ocr_needs.items()) if b}
    ocr_verify = {k: b for k, b in ((k, above_boxes(v)) for k, v in ocr_verify.items()) if b}

    return {
        "ocr_verify": ocr_verify,
        "q_number": seg.q_number,
        "section": seg.section,
        "stem": stem,
        "options": options,
        "opt_found": len(opt_starts),
        "ssc_question_id": qid,
        "ssc_option_ids": opt_ids,
        "text_sig": text_sig,
        "text_detail": text_detail,
        "icon_sig": icon_sig,
        "icon_detail": icon_detail,
        "regions": regions,
        "ocr_needs": ocr_needs,
        "figures": figures,
        "drawings": drawings,
        "idbox": rects,
        "idframes": oframes,
        "crop_why": crop_why,
        "ocr": any(t.src == "ocr" for t in all_toks),
        "ocr_conf": (float(np.mean([t.conf for t in all_toks if t.src == "ocr"])) if any(t.src == "ocr" for t in all_toks) else None),
        "warnings": warnings,
        "page": q_line.page,
        "stem_lines": stem_lines,
        "opt_tokens": opt_tokens,
        "opt_num_tok": opt_num_tok,
    }


SUP = str.maketrans("0123456789+-=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ")
SUB = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")


def join_tokens(toks: list[Token]) -> str:
    """Join a line's tokens, rendering raised/lowered small tokens as
    super/subscripts ("m 3" -> "m³", "A 0" -> "A₀") so exponents are not
    silently flattened into different numbers."""
    if not toks:
        return ""
    sized = [t for t in toks if t.size > 0]
    if not sized:
        return " ".join(t.text for t in toks)
    by = {}
    for t in sized:
        by[round(t.size, 1)] = by.get(round(t.size, 1), 0) + len(t.text)
    dom = max(by, key=by.get)
    base = [t for t in sized if abs(t.size - dom) < 0.15]
    mid = sum((t.top + t.bottom) / 2 for t in base) / len(base)
    out = ""
    prev, prev_kind = None, None
    for t in toks:
        kind = None
        if 0 < t.size <= 0.85 * dom:
            c = (t.top + t.bottom) / 2
            if c < mid - 0.18 * dom:
                kind = "sup"
            elif c > mid + 0.12 * dom:
                kind = "sub"
        txt = t.text
        if kind:
            tbl = SUP if kind == "sup" else SUB
            ok = set("0123456789+-=()n" if kind == "sup" else "0123456789+-=()")
            if all(ch in ok for ch in txt):
                txt = txt.translate(tbl)
            else:
                txt = ("^(" if kind == "sup" else "_(") + txt + ")"
        if prev is None:
            out = txt
        elif (kind or prev_kind) and t.x0 - prev.x1 < 0.25 * dom:
            out += txt
        else:
            out += " " + txt
        prev, prev_kind = t, kind
    return out


def text_colour_signal(opt_tokens, opt_num_tok):
    """Signal 1: fill colour of each option's printed number and text."""
    per = []
    for k in range(4):
        toks = [t for line in opt_tokens[k] for t in line]
        if opt_num_tok[k] is not None:
            toks = toks + [opt_num_tok[k]]
        cl = {t.cls for t in toks if t.cls in "GR"}
        if cl == {"G"}:
            per.append("G")
        elif cl == {"R"}:
            per.append("R")
        elif not cl:
            per.append("?")
        else:
            per.append("M")
    detail = "".join(per)
    if per.count("G") == 1 and per.count("R") == 3:
        return per.index("G") + 1, detail
    return None, detail


def pixel_option_rows(renderer: Renderer, page: int, x0: float, top: float, x1: float, bottom: float):
    """Rows of key-coloured text in a region, from pixels only.

    Returns (rows, icons) in points. A row is a cluster of green/red glyph
    components overlapping vertically; icons are the taller coloured blobs.
    """
    import cv2

    s = renderer.scale
    reg = renderer.region(page, x0, top, x1, bottom)
    if reg.size == 0:
        return [], []
    g, r = pixel_masks(reg)
    col = (g | r).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(col, 8)
    comps = []
    for c in range(1, n):
        x, y, w, h, a = st[c]
        if a < 3:
            continue
        m = lab[y:y + h, x:x + w] == c
        ng = int((g[y:y + h, x:x + w] & m).sum())
        nr = int((r[y:y + h, x:x + w] & m).sum())
        comps.append({"x0": x0 + x / s, "x1": x0 + (x + w) / s, "top": top + y / s, "bottom": top + (y + h) / s,
                      "h": h / s, "w": w / s, "g": ng, "r": nr})
    icons = [c for c in comps if c["h"] >= 7.2 and 4.0 <= c["w"] <= 20]
    text = [c for c in comps if c not in icons]
    # group text comps into rows
    text.sort(key=lambda c: c["top"])
    rows = []
    for c in text:
        for row in rows:
            ov = min(row["bottom"], c["bottom"]) - max(row["top"], c["top"])
            if ov >= 0.4 * min(c["h"], row["bottom"] - row["top"]):
                row["comps"].append(c)
                row["top"], row["bottom"] = min(row["top"], c["top"]), max(row["bottom"], c["bottom"])
                break
        else:
            rows.append({"top": c["top"], "bottom": c["bottom"], "comps": [c]})
    for row in rows:
        row["x0"] = min(c["x0"] for c in row["comps"])
        row["x1"] = max(c["x1"] for c in row["comps"])
        row["g"] = sum(c["g"] for c in row["comps"])
        row["r"] = sum(c["r"] for c in row["comps"])
    # drop specks (a row must look like at least "1." : >= 2 comps or wide enough)
    rows = [row for row in rows if (row["x1"] - row["x0"]) >= 3 and (row["bottom"] - row["top"]) >= 3]
    # icons that are right of the text start are really tall glyphs, e.g. "(" -- give them back
    if rows:
        ncol = min(row["x0"] for row in rows)
        icons = [c for c in icons if c["x1"] <= ncol + 1]
    rows.sort(key=lambda r_: r_["top"])
    return rows, icons


def pixel_option_lines(lines, ans_idx, rects, renderer, pages):
    """Synthetic option lines for OCR pages, located from key colours.

    Anchors are (a) coloured text rows starting at the option-number column
    and (b) tick/cross icons; anchors within 5 pt vertically are one option.
    Exactly four options are required, otherwise None (-> options_found warning).
    Each synthetic line carries the colour of the option's own number/text
    pixels (right of the icon column), which is the text-colour signal.
    """
    ans = lines[ans_idx]
    ans_tok = ans.tokens[0]
    p = ans.page
    w = pages[p].width
    r = rects.get(p)
    spans = [(p, ans.top - 3, (r[1] - 2) if (r and r[1] > ans.top) else pages[p].height - 25)]
    if not (r and r[1] > ans.top) and (p + 1) in pages:
        r2 = rects.get(p + 1)
        later = [l for l in lines[ans_idx + 1:] if l.page == p + 1]
        end2 = r2[1] - 2 if r2 else (max(l.bottom for l in later) + 30 if later else None)
        if end2:
            spans.append((p + 1, 40, end2))
    anchors = []  # dicts with page, top, bottom, kind, x0, x1
    for (pg, a, b) in spans:
        rows, icons = pixel_option_rows(renderer, pg, ans_tok.x1 + 1, a, w - 30, b)
        for row in rows:
            anchors.append({"page": pg, "top": row["top"], "bottom": row["bottom"], "kind": "row",
                            "x0": row["x0"], "x1": row["x1"]})
        for c in icons:
            anchors.append({"page": pg, "top": c["top"], "bottom": c["bottom"], "kind": "icon",
                            "x0": c["x0"], "x1": c["x1"]})
    if not anchors:
        return None
    icon_x1 = max([a_["x1"] for a_ in anchors if a_["kind"] == "icon"], default=None)
    row_x0s = sorted(a_["x0"] for a_ in anchors if a_["kind"] == "row" and (icon_x1 is None or a_["x0"] > icon_x1))
    if row_x0s:
        ncol = row_x0s[0]
    elif icon_x1 is not None:
        ncol = icon_x1 + 2.5
    else:
        return None
    # rows that start at the number column (continuation rows are indented)
    cands = [a_ for a_ in anchors if a_["kind"] == "icon" or abs(a_["x0"] - ncol) <= 3.0]
    cands.sort(key=lambda a_: (a_["page"], (a_["top"] + a_["bottom"]) / 2))
    clusters = []
    for a_ in cands:
        cy = (a_["top"] + a_["bottom"]) / 2
        if clusters and clusters[-1]["page"] == a_["page"] and abs(cy - clusters[-1]["cy"]) <= 5.0:
            cl = clusters[-1]
            cl["top"], cl["bottom"] = min(cl["top"], a_["top"]), max(cl["bottom"], a_["bottom"])
            continue
        clusters.append({"page": a_["page"], "cy": cy, "top": a_["top"], "bottom": a_["bottom"]})
    if len(clusters) != 4:
        return None
    out = []
    for k, cl in enumerate(clusters, start=1):
        # text colour: pixels right of the icon column on the option's first row
        # only the printed number "k." (left of the watermark); scanned digits
        # are thin and pale, so a hue-dominance test is used for this small box
        reg = renderer.region(cl["page"], ncol - 1.0, cl["top"] - 1, ncol + 9, cl["bottom"] + 1).astype(np.int16)
        R, G, B = reg[..., 0], reg[..., 1], reg[..., 2]
        g = (G - R >= 30) & (G - B >= 20) & (G >= 90)
        r_ = (R - G >= 35) & (R - B >= 30) & (R >= 100)
        ng, nr = int(g.sum()), int(r_.sum())
        # scanned digits are thin and faint, so a few pure-colour pixels
        # suffice; a stray fringe pixel can only cause a disagreement with the
        # icon signal (-> null), never a key on its own
        cls = "G" if ng >= 3 and ng >= 3 * max(nr, 1) else "R" if nr >= 3 and nr >= 3 * max(ng, 1) else "D"
        tok = Token(cl["page"], ncol, cl["top"], ncol + 8, cl["bottom"], f"{k}.", cls, "ocr")
        out.append(Line(cl["page"], [tok]))
    return out


def option_intervals(opt_starts, lines, pages, rects):
    """Vertical interval [a, b) on the option number's page that "belongs" to
    each option: from just above its number to just above the next option's
    number (or, for the last option / a page break, to the end of its content)."""
    out = []
    for idx in range(len(opt_starts)):
        num, k, t, _ = opt_starts[idx]
        page = t.page
        a = t.top - 6
        if idx + 1 < len(opt_starts) and opt_starts[idx + 1][2].page == page:
            b = opt_starts[idx + 1][2].top - 6
        else:
            end_k = opt_starts[idx + 1][1] if idx + 1 < len(opt_starts) else len(lines)
            own = [lines[kk] for kk in range(k, end_k) if lines[kk].page == page]
            b = max([l.bottom for l in own] + [t.bottom]) + 4
            for bx in pages[page].images:
                if bx.kind not in ("chrome",) and bx.top >= t.top - 6 and bx.top < b + 2 and bx.x0 >= t.x0 - 30:
                    b = max(b, bx.bottom + 3)
            r = rects.get(page)
            if r and r[1] > t.top:
                b = min(b, r[1])
        out.append((page, a, b))
    return out


def icon_signal(opt_starts, lines, opt_num_tok, rects, renderer: Renderer, pages, seg):
    """Signal 2: pixel colour of the tick/cross icon left of each option.

    Coloured blobs are found in the icon column (30 pt left of the option
    numbers) and each blob is assigned to the option whose interval contains
    the blob's vertical centre -- robust to icons that sit a few points above
    the number or beside the middle of a tall figure option."""
    import cv2

    if len(opt_starts) != 4:
        return None, "no-options"
    s = renderer.scale
    ivs = option_intervals(opt_starts, lines, pages, rects)
    xs = [t.x0 for _, _, t, _ in opt_starts]
    x1 = min(xs) - 0.6
    x0 = x1 - 30
    per_opt = [[0, 0] for _ in range(4)]  # green px, red px
    for page in sorted({p for p, _, _ in ivs}):
        a = min(iv[1] for iv in ivs if iv[0] == page)
        b = max(iv[2] for iv in ivs if iv[0] == page)
        reg = renderer.region(page, x0, a, x1, b)
        if reg.size == 0:
            continue
        g, r_ = pixel_masks(reg)
        mask = (g | r_).astype(np.uint8)
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        n, lab, stats, cents = cv2.connectedComponentsWithStats(mask, 8)
        for c in range(1, n):
            if stats[c, cv2.CC_STAT_AREA] < 6:
                continue
            cy = a + cents[c][1] / s
            comp = lab == c
            ng, nr = int((g & comp).sum()), int((r_ & comp).sum())
            for oi, (pp, ia, ib) in enumerate(ivs):
                if pp == page and ia <= cy < ib:
                    per_opt[oi][0] += ng
                    per_opt[oi][1] += nr
                    break
    per = []
    minpx = 12 * (s / 2.0) ** 2
    for ng, nr in per_opt:
        if ng >= minpx and nr <= 0.2 * ng:
            per.append("T")
        elif nr >= minpx and ng <= 0.2 * nr:
            per.append("X")
        elif ng < minpx and nr < minpx:
            per.append("-")
        else:
            per.append("M")
    detail = "".join(per)
    if per.count("T") == 1 and per.count("X") == 3:
        return per.index("T") + 1, detail
    return None, detail


def ink_bottom(renderer: Renderer, page: int, x0: float, top: float, x1: float, bottom: float, exclude=()) -> float | None:
    """Lowest row of printed content (dark ink) in a region, ignoring frame rules, the pale
    watermark and the given rectangles (ID boxes). Used on OCR pages, where a figure drawn in
    pixels has no tokens, so that a question continuing on the next page keeps its figure."""
    s = renderer.scale
    reg = renderer.region(page, x0, top, x1, bottom)
    if reg.size == 0:
        return None
    ink = reg.min(axis=2) < 140
    for ex in exclude:
        a, b = int((ex[1] - top) * s), int(np.ceil((ex[3] - top) * s))
        c = int((ex[0] - x0) * s)
        if b > 0 and a < ink.shape[0]:
            ink[max(0, a):max(0, b), max(0, c):] = False
    ink[ink.mean(axis=1) > 0.5, :] = False  # horizontal frame rules
    ink[:, ink.mean(axis=0) > 0.6] = False  # vertical frame rules
    rows = np.where(ink.sum(axis=1) >= 3)[0]
    return top + (rows[-1] + 1) / s if rows.size else None


def crop_regions(seg, lines, figures, icons, drawings, rects, oframes, spans, pages, renderer, ocr):
    """Per-page [page, x0, top, x1, bottom] of the question block, clamped to its spans.

    The block covers its tokens, figures, icons and figure-sized drawings, and runs down to its
    own ID box (which the crop blanks). On OCR pages a part that continues on the next page also
    runs down to the last row of ink (figures drawn in pixels have no tokens). Nothing outside
    the question's spans -- the neighbours, the print header/footer -- is ever included."""
    by_page: dict[int, list[float]] = {}

    def add(p, x0, top, x1, bottom):
        r = by_page.setdefault(p, [x0, top, x1, bottom])
        r[0], r[1], r[2], r[3] = min(r[0], x0), min(r[1], top), max(r[2], x1), max(r[3], bottom)

    for ln in lines:
        for t in ln.tokens:
            add(ln.page, t.x0, t.top, t.x1, t.bottom)
    for b in figures + icons:
        add(b.page, b.x0, b.top, b.x1, b.bottom)
    def box_bottom(p):
        bs = [f[3] for f in oframes.get(p, ())] + ([rects[p][3] - 10] if rects.get(p) else [])
        return max(bs) if bs else None

    for d in drawings:
        W = pages[d.page].width
        if (d.w < 2.0 and d.h > 60) or (d.h < 2.0 and d.w > 150) or max(d.w, d.h) < 4 or d.w > 0.7 * W:
            continue  # frame rules / separators / specks / section bars
        if pages[d.page].textless and (d.w < 15 or d.h < 15):
            continue  # textless (2022) pages draw every glyph as a path: only figure-sized drawings count
        if d.page not in by_page:
            continue  # drawings extend a part; alone (e.g. the tail of an ID box outline) they are none
        bb = box_bottom(d.page)
        if bb is not None and d.top > bb:
            continue  # below the question's own ID box: frame pieces, not the question
        add(d.page, d.x0, d.top, d.x1, d.bottom)
    out = []
    last_p = max(by_page) if by_page else None
    for p in sorted(by_page):
        sp = spans.get(p)
        if sp is None:
            continue
        x0, top, x1, bottom = by_page[p]
        W = pages[p].width
        X0, X1 = max(0.0, x0 - 8), min(W, max(x1 + 8, W * 0.62))
        bb = box_bottom(p)  # label rect bottom is the last label line + 16
        if bb is not None:
            bottom = max(bottom, bb - 6)
        elif ocr and p != last_p:
            ib = ink_bottom(renderer, p, X0, top, X1, sp[1], exclude=[f for fs in oframes.values() for f in fs])
            if ib is not None:
                bottom = max(bottom, ib)
        top, bottom = max(top - 5, sp[0]), min(bottom + 6, sp[1])
        if bottom - top < 4:
            continue
        out.append([p, X0, top, X1, bottom])
    return out, None
