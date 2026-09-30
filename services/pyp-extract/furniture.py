"""Browser print furniture: the header (print timestamp + page URL) and footer (URL + page
counter "33/58") that a browser adds when a response sheet is printed to PDF.

It is neither question content nor publisher branding, and the URL identifies the candidate's
response sheet, so it must never reach a crop or the JSON. Zones are found from the geometry
of each PDF:

1. On every page, a text line (text layer or layout OCR) in the top or bottom 7 % of the page is
   furniture when it carries a URL (http, ://, www., digialm, .com, .php, ...), a print
   timestamp (dd/mm/yy[yy], hh:mm AM/PM) or ends in a page counter "n/m" at the right edge.
2. Per page-size group of the PDF (pages of one print job share a size), the header zone runs
   from the top edge to the lowest header-furniture line seen on any page of the group (+2 pt)
   and the footer zone from the highest footer-furniture line (-2 pt) to the bottom edge. A group
   zone needs furniture on at least two pages; otherwise only that page's own lines count.
3. Every page of the group gets the zones, including pages whose furniture OCR did not read.

Tokens, images and drawings inside a zone are removed from the page before parsing, and crops
blank the zones in pixels (belt and braces; crops are also clamped to the content between the
zones). A digialm page's content frame starts below the header and ends above the footer, so
the zones never cover question content; tokens dropped from a zone that are not furniture
themselves are recorded in PageData.furniture_dropped for review.
"""
from __future__ import annotations

import re
from collections import defaultdict

URL_RX = re.compile(r"(https?\s*:|://|www\.|digialm|\.com\b|\.co\.in|\.in/|\.php|thepracticetest|Assessment\s*QP|"
                    r"/per/g\d|touchstone)", re.I)
STAMP_RX = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b|\b\d{1,2}:\d{2}\s*[AP]\.?\s?M\b", re.I)
COUNTER_RX = re.compile(r"^(\d{1,3})\s*/\s*(\d{1,3})$")

# a URL printed anywhere on a page (a third-party watermark such as "www.exammix.com" in the
# Sep-2019 Hindi sheets) is not question content either
STRAY_URL_RX = re.compile(r"^(https?://\S+|www\.\S+|\S+\.(com|net|org)(/\S*)?)$", re.I)

EDGE = 0.07  # furniture lines live in the top / bottom 7 % of the page
PAD = 2.0


def furniture_kind(line, width: float) -> str | None:
    """'url', 'stamp' or 'counter' when a line is print furniture, else None."""
    text = line.text
    if URL_RX.search(text):
        return "url"
    if STAMP_RX.search(text):
        return "stamp"
    last = line.tokens[-1]
    m = COUNTER_RX.match(last.text)
    if m and 1 <= int(m.group(1)) <= int(m.group(2)) and last.x0 > 0.8 * width:
        return "counter"
    return None


def detect(pages) -> dict:
    """Find the furniture zones of every page, drop what lies inside them, and return a
    summary {"groups": {...}, "pages_with_zones": n, "dropped_non_furniture_tokens": n}."""
    from digialm import build_lines  # local import: digialm imports pages

    own: dict[int, list[tuple[str, float, float, str]]] = defaultdict(list)  # page -> (edge, top, bottom, kind)
    for pd in pages:
        if pd.ad_page or not pd.tokens:
            continue
        for ln in build_lines(pd.tokens):
            if ln.top < EDGE * pd.height and ln.bottom < 0.12 * pd.height:
                edge = "head"
            elif ln.bottom > (1 - EDGE) * pd.height and ln.top > 0.88 * pd.height:
                edge = "foot"
            else:
                continue
            kind = furniture_kind(ln, pd.width)
            if kind:
                own[pd.index].append((edge, ln.top, ln.bottom, kind))
    groups: dict[tuple[int, int], dict] = {}
    for pd in pages:
        g = groups.setdefault((round(pd.width), round(pd.height)), {"head": [], "foot": [], "pages": 0})
        g["pages"] += 1
        for edge, top, bottom, _ in own.get(pd.index, []):
            g[edge].append((pd.index, top, bottom))
    zones_by_group = {}
    for key, g in groups.items():
        z = {}
        if len({p for p, _, _ in g["head"]}) >= 2:
            z["head"] = max(b for _, _, b in g["head"]) + PAD
        if len({p for p, _, _ in g["foot"]}) >= 2:
            z["foot"] = min(t for _, t, _ in g["foot"]) - PAD
        zones_by_group[key] = z
    dropped_other = 0
    n_pages = 0
    n_urls = 0
    for pd in pages:
        urls = [t for t in pd.tokens if STRAY_URL_RX.match(t.text)]
        if urls:
            pd.stray_urls = [(t.x0 - 1.5, t.top - 1.5, t.x1 + 1.5, t.bottom + 1.5) for t in urls]
            pd.tokens = [t for t in pd.tokens if not STRAY_URL_RX.match(t.text)]
            n_urls += len(urls)
        z = zones_by_group.get((round(pd.width), round(pd.height)), {})
        bands = []
        if "head" in z:
            bands.append((0.0, z["head"]))
        if "foot" in z:
            bands.append((z["foot"], pd.height))
        for edge, top, bottom, _ in own.get(pd.index, []):
            bands.append((0.0, bottom + PAD) if edge == "head" else (top - PAD, pd.height))
        pd.furniture = merge_bands(bands)
        if not pd.furniture:
            continue
        n_pages += 1
        keep, drop = [], []
        for t in pd.tokens:
            cy = (t.top + t.bottom) / 2
            (drop if any(a <= cy <= b for a, b in pd.furniture) else keep).append(t)
        pd.tokens = keep
        if drop:
            from digialm import build_lines as _bl
            other = [ln.text for ln in _bl(drop) if not furniture_kind(ln, pd.width)]
            pd.furniture_dropped = other
            dropped_other += len(other)
        for b in pd.images + pd.drawings:
            if any(a - 1 <= b.top and b.bottom <= bb + 1 for a, bb in pd.furniture):
                b.kind = "chrome"
    return {"groups": {f"{k[0]}x{k[1]}": v for k, v in zones_by_group.items() if v},
            "pages_with_zones": n_pages, "dropped_non_furniture_lines": dropped_other,
            "stray_url_tokens_blanked": n_urls}


def merge_bands(bands):
    out = []
    for a, b in sorted(bands):
        if out and a <= out[-1][1] + 0.5:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return [(round(a, 2), round(b, 2)) for a, b in out]


def content_limits(pd) -> tuple[float, float]:
    """(top, bottom) of the page area outside the furniture zones."""
    top, bottom = 0.0, pd.height
    for a, b in getattr(pd, "furniture", []):
        if a <= 1.0:
            top = max(top, b)
        elif b >= pd.height - 1.0:
            bottom = min(bottom, a)
    return top, bottom
