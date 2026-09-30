"""On-disk OCR cache, so a re-run does not repeat the slow OCR.

Two stores per source PDF (keyed by the PDF's sha256), under services/pyp-extract/.cache/:

* layout-<sha>-v<N>.pkl.gz: the layout-OCR tokens of each textless page (pages.load_ocr_page).
  Bump pages.LAYOUT_OCR_VERSION when that code changes.
* lines-<sha>-v<N>.pkl.gz: the two engines' readings of each text-line image
  (ocr_consensus.PageOCR), keyed by a hash of the line's pixels. A line whose pixels are
  unchanged is not read again; a line whose crop changed (e.g. a wider OCR box that now
  includes a letter that was cut off) is a new key and is read again. Bump
  ocr_consensus.LINE_OCR_VERSION when the engines or their settings change.

Only the main process writes; workers read a snapshot and return new entries. Delete the
folder to force a full re-read.
"""
from __future__ import annotations

import gzip
import hashlib
import os
import pickle
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent / ".cache"


class Store:
    def __init__(self, name: str):
        self.path = CACHE_DIR / f"{name}.pkl.gz"
        self.data: dict = {}
        self.dirty = False
        if self.path.exists():
            try:
                with gzip.open(self.path, "rb") as f:
                    self.data = pickle.load(f)
            except Exception:  # a corrupt cache is only a slower run
                self.data = {}

    def get(self, key):
        return self.data.get(key)

    def __contains__(self, key):
        return key in self.data

    def put(self, key, value):
        self.data[key] = value
        self.dirty = True

    def update(self, entries: dict):
        if entries:
            self.data.update(entries)
            self.dirty = True

    def save(self):
        if not self.dirty:
            return
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        gi = CACHE_DIR / ".gitignore"
        if not gi.exists():
            gi.write_text("*\n")
        tmp = self.path.with_suffix(".tmp")
        with gzip.open(tmp, "wb", compresslevel=3) as f:
            pickle.dump(self.data, f, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp, self.path)
        self.dirty = False


def image_key(img) -> str:
    """Hash of a uint8 image's shape and pixels."""
    h = hashlib.sha1()
    h.update(repr(img.shape).encode())
    h.update(img.tobytes())
    return h.hexdigest()
