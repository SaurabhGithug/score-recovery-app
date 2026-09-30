"""Shared helpers: colour classification, paths, hashing, text quality.

Colour rules are the heart of key detection, so they live in one place and are
deliberately strict: a pixel/char is only "green" or "red" when it is strongly
saturated in that hue. The pale-pink Adda247 watermark and the dark-grey body
text never qualify.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
SOURCES = REPO / "data" / "pyp-sources"
PARSED = SOURCES / "parsed"
CROPS = REPO / "data" / "storage" / "pyp-crops"

RENDER_SCALE = 2.0  # crops and icon analysis both use this bitmap (144 dpi)

OPTION_IDS = ["A", "B", "C", "D"]


# ----------------------------------------------------------------- colours
def to_rgb(color) -> tuple[float, float, float] | None:
    """pdfplumber non_stroking_color (gray / rgb / cmyk, 0..1) -> rgb 0..1."""
    if color is None:
        return None
    if isinstance(color, (int, float)):
        color = (color,)
    try:
        c = [float(v) for v in color]
    except (TypeError, ValueError):
        return None  # pattern colour etc.
    if len(c) == 1:
        return (c[0], c[0], c[0])
    if len(c) == 3:
        return (c[0], c[1], c[2])
    if len(c) == 4:
        cc, m, y, k = c
        return ((1 - cc) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
    return None


def classify_rgb01(rgb) -> str:
    """'G' (answer-key green), 'R' (answer-key red) or 'D' (anything else)."""
    if rgb is None:
        return "D"
    r, g, b = rgb
    if g >= 0.55 and g - r >= 0.25 and g - b >= 0.2:
        return "G"
    if r >= 0.7 and r - g >= 0.4 and r - b >= 0.4:
        return "R"
    return "D"


def pixel_masks(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Boolean masks of strongly green / strongly red pixels in an RGB uint8 array."""
    a = arr.astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # Thresholds measured on all families: vector red text (247,24,24), dark
    # red crosses (121,9,2), JPEG-scan red digits (175,100,100); the pink
    # Adda247 watermark is (250,215,215) in vector files and ~(225,175,175)
    # in scans, and where it overlaps black text ~(100,50,50) -- all with
    # r-g <= 50, so r-g >= 60 separates them.
    green = (g >= 100) & (g - r >= 45) & (g - b >= 40) & (r <= 170)
    red = (r >= 110) & (r - g >= 60) & (r - b >= 55) & (g <= 130)
    return green, red


# ------------------------------------------------------------------ misc
def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def rel(path: Path) -> str:
    return str(Path(path).resolve().relative_to(REPO))


def load_source_urls() -> dict[tuple[str, str], str]:
    """(publisher, basename) -> pdf_url, from the two listing files."""
    out: dict[tuple[str, str], str] = {}
    for publisher, listing in (
        ("careerpower", SOURCES / "careerpower" / "listing.json"),
        ("adda247", SOURCES / "adda247-listing.json"),
    ):
        if not listing.exists():
            continue
        data = json.loads(listing.read_text())
        for p in data.get("papers", []):
            url = p.get("pdf_url") or ""
            base = url.rsplit("/", 1)[-1]
            if base:
                out.setdefault((publisher, base), url)
    return out


# ----------------------------------------------------------- text quality
DEVA = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")
# Dependent vowel signs / virama / nukta / anusvara that can never begin a word.
DEVA_DEPENDENT = re.compile(r"(?:^|\s)[ऀ-ःऺ-ॏ॑-ॗॢॣ]")
# Latin-1 supplement / mojibake glyphs that should not appear in these papers.
MOJIBAKE = re.compile(r"[À-ÿĀ-ɏ†-•�\u0080-\u009F]")
OK_LATIN1 = set("×÷°±µ²³¹·½¼¾º")


def devanagari_share(text: str) -> tuple[int, int]:
    return len(DEVA.findall(text)), len(LATIN.findall(text))


def text_is_garbled(text: str) -> tuple[bool, str]:
    """Heuristic for mis-encoded text-layer output.

    Devanagari in these PDFs is often stored in *visual* order with conjuncts
    missing from the ToUnicode map, so a word can start with a dependent vowel
    sign ("िनि त") or have holes ("सं ाओ ं"). Either signal means the text layer
    is not a faithful transcription; the crop is authoritative.
    """
    if not text:
        return False, ""
    moj = [c for c in MOJIBAKE.findall(text) if c not in OK_LATIN1]
    if len(moj) >= 3:
        return True, f"mojibake_chars:{len(moj)}"
    deva, _ = devanagari_share(text)
    if deva >= 8:
        bad = len(DEVA_DEPENDENT.findall(text))
        if bad >= 1:
            return True, f"devanagari_visual_order_or_missing_glyphs:{bad}"
    if "�" in text:
        return True, "replacement_char"
    return False, ""


def norm_space(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[ \t ]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return s.strip()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1))
    os.replace(tmp, path)


def crop_key_for(paper_key: str, src_name: str, used_keys: dict) -> tuple[str, str | None]:
    """Crop directory for a paper. The first source (in run order) that
    produces a paper key owns data/storage/pyp-crops/<paper-key>/; any other
    source producing the same key gets <paper-key>--dup-<source-stem>/ so two
    files never overwrite each other's crops. Ownership is recorded in a
    .source marker, so single-file re-runs keep the same assignment."""
    marker = CROPS / paper_key / ".source"
    owner = used_keys.get(paper_key)
    if owner is None and marker.exists():
        owner = marker.read_text().strip()
    if owner is None or owner == src_name:
        used_keys[paper_key] = src_name
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(src_name)
        return paper_key, None
    return f"{paper_key}--dup-{Path(src_name).stem}", owner
