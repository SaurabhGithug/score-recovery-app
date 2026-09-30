"""Process-pool helpers: OCR is the slow part, pages are independent.

Workers only compute (tokens / region texts); the main process assembles the
results in page order, so output is identical to a sequential run.
"""
from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor

_R = {}


def _renderer(path):
    from pages import Renderer
    if path not in _R:
        _R.clear()
        _R[path] = Renderer(path)
    return _R[path]


def _ocr_page(args):
    path, index, width, height = args
    from pages import PageData, load_ocr_page
    pd = PageData(index=index, width=width, height=height)
    load_ocr_page(_renderer(path).doc, pd)
    return index, pd.tokens


_LINES: dict = {}


def _read_regions(args):
    """Two-engine OCR of one page's regions. Returns (page, results, new cache entries)."""
    path, page, boxes, strip, cache_name = args
    from ocr_cache import Store
    from ocr_consensus import PageOCR
    if cache_name not in _LINES:
        _LINES.clear()
        _LINES[cache_name] = Store(cache_name).data  # read-only snapshot; the parent writes
    ocr = PageOCR(_renderer(path))
    res = ocr.read_regions(page, boxes, strip_option_number=strip, cache=_LINES[cache_name])
    return page, res, ocr.new_entries


def workers() -> int:
    return max(1, min(6, (os.cpu_count() or 2) - 2, int(os.environ.get("PYP_WORKERS", "6"))))


def pmap(fn, jobs):
    """Ordered parallel map (falls back to serial for tiny job lists)."""
    if len(jobs) <= 1 or workers() == 1:
        return [fn(j) for j in jobs]
    with ProcessPoolExecutor(max_workers=workers()) as ex:
        return list(ex.map(fn, jobs, chunksize=1))
