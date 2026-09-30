"""Page model: turns a PDF page into positioned tokens, images and drawings.

Two token sources feed the same downstream parser:
  * text layer (pdfplumber words, char colour from the PDF fill colour), and
  * OCR (tesseract TSV on the rendered page, colour measured from pixels).

Coordinates are always PDF points in pdfplumber's top-left system, shifted so
(0, 0) is the top-left of the rendered page (pdfplumber's page.bbox may be
offset when the MediaBox does not start at the origin).
"""
from __future__ import annotations

import csv
import re
import io
import subprocess
from collections import Counter
from dataclasses import dataclass, field

import numpy as np
import pdfplumber
import pypdfium2 as pdfium

from common import RENDER_SCALE, classify_rgb01, pixel_masks, to_rgb


@dataclass
class Token:
    page: int
    x0: float
    top: float
    x1: float
    bottom: float
    text: str
    cls: str  # G / R / D (answer-key green, red, other)
    src: str = "text"  # text | ocr
    conf: float = 100.0
    size: float = 0.0


@dataclass
class Box:
    page: int
    x0: float
    top: float
    x1: float
    bottom: float
    kind: str = "image"  # image | drawing

    @property
    def w(self):
        return self.x1 - self.x0

    @property
    def h(self):
        return self.bottom - self.top


@dataclass
class PageData:
    index: int
    width: float
    height: float
    tokens: list[Token] = field(default_factory=list)
    images: list[Box] = field(default_factory=list)
    drawings: list[Box] = field(default_factory=list)
    has_text_layer: bool = True
    textless: bool = False
    ocr: bool = False
    ad_page: bool = False
    furniture: list = field(default_factory=list)  # [(top, bottom)] print header/footer bands (furniture.py)
    furniture_dropped: list = field(default_factory=list)  # non-furniture lines removed with a zone
    stray_urls: list = field(default_factory=list)  # [(x0, top, x1, bottom)] URL tokens elsewhere on the page


def _clip_rect(raw) -> tuple | None:
    """Intersection of the bounding boxes of an object's clip paths (PDF user space), or None."""
    import ctypes

    import pypdfium2.raw as pr

    cp = pr.FPDFPageObj_GetClipPath(raw)
    if not cp:
        return None
    rect = [-1e9, -1e9, 1e9, 1e9]
    for i in range(pr.FPDFClipPath_CountPaths(cp)):
        xs, ys = [], []
        for j in range(pr.FPDFClipPath_CountPathSegments(cp, i)):
            seg = pr.FPDFClipPath_GetPathSegment(cp, i, j)
            x, y = ctypes.c_float(), ctypes.c_float()
            if pr.FPDFPathSegment_GetPoint(seg, ctypes.byref(x), ctypes.byref(y)):
                xs.append(x.value)
                ys.append(y.value)
        if xs:
            rect = [max(rect[0], min(xs)), max(rect[1], min(ys)), min(rect[2], max(xs)), min(rect[3], max(ys))]
    return tuple(round(v, 1) for v in rect) if rect[0] > -1e9 else None


def hidden_page_clip(pg) -> tuple | None:
    """The page-wide clip rectangle when it hides printed content, else None.

    One Civil-Engineering-2019 sitting (29/10/2020 10:00) was printed with a clip that cuts
    ~121 pt off the left and bottom of every page: the "Q.n" labels, the icons, the option
    numbers and the left part of every stem image are in the file but not drawn. Such a clip is
    recognised when (a) at least half of the page's objects share one clip rectangle, (b) it
    cuts more than 5 pt off some page edge, and (c) at least one text object lies entirely
    outside it. A clip that hides no text (image cropping, table cells) is left alone."""
    import collections

    objs = list(pg.get_objects(max_depth=1))
    rects = collections.Counter()
    for o in objs:
        r = _clip_rect(o.raw)
        if r:
            rects[r] += 1
    if not rects:
        return None
    r, n = rects.most_common(1)[0]
    if n < 0.5 * len(objs):
        return None
    cb = pg.get_cropbox()
    if max(r[0] - cb[0], r[1] - cb[1], cb[2] - r[2], cb[3] - r[3]) <= 5:
        return None
    for o in objs:
        if o.type == 1:
            l, b, rr, t = o.get_bounds()
            if rr < r[0] or t < r[1] or l > r[2] or b > r[3]:
                return r
    return None


def neutralise_hidden_clip(pg) -> tuple | None:
    """Undo a hiding clip (see hidden_page_clip) in memory: the clip paths of the objects that
    carry it are scaled up 20x about the clip's centre, so they no longer cut anything off the
    page. Pixels inside the old clip are unchanged. Returns the clip rectangle, or None."""
    import pypdfium2.raw as pr

    r = hidden_page_clip(pg)
    if r is None:
        return None
    cx, cy, k = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 20.0
    for o in pg.get_objects(max_depth=1):
        if _clip_rect(o.raw) == r:
            pr.FPDFPageObj_TransformClipPath(o.raw, k, 0, 0, k, cx - k * cx, cy - k * cy)
    return r


def load_page(doc, i: int):
    """doc[i] with a hiding print clip undone (every render of a source page goes through here).
    Whether page i is clipped is remembered on the document object."""
    pg = doc[i]
    seen = getattr(doc, "_pyp_clipped", None)
    if seen is None:
        seen = {}
        doc._pyp_clipped = seen
    if seen.get(i, True):
        seen[i] = neutralise_hidden_clip(pg) is not None
    return pg


def render_page(doc, i: int, scale: float) -> np.ndarray:
    return np.asarray(load_page(doc, i).render(scale=scale).to_pil().convert("RGB"))


class Renderer:
    """Lazy page renderer with a small cache (pypdfium2)."""

    def __init__(self, path, scale=RENDER_SCALE):
        self.path = str(path)
        self.doc = pdfium.PdfDocument(str(path))
        self.scale = scale
        self._cache: dict[int, np.ndarray] = {}

    def __len__(self):
        return len(self.doc)

    def clip_removed(self, i: int) -> bool:
        load_page(self.doc, i)
        return self.doc._pyp_clipped[i]

    def page_array(self, i: int) -> np.ndarray:
        if i not in self._cache:
            if len(self._cache) > 6:
                self._cache.pop(next(iter(self._cache)))
            self._cache[i] = render_page(self.doc, i, self.scale)
        return self._cache[i]

    def region(self, i, x0, top, x1, bottom) -> np.ndarray:
        a = self.page_array(i)
        s = self.scale
        h, w = a.shape[:2]
        X0, X1 = max(0, int(x0 * s)), min(w, int(np.ceil(x1 * s)))
        Y0, Y1 = max(0, int(top * s)), min(h, int(np.ceil(bottom * s)))
        if X1 <= X0 or Y1 <= Y0:
            return np.zeros((0, 0, 3), dtype=np.uint8)
        return a[Y0:Y1, X0:X1]


def _word_cls(w) -> str:
    return classify_rgb01(to_rgb(w.get("non_stroking_color")))


def render_offsets(pm_page) -> tuple[float, float, float, float]:
    """(ox, oy, width, height) mapping pdfplumber coords to the rendered page.

    pdfplumber measures `top` from the MediaBox (top = mb_height - y) and x in
    raw PDF units; pdfium renders the CropBox. So render_x = x - cb_x0 and
    render_top = top - (mb_height - cb_y1)."""
    cb = pm_page.get_cropbox()
    mb = pm_page.get_mediabox()
    h_mb = mb[3] - mb[1]
    return cb[0], h_mb - cb[3], cb[2] - cb[0], cb[3] - cb[1]


def load_text_page(pl_page, index: int, pm_page) -> PageData:
    ox, oy, w, h = render_offsets(pm_page)
    pd = PageData(index=index, width=w, height=h)
    try:
        page = pl_page.dedupe_chars(tolerance=1)
    except Exception:
        page = pl_page
    words = page.extract_words(
        x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False,
        extra_attrs=["non_stroking_color", "size"],
    )
    for w in words:
        t = w["text"].replace("\x00", "\ufffd")  # unmapped glyph -> visible marker
        if not t.strip():
            continue
        pd.tokens.append(Token(index, w["x0"] - ox, w["top"] - oy, w["x1"] - ox,
                               w["bottom"] - oy, t, _word_cls(w), size=float(w.get("size") or 0)))
    for im in pl_page.images:
        pd.images.append(Box(index, im["x0"] - ox, im["top"] - oy, im["x1"] - ox, im["bottom"] - oy))
    for coll in (pl_page.curves, pl_page.lines, pl_page.rects):
        for d in coll:
            pd.drawings.append(Box(index, d["x0"] - ox, d["top"] - oy, d["x1"] - ox, d["bottom"] - oy, "drawing"))
    pd.has_text_layer = len(pd.tokens) > 0
    nchars = sum(len(t.text) for t in pd.tokens)
    pd.textless = nchars < 20
    return pd


def is_ad_page(pd: PageData, renderer: Renderer) -> bool:
    """Full-page publisher ad (e.g. "Test Prime"): no text, and one image (or a
    saturated background) covering most of the page. Detected on pixels so it
    works for pages where the ad is vector art."""
    if not pd.textless:
        return False
    # (a scanned question page is also one big image, so size alone is not enough)
    a = renderer.page_array(pd.index)
    small = a[:: 8, :: 8].astype(np.int16)
    # Ad pages are mostly deep red; question pages are mostly white.
    red_bg = ((small[..., 0] > 120) & (small[..., 1] < 60) & (small[..., 2] < 60)).mean()
    return red_bg > 0.35


# ------------------------------------------------------------------ OCR
def tesseract_tsv(img_rgb: np.ndarray, psm: int = 3, extra: list[str] | None = None) -> list[dict]:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(img_rgb).save(buf, format="PNG")
    cmd = ["tesseract", "stdin", "stdout", "-l", "eng", "--psm", str(psm)] + (extra or []) + ["tsv"]
    out = subprocess.run(cmd, input=buf.getvalue(), capture_output=True, timeout=300)
    rows = []
    reader = csv.DictReader(io.StringIO(out.stdout.decode("utf-8", "replace")), delimiter="\t",
                            quoting=csv.QUOTE_NONE)
    for r in reader:
        try:
            if int(r["level"]) != 5:
                continue
            txt = (r.get("text") or "").strip()
            if not txt:
                continue
            rows.append({
                "left": int(r["left"]), "top": int(r["top"]), "width": int(r["width"]),
                "height": int(r["height"]), "conf": float(r["conf"]), "text": txt,
                "block": int(r["block_num"]), "par": int(r["par_num"]), "line": int(r["line_num"]),
            })
        except (KeyError, ValueError, TypeError):
            continue
    return rows


OCR_SCALE = 300 / 72  # tesseract works best around 300 dpi


def pixel_cls(arr: np.ndarray, min_px: int = 4) -> str:
    """Colour class of a rendered word box: G/R if one key colour clearly dominates."""
    if arr.size == 0:
        return "D"
    g, r = pixel_masks(arr)
    ng, nr = int(g.sum()), int(r.sum())
    if ng >= min_px and ng >= 4 * max(nr, 1):
        return "G"
    if nr >= min_px and nr >= 4 * max(ng, 1):
        return "R"
    return "D"


def layout_binarize(img: np.ndarray) -> np.ndarray:
    """Binarise a 300-dpi render for layout OCR: coloured and grey text become
    black, the pale watermark stays white, and two things that confuse
    tesseract's layout analysis are erased: long table/frame rules and the
    tick/cross icons (coloured blobs taller than any text glyph)."""
    import cv2

    s = OCR_SCALE
    dark = img.min(axis=2)
    ink = (dark < 185).astype(np.uint8)
    # rules
    hk = cv2.getStructuringElement(cv2.MORPH_RECT, (int(40 * s), 1))
    vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, int(25 * s)))
    rules = cv2.morphologyEx(ink, cv2.MORPH_OPEN, hk) | cv2.morphologyEx(ink, cv2.MORPH_OPEN, vk)
    ink[cv2.dilate(rules, np.ones((3, 3), np.uint8)) > 0] = 0
    # short vertical cell borders (header table): thin and >= 11 pt tall
    vs = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, int(11 * s))))
    n, lab, st, _ = cv2.connectedComponentsWithStats(vs, 8)
    for c in range(1, n):
        if st[c, cv2.CC_STAT_WIDTH] <= 0.9 * s:
            x, y, w_, h_ = st[c, 0], st[c, 1], st[c, 2], st[c, 3]
            ink[y:y + h_, max(0, x - 2):x + w_ + 2] = 0
    # icons
    g, r = pixel_masks(img)
    col = cv2.dilate((g | r).astype(np.uint8), np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(col, 8)
    m = int(0.8 * s)
    for c in range(1, n):
        w, h = stats[c, cv2.CC_STAT_WIDTH], stats[c, cv2.CC_STAT_HEIGHT]
        if 6.8 * s <= h <= 20 * s and 5.0 * s <= w <= 18 * s:
            x, y = stats[c, cv2.CC_STAT_LEFT], stats[c, cv2.CC_STAT_TOP]
            ink[max(0, y - m):y + h + m, max(0, x - m):x + w + m] = 0  # whole icon box
    return np.where(ink > 0, 0, 255).astype(np.uint8)


ANCHOR_RX = re.compile(r"^(Q[.,]?\d{1,3}[.,]?|Ans\W?|[1-4][.,:]?)$")


def load_ocr_page(pdf_doc, pd: PageData) -> PageData:
    """Fill pd.tokens from tesseract on a 300-dpi render (English model only).

    Pass 1 reads the whole page (layout + text). Pass 2 reads only the left
    strip holding "Q.n", "Ans", the icons and the option numbers, with a
    block layout, because full-page layout analysis tends to drop isolated
    option numbers next to figures. Pass-2 tokens are used only as anchors.
    """
    img = render_page(pdf_doc, pd.index, OCR_SCALE)
    bw = layout_binarize(img)
    rows = tesseract_tsv(np.stack([bw] * 3, axis=2), psm=3)
    s = OCR_SCALE
    main = []
    for r in rows:
        x0, y0 = r["left"], r["top"]
        x1, y1 = x0 + r["width"], y0 + r["height"]
        txt = re.sub(r"^[\[\]|{}]+(?=\w)", "", r["text"])  # table-border debris glued to a word
        if re.fullmatch(r"[\[\]|{}!]+", txt):
            continue
        r["text"] = txt
        cls = pixel_cls(img[y0:y1, x0:x1], min_px=12)
        main.append(Token(pd.index, x0 / s, y0 / s, x1 / s, y1 / s, r["text"], cls, "ocr", r["conf"]))
    # pass 2: anchor strip
    W = bw.shape[1]
    X0, X1 = int(0.06 * pd.width * s), int(0.165 * pd.width * s)
    strip = np.full_like(bw, 255)
    strip[:, X0:X1] = bw[:, X0:X1]
    for r in tesseract_tsv(np.stack([strip] * 3, axis=2), psm=6):
        if not ANCHOR_RX.match(r["text"]):
            continue
        x0, y0 = r["left"], r["top"]
        x1, y1 = x0 + r["width"], y0 + r["height"]
        t = Token(pd.index, x0 / s, y0 / s, x1 / s, y1 / s, r["text"],
                  pixel_cls(img[y0:y1, x0:x1], min_px=6), "ocr", r["conf"])
        hit = None
        for m in main:
            ix = min(m.x1, t.x1) - max(m.x0, t.x0)
            iy = min(m.bottom, t.bottom) - max(m.top, t.top)
            if ix > 0 and iy > 0 and ix * iy > 0.3 * (t.x1 - t.x0) * (t.bottom - t.top):
                hit = m
                break
        if hit is None:
            main.append(t)
        elif not ANCHOR_RX.match(hit.text) and not re.match(r"^[1-4][.,]\S", hit.text):
            main.remove(hit)
            main.append(t)
    pd.tokens.extend(main)
    pd.ocr = True
    return pd


# ------------------------------------------------------------- loading
LAYOUT_OCR_VERSION = 1  # bump when load_ocr_page / layout_binarize change (invalidates the cache)


def load_document(path, want_ocr=True, log=None):
    """Return (pages, renderer). Chrome images are tagged; print furniture is located."""
    from common import sha256
    renderer = Renderer(path)
    renderer.sha = sha256(path)
    pages: list[PageData] = []
    with pdfplumber.open(str(path)) as pdf:
        for i, p in enumerate(pdf.pages):
            if renderer.doc[i].get_rotation():
                if log:
                    log(f"page {i}: rotated page; coordinates may be wrong")
            try:
                pd = load_text_page(p, i, renderer.doc[i])
            except Exception as e:  # pragma: no cover - defensive
                pd = PageData(index=i, width=p.width, height=p.height, has_text_layer=False, textless=True)
                if log:
                    log(f"page {i}: text layer error {e}")
            pages.append(pd)
    for pd in pages:
        pd.ad_page = is_ad_page(pd, renderer)
    if want_ocr:
        from ocr_cache import Store
        from workers import _ocr_page, pmap
        cache = Store(f"layout-{renderer.sha[:24]}-v{LAYOUT_OCR_VERSION}")
        want = [pd for pd in pages if pd.textless and not pd.ad_page]
        jobs = [(str(path), pd.index, pd.width, pd.height) for pd in want if pd.index not in cache]
        for index, tokens in pmap(_ocr_page, jobs):
            cache.put(index, tokens)
        cache.save()
        for pd in want:
            pd.tokens = list(cache.get(pd.index))
            pd.ocr = True
    tag_chrome_images(pages)
    return pages, renderer


def tag_chrome_images(pages: list[PageData]) -> None:
    """Images/drawings repeated at the same place on many pages (logo, Play
    badge, watermark, page frame) are publisher chrome, not question content.

    Also chrome: a page-sized image (the scan of a whole page is its background, not a figure
    of any one question), and a large image whose size repeats on many pages wherever it sits
    (the Adda247 watermark moves between the shifts of a compiled file, so its position alone
    does not repeat often enough). "Large" is >= 60,000 pt^2 (about 245 x 245 pt); stem and
    option images that share a display size across pages are far smaller."""
    sig = Counter()
    size_pages: dict[tuple, set] = {}
    for pd in pages:
        for b in pd.images + pd.drawings:
            sig[(b.kind, round(b.x0), round(b.top), round(b.w), round(b.h))] += 1
            if b.kind == "image" and b.w * b.h >= 60000:
                size_pages.setdefault((round(b.w), round(b.h)), set()).add(pd.index)
    n = max(1, sum(1 for p in pages if not p.ad_page))
    for pd in pages:
        first_text = min((t.top for t in pd.tokens), default=float("inf"))
        for b in pd.images + pd.drawings:
            k = (b.kind, round(b.x0), round(b.top), round(b.w), round(b.h))
            small_icon = b.kind == "image" and b.w <= 26 and b.h <= 18
            repeated = sig[k] >= max(3, 0.25 * n) and not small_icon
            # a logo at the page top sits above all the page's text; an image below a text line
            # there is content (e.g. a 2017 stem image right under its "QID" line)
            top_chrome = b.kind == "image" and b.bottom < 110 and b.h < 60 and (b.x0 < 150 or b.x1 > pd.width - 150) \
                and b.bottom <= first_text + 2
            background = b.kind == "image" and b.w >= 0.85 * pd.width and b.h >= 0.6 * pd.height
            same_size = b.kind == "image" and b.w * b.h >= 60000 and \
                len(size_pages.get((round(b.w), round(b.h)), ())) >= max(5, 0.1 * n)
            if repeated or top_chrome or background or same_size:
                b.kind = "chrome"
            elif small_icon:
                b.kind = "icon?"


def ocr_regions(renderer: Renderer, page: int, boxes: dict, min_conf: float = 75.0) -> dict:
    """OCR several regions of one page in a single tesseract call.

    Only the requested regions are pasted onto a white canvas (so text-layer
    words and icons are never re-read). Text colour is flattened by taking the
    darkest channel, which turns the red/green option text dark while the pale
    watermark stays light. Returns {name: (text|None, mean_conf, n_words)}.
    """
    from PIL import Image

    s = OCR_SCALE
    full = render_page(renderer.doc, page, s)
    H, W = full.shape[:2]
    canvas = np.full((H, W), 255, dtype=np.uint8)
    darkest = full.min(axis=2)
    for name, (_, x0, top, x1, bottom) in boxes.items():
        X0, X1 = max(0, int(x0 * s)), min(W, int(x1 * s))
        Y0, Y1 = max(0, int(top * s)), min(H, int(bottom * s))
        if X1 > X0 and Y1 > Y0:
            canvas[Y0:Y1, X0:X1] = darkest[Y0:Y1, X0:X1]
    canvas = np.where(canvas < 170, 0, 255).astype(np.uint8)
    rows = tesseract_tsv(np.stack([canvas] * 3, axis=2), psm=3)
    out = {}
    for name, (_, x0, top, x1, bottom) in boxes.items():
        toks = []
        for r in rows:
            cx = (r["left"] + r["width"] / 2) / s
            cy = (r["top"] + r["height"] / 2) / s
            if x0 <= cx <= x1 and top <= cy <= bottom:
                toks.append(Token(page, r["left"] / s, r["top"] / s, (r["left"] + r["width"]) / s,
                                  (r["top"] + r["height"]) / s, r["text"], "D", "ocr", r["conf"]))
        if not toks:
            out[name] = (None, 0.0, 0)
            continue
        conf = float(np.mean([t.conf for t in toks]))
        from digialm import build_lines  # local import to avoid a cycle at load time
        text = "\n".join(" ".join(t.text for t in ln.tokens) for ln in build_lines(toks)).strip()
        if conf < min_conf or not any(ch.isalnum() for ch in text):
            out[name] = (None, conf, len(toks))
        else:
            out[name] = (text, conf, len(toks))
    return out
