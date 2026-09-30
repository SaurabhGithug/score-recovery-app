#!/usr/bin/env python3
"""SSC JE Civil previous-year-paper extractor (digialm response sheets).

    python3 services/pyp-extract/extract.py                 # all 40 source PDFs
    python3 services/pyp-extract/extract.py path/to/a.pdf   # selected files
    python3 services/pyp-extract/extract.py --no-ocr        # skip textless pages

Writes data/pyp-sources/parsed/<stem>[--<date>-<HHMM>].json, question crops
under data/storage/pyp-crops/<paper-key>/<position>.png and
data/pyp-sources/parsed/_summary.json. Deterministic: same input, same output.

Truth rule: the answer key is emitted only when two independent signals (the
option's fill colour and the tick/cross icon colour) name the same option.
Anything else -> key null + warning. The candidate's "Chosen Option", roll
number, name and venue are never written anywhere.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (CROPS, OPTION_IDS, crop_key_for, PARSED, REPO, SOURCES, devanagari_share, load_source_urls,  # noqa: E402
                    norm_space, rel, sha256, text_is_garbled, write_json)
import digialm  # noqa: E402
import furniture  # noqa: E402
import other_layouts  # noqa: E402
from ocr_consensus import PageOCR  # noqa: E402
from pages import load_document  # noqa: E402

EXPECTED = {"P1": 200, "P2": 100}
P1_SECTIONS = [("reason", 50), ("awareness", 50), ("civil", 100)]


def publisher_of(path: Path) -> str:
    return "adda247" if "adda247" in path.parts else "careerpower"


# ---------------------------------------------------------------- figures
def has_figure(q: dict, pages) -> tuple[bool, list[str]]:
    why = []
    figs = [b for b in q["figures"] if b.w * b.h > 30]
    if figs:
        why.append(f"images:{len(figs)}")
    # vector drawings other than frame rules / the ID box
    sig = []
    regs = {r[0]: r[1:] for r in q["regions"]}
    for d in q["drawings"]:
        w, h = d.w, d.h
        reg = regs.get(d.page)
        if not reg or d.x0 < reg[0] - 1 or d.x1 > reg[2] + 1 or d.top < reg[1] - 1 or d.bottom > reg[3] + 1:
            continue  # not inside the question content (e.g. frame, ID box outline)
        ib = q["idbox"].get(d.page)
        if ib and d.x1 > ib[0] - 60 and d.bottom > ib[1] - 5 and d.top < ib[3]:
            continue  # ID box outline
        if (w < 2.0 and h > 60) or (h < 2.0 and w > 150):
            continue  # frame rules / separators
        if max(w, h) < 4:
            continue
        if w > 0.7 * pages[d.page].width:
            continue  # section bar / block frame
        sig.append(d)
    if pages[q["page"]].textless:
        # no text layer: on the 2022 files every glyph is a vector path, so
        # only drawings of figure size count
        sig = [d for d in sig if d.w >= 15 and d.h >= 15]
        if sig:
            why.append(f"large_drawings:{len(sig)}")
    elif len(sig) >= 3 or any(d.w * d.h >= 1500 for d in sig):
        why.append(f"drawings:{len(sig)}")
    tall = sum(r[4] - r[2] for r in q["regions"])
    if len((q["stem"] or "").strip()) < 12 and tall > 140:
        why.append("short_stem_tall_block")
    return bool(why), why


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def valid_date(iso: str) -> bool:
    import datetime
    try:
        d = datetime.date.fromisoformat(iso)
    except ValueError:
        return False
    return 2014 <= d.year <= 2026


def filename_date(name: str) -> str | None:
    """Exam date encoded in a source filename (used only as a labelled fallback)."""
    m = re.search(r"(\d{1,2})[-.](\d{1,2})[-.](20\d\d)", name) or re.search(r"(\d{2})(\d{2})(20\d\d)", name)
    if m:
        iso = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        return iso if valid_date(iso) else None
    m = re.search(r"(\d{1,2})[-.]([A-Za-z]{3,9})[-.](20\d\d)", name)
    if m and m.group(2)[:3].lower() in MONTHS:
        iso = f"{m.group(3)}-{MONTHS[m.group(2)[:3].lower()]:02d}-{int(m.group(1)):02d}"
        return iso if valid_date(iso) else None
    return None


def question_language(text: str) -> str:
    deva, lat = devanagari_share(text)
    if deva >= 5 and deva >= 0.5 * lat:
        return "hi"
    if lat >= 8 and deva == 0:
        return "en"
    return "neutral"


# ------------------------------------------------------------------ crops
def write_crop(renderer, regions, blanks: dict, pages, out_path: Path) -> bool:
    """Render the question's per-page regions, white out every ID box that reaches into them
    (`blanks`: page -> [(x0, top, x1, bottom)], any question's) and the print header/footer
    zones of each page, and stack the parts with a 6 px grey separator. Returns False (and
    writes nothing) when there is no region."""
    s = renderer.scale
    parts = []
    for p, x0, top, x1, bottom in regions:
        a = renderer.page_array(p).copy()
        for bx0, bt, bx1, bb in blanks.get(p, ()):
            if bb <= top or bt >= bottom or bx1 <= x0 or bx0 >= x1:
                continue
            a[max(0, int(bt * s)):int(np.ceil(bb * s)), max(0, int(bx0 * s)):int(np.ceil(bx1 * s))] = 255
        for zt, zb in getattr(pages[p], "furniture", ()):
            a[max(0, int(zt * s)):int(np.ceil(zb * s)), :] = 255
        for ux0, ut, ux1, ub in getattr(pages[p], "stray_urls", ()):
            a[max(0, int(ut * s)):int(np.ceil(ub * s)), max(0, int(ux0 * s)):int(np.ceil(ux1 * s))] = 255
        sub = a[int(top * s):int(np.ceil(bottom * s)), int(x0 * s):int(np.ceil(x1 * s))]
        if sub.size:
            parts.append(sub)
    if not parts:
        return False
    width = max(p.shape[1] for p in parts)
    gap = np.full((6, width, 3), 200, dtype=np.uint8)
    rows = []
    for k, p in enumerate(parts):
        if p.shape[1] < width:
            p = np.concatenate([p, np.full((p.shape[0], width - p.shape[1], 3), 255, dtype=np.uint8)], axis=1)
        if k:
            rows.append(gap)
        rows.append(p)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.concatenate(rows, axis=0)).save(out_path, optimize=True)
    return True


def text_quality_of(stem, opts, base: str) -> str:
    """A label is only as good as what was read: a null stem or option is never 'text_layer'
    or 'ocr' (nor 'garbled'): it is 'incomplete'."""
    if not stem or any(not o["text"] for o in opts):
        return "incomplete"
    return base


# ------------------------------------------------------------- per shift
def build_shift_output(src: Path, meta: dict, shift: dict, qs: list[dict], pages, renderer,
                       multi: bool, used_keys: dict, urls, blanks: dict) -> tuple[dict, str]:
    publisher = publisher_of(src)
    hm = digialm.header_meta(shift)
    paper = hm["paper"]
    file_warn: list[str] = []
    if shift.get("missing_header"):
        file_warn.append("header_not_found")
    if paper is None:
        secs = " | ".join(sorted({(q["section"] or "") for q in qs})).lower()
        if "awareness" in secs:
            # Only Paper-I has a General Awareness section (the GI&R heading is sometimes lost to OCR).
            paper = "P1"
            file_warn.append("paper_inferred_P1_from_sections(header_title_has_no_paper_number)")
        else:
            file_warn.append("paper_not_stated_in_header")

    # language from question text
    langs = [question_language((q["stem"] or "") + " " + " ".join(o or "" for o in q["options"])) for q in qs]
    n_hi, n_en = langs.count("hi"), langs.count("en")
    if n_hi == 0 and n_en > 0:
        language = "en"
    elif n_en == 0 and n_hi > 0:
        language = "hi"
    elif n_hi + n_en == 0:
        language = None
        file_warn.append("language_undetermined")
    else:
        share = n_hi / (n_hi + n_en)
        language = "hi" if share >= 0.6 else "en" if share < 0.05 else "bilingual"
    if language is None:
        name = src.name.lower()
        if "hindi" in name:
            language = "hi"
            file_warn.append("language_from_filename(no_text_to_classify)")
        elif "english" in name:
            language = "en"
            file_warn.append("language_from_filename(no_text_to_classify)")

    date = shift.get("exam_date")
    fdate = filename_date(src.name)
    if date and not valid_date(date):
        file_warn.append(f"header_date_invalid:{date}")
        date = None
    if not date and fdate and not multi:
        date = fdate
        file_warn.append("exam_date_from_filename(header_date_unreadable)")
    elif date and fdate and date != fdate and not multi:
        file_warn.append(f"header_date_{date}_differs_from_filename_{fdate}")
    t = shift.get("exam_time")
    hhmm = t.split("-")[0].replace(":", "") if t else None
    paper_key = f"sscje-civil-{paper or 'P?'}-{date or 'nodate'}-{hhmm or 'notime'}-{language or 'xx'}"
    crop_key, owner = crop_key_for(paper_key, src.name, used_keys)
    if owner:
        file_warn.append(f"same_paper_key_as:{owner}")

    out_questions = []
    sections = []
    figures_n = 0
    for pos, q in enumerate(qs, start=1):
        w = list(q["warnings"])
        sec = q["section"]
        if not sections or sections[-1]["name"] != sec:
            sections.append({"name": sec, "first_position": pos, "count": 0})
        sections[-1]["count"] += 1
        stem = norm_space(q["stem"]) if q["stem"] else None
        opts = []
        for k in range(4):
            txt = norm_space(q["options"][k]) if k < len(q["options"]) and q["options"][k] else None
            if not txt:
                w.append(f"option_{k + 1}_no_text")
            opts.append({"id": OPTION_IDS[k], "printed_number": k + 1, "text": txt or None})
        if not stem:
            w.append("stem_no_text")
        # text quality
        full = (stem or "") + "\n" + "\n".join(o["text"] or "" for o in opts)
        garbled, why = text_is_garbled(full)
        if q["ocr"] or q.get("ocr_parts"):
            tq = "ocr"
            if q.get("ocr_conf") is not None and q["ocr_conf"] < 60:
                tq = "garbled"
                w.append(f"ocr_low_confidence:{q['ocr_conf']:.0f}")
            elif garbled:
                tq = "garbled"
                w.append(why)
            if q.get("ocr_parts"):
                w.append("ocr_text(two-engine agreement):" + ",".join(q["ocr_parts"]))
            w.append("ocr_text_unverified_crop_authoritative")
        elif garbled:
            tq = "garbled"
            w.append(why)
        else:
            tq = "text_layer"
        tq = text_quality_of(stem, opts, tq)
        # key
        ts, ic = q["text_sig"], q["icon_sig"]
        if ts is not None and ic is not None and ts == ic:
            key_n, basis = ts, "text_colour+icon"
        elif ts is not None and ic is not None:
            key_n, basis = None, "none"
            w.append(f"key_disagreement:text_colour={ts},icon={ic}")
        elif q["ocr"] and ic is not None and ts is None and "?" in q["text_detail"]:
            # scanned page, option-text colour unreadable: icon is the only signal
            key_n, basis = ic, "icon_only"
            w.append(f"key_icon_only:text_colour={q['text_detail']}")
        elif (ts is not None and len(q["icon_detail"]) == 4 and q["icon_detail"].count("X") == 3
              and q["icon_detail"][ts - 1] == "-"):
            # The tick was not rendered, but two SSC signals still agree: exactly one option's
            # text is green (the other three red), and SSC's crosses sit on exactly those three
            # red options. Both name the same option (DECISION-002 addendum, 2026-09-29).
            key_n, basis = ts, "text_colour+crosses"
            w.append(f"key_tick_not_rendered:text_colour={q['text_detail']},icon={q['icon_detail']}")
        else:
            key_n, basis = None, "none"
            w.append(f"key_missing:text_colour={q['text_detail']},icon={q['icon_detail']}")
        fig, fwhy = has_figure(q, pages)
        if fig:
            figures_n += 1
        crop_rel = f"data/storage/pyp-crops/{crop_key}/{pos}.png"
        why = q.get("crop_why")
        if not why and not write_crop(renderer, q["regions"], blanks, pages, REPO / crop_rel):
            why = "no_region"
        if why:
            (REPO / crop_rel).unlink(missing_ok=True)
            w.append(f"crop_unavailable:{why}")
            crop_rel = None
        if any(renderer.clip_removed(r[0]) for r in q["regions"]):
            w.append("source_page_clip_removed(print clip hid the left/bottom of the page)")
        bbox = None
        if q["regions"]:
            r0 = q["regions"][0]
            bbox = [round(v, 1) for v in r0[1:]]
        out_questions.append({
            "position": pos,
            "printed_number": q["q_number"],
            "section": sec,
            "stem": stem,
            "options": opts,
            "ssc_question_id": q["ssc_question_id"],
            "ssc_option_ids": q["ssc_option_ids"],
            "key": {
                "option_id": OPTION_IDS[key_n - 1] if key_n else None,
                "printed_number": key_n,
                "signals": {"text_colour": ts, "icon": ic, "icon_detail": q["icon_detail"]},
                "basis": basis,
            },
            "page": q["page"] + 1,
            "pages": sorted({r[0] + 1 for r in q["regions"]}),
            "bbox": bbox,
            "crop_regions": [[r[0] + 1] + [round(v, 1) for v in r[1:]] for r in q["regions"]],
            "crop": crop_rel,
            "has_figure": fig,
            "figure_evidence": fwhy,
            "text_quality": tq,
            "language": question_language(full),
            "warnings": w,
        })

    # ------------------------------------------------ validation
    n = len(out_questions)
    exp = EXPECTED.get(paper)
    if exp and n != exp:
        file_warn.append(f"question_count:{n}!={exp}")
    if not exp:
        file_warn.append(f"question_count_unvalidated:{n}")
    # printed numbering must restart per section or run continuously
    prev_sec, prev_num = None, 0
    for q in out_questions:
        if q["section"] != prev_sec:
            prev_sec, prev_num = q["section"], 0 if q["printed_number"] == 1 else prev_num
        if q["printed_number"] != prev_num + 1:
            file_warn.append(f"numbering_gap_before_position:{q['position']}(printed {q['printed_number']} after {prev_num})")
        prev_num = q["printed_number"]
    if paper == "P1" and n == 200:
        counts = [s["count"] for s in sections]
        if counts != [50, 50, 100]:
            file_warn.append(f"section_counts:{counts}")
    bad_opts = [q["position"] for q in out_questions if "options_found:" in " ".join(q["warnings"])]
    if bad_opts:
        file_warn.append(f"questions_without_4_options:{bad_opts[:20]}{'...' if len(bad_opts) > 20 else ''}")

    keyed = sum(1 for q in out_questions if q["key"]["option_id"])
    dis = sum(1 for q in out_questions if any(x.startswith("key_disagreement") for x in q["warnings"]))
    icon_only = sum(1 for q in out_questions if q["key"]["basis"] == "icon_only")
    tq_counts = {}
    for q in out_questions:
        tq_counts[q["text_quality"]] = tq_counts.get(q["text_quality"], 0) + 1

    pages_used = sorted({p for q in out_questions for p in q["pages"]})
    out = {
        "schema": 1,
        "source": {
            "file": rel(src),
            "sha256": meta["sha256"],
            "publisher": publisher,
            "source_url": urls.get((publisher, src.name)) or urls.get(("adda247" if publisher == "careerpower" else "careerpower", src.name)),
            "pages": [pages_used[0], pages_used[-1]] if pages_used else None,
        },
        "paper": {
            "header_title": shift.get("header_title"),
            "cycle_year": hm["cycle_year"],
            "paper": paper,
            "exam_date": date,
            "exam_time": t,
            "subject": shift.get("subject"),
            "language": language,
            "paper_key": paper_key,
        },
        "sections": sections,
        "questions": out_questions,
        "diagnostics": {
            "question_count": n,
            "keyed": keyed,
            "key_disagreements": dis,
            "missing_key": n - keyed,
            "icon_only_keys": icon_only,
            "tick_not_rendered_keys": sum(1 for q in out_questions if q["key"]["basis"] == "text_colour+crosses"),
            "crops_unavailable": sum(1 for q in out_questions if q["crop"] is None),
            "ocr_lines_rejected_as_fragments": sum(q.get("fragment_lines", 0) for q in qs),
            "figures": figures_n,
            "text_quality": tq_counts,
            "question_languages": {"hi": n_hi, "en": n_en, "neutral": langs.count("neutral")},
            "warnings": file_warn,
        },
    }
    stem_name = src.stem
    if multi:
        stem_name += f"--{date}-{hhmm}"
    return out, stem_name


def fill_image_text(by_shift, renderer) -> None:
    """OCR stems/options that exist only as images, one tesseract call per page."""
    per_page: dict[int, list[tuple[dict, str, tuple]]] = {}
    for qs in by_shift.values():
        for q in qs:
            q.setdefault("ocr_parts", [])
            if q["ocr"]:
                # whole-page OCR: discard single-engine text, keep only what two engines confirm
                q["stem"] = ""
                q["options"] = ["", "", "", ""]
                if "stem" not in q["ocr_verify"]:
                    q["warnings"].append("ocr_stem_region_not_verifiable")
                for name, box in q["ocr_verify"].items():
                    per_page.setdefault(box[0], []).append((q, name, box))
                continue
            for name, box in q.get("ocr_needs", {}).items():
                per_page.setdefault(box[0], []).append((q, name, box))
    from ocr_cache import Store
    from ocr_consensus import LINE_OCR_VERSION
    from workers import _read_regions, pmap
    cache_name = f"lines-{renderer.sha[:24]}-v{LINE_OCR_VERSION}"
    jobs, keyed_items = [], []
    for page, items in sorted(per_page.items()):
        boxes = {f"{id(q)}:{name}": box for q, name, box in items}
        strip = {f"{id(q)}:{name}" for q, name, box in items if q["ocr"] and name != "stem"}
        jobs.append((str(renderer.path), page, boxes, strip, cache_name))
        keyed_items.append(items)
    results = pmap(_read_regions, jobs)
    store = Store(cache_name)
    for _, _, new in results:
        store.update(new)
    store.save()
    for items, (page, res, _) in zip(keyed_items, results):
        for q, name, box in items:
            r = res[f"{id(q)}:{name}"]
            label = "stem" if name == "stem" else f"option_{int(name[3:]) + 1}"
            if r["text"]:
                if name == "stem":
                    q["stem"] = r["text"]
                else:
                    q["options"][int(name[3:])] = r["text"]
                q["ocr_parts"].append(label)
            elif r["lines"]:
                q["warnings"].append(f"ocr_rejected_{label}:{r['reason']}")
                q["fragment_lines"] = q.get("fragment_lines", 0) + r.get("fragment_lines", 0)


def id_box_blanks(q: dict, pages) -> list[tuple[int, float, float, float, float]]:
    """Rectangles (page, x0, top, x1, bottom) that cover this question's ID box: the drawn
    outline when found, and the area around its labels (the rounded frame starts ~55 pt left
    of the labels). Never beyond the question's own span, so blanking a box never touches the
    neighbouring question."""
    out = []
    for p, fs in q.get("idframes", {}).items():
        for f in fs:
            out.append((p, f[0], f[1], pages[p].width, f[3]))
    for p, r in q["idbox"].items():
        sp = q["spans"].get(p, (0.0, pages[p].height))
        out.append((p, r[0] - 62, max(r[1] - 12, sp[0]), pages[p].width, min(r[3] + 8, sp[1])))
    return out


def process_digialm(src: Path, pages, renderer, urls, used_keys, log, want_ocr=True) -> list[tuple[str, dict]]:
    meta = {"sha256": renderer.sha}
    pmap = {p.index: p for p in pages}
    frames = {pd.index: digialm.idbox_frames(renderer, pd) for pd in pages if not pd.ad_page}
    shifts, segments = digialm.segment_document(pages, frames)
    stem_col = digialm.stem_column(segments)
    by_shift: dict[int, list[dict]] = {}
    for seg in segments:
        q = digialm.parse_question(seg, pmap, renderer, frames, stem_col)
        q["spans"] = digialm.question_spans(seg, pmap)
        by_shift.setdefault(seg.shift_idx, []).append(q)
    # every ID box on a page is blanked in every crop that reaches it (own or a neighbour's)
    blanks: dict[int, list] = {}
    for qs in by_shift.values():
        for q in qs:
            for b in id_box_blanks(q, pmap):
                blanks.setdefault(b[0], []).append(b[1:])
    for p, fs in frames.items():
        for f in fs:
            blanks.setdefault(p, []).append((f[0], f[1], pmap[p].width, f[3]))
    if want_ocr:
        fill_image_text(by_shift, renderer)
    else:
        for qs in by_shift.values():
            for q in qs:
                if q["ocr"]:
                    q["stem"], q["options"] = "", ["", "", "", ""]
    outs = []
    multi = len([s for s in by_shift if by_shift[s]]) > 1
    for si, shift in enumerate(shifts):
        qs = by_shift.get(si, [])
        if not qs:
            log(f"  shift {si} has no questions")
            continue
        out, name = build_shift_output(src, meta, shift, qs, pmap, renderer, multi, used_keys, urls, blanks)
        outs.append((name, out))
    return outs


def classify_file(pages) -> str:
    text_pages = [p for p in pages if not p.ad_page and p.tokens]
    joined = " ".join(t.text for p in text_pages[:40] for t in p.tokens[:400])
    if re.search(r"\bQID\s*:", joined) and "Correct Answer" in joined:
        return "qid_answer_text"
    if re.search(r"Question\s*ID|Chosen\s*Option|\bAns\b", joined):
        return "digialm"
    return "unknown"


def status_path(src: Path) -> Path:
    return PARSED / "_status" / f"{src.parent.name}__{src.stem}.json"


def main(argv=None):
    import os
    os.environ.setdefault("OMP_NUM_THREADS", "2")  # OCR workers run in parallel
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--no-ocr", action="store_true", help="skip all OCR (textless pages are not parsed)")
    ap.add_argument("--no-text-ocr", action="store_true",
                    help="OCR textless pages for layout/keys only; do not read image text (fast)")
    ap.add_argument("--summarize", action="store_true", help="only rebuild _summary.json from existing outputs")
    args = ap.parse_args(argv)
    files = [Path(f).resolve() for f in args.files] if args.files else sorted(
        list((SOURCES / "careerpower").glob("*.pdf")) + list((SOURCES / "adda247").glob("*.pdf")))
    if args.summarize:
        return summarize()
    urls = load_source_urls()
    PARSED.mkdir(parents=True, exist_ok=True)
    used_keys: dict[str, str] = {}
    for src in files:
        t0 = time.time()
        logs = []
        log = logs.append
        status = {"file": rel(src), "kind": None, "outputs": [], "failure": None}
        # remove this source's previous outputs (names can change between runs)
        old = status_path(src)
        if old.exists():
            for o in json.loads(old.read_text()).get("outputs", []):
                try:  # its crops go too: a question that now has no crop must not keep a stale one
                    for oq in json.loads((REPO / o).read_text()).get("questions", []):
                        if oq.get("crop"):
                            (REPO / oq["crop"]).unlink(missing_ok=True)
                except (OSError, ValueError):
                    pass
                (REPO / o).unlink(missing_ok=True)
        try:
            pages, renderer = load_document(src, want_ocr=not args.no_ocr, log=log)
            status["print_furniture"] = furniture.detect(pages)
            dropped = [(pd.index + 1, t) for pd in pages for t in pd.furniture_dropped]
            if dropped:
                status["print_furniture"]["dropped_lines_sample"] = [f"p{p}: {t[:60]}" for p, t in dropped[:20]]
            kind = classify_file(pages)
            status["kind"] = kind
            if kind == "digialm":
                outs = process_digialm(src, pages, renderer, urls, used_keys, log,
                                       want_ocr=not (args.no_ocr or args.no_text_ocr))
            elif kind == "qid_answer_text":
                outs = other_layouts.process_qid_file(src, pages, renderer, urls, used_keys, log)
            else:
                outs = []
                status["failure"] = unknown_reason(src, pages)
            if not outs and kind != "unknown":
                status["failure"] = f"no questions parsed ({kind}); " + "; ".join(logs[:5])
            for name, out in outs:
                write_json(PARSED / f"{name}.json", out)
                status["outputs"].append(rel(PARSED / f"{name}.json"))
            print(f"{src.name}: {kind} -> {len(outs)} output(s) in {time.time() - t0:.1f}s", flush=True)
        except Exception as e:  # keep going; record the failure
            traceback.print_exc()
            status["failure"] = f"exception: {type(e).__name__}: {e}"
        write_json(status_path(src), status)
    return summarize()


def unknown_reason(src: Path, pages) -> str:
    text = " ".join(t.text for p in pages[:30] for t in p.tokens[:300])
    if "Answer Key" in text or re.search(r"\bQ\s?\d+\b.*\(A\)", text):
        return ("publisher re-typeset layout (2-column, '(A)-(D)' options, publisher 'Answer Key' table and "
                "solutions) -- not an SSC response sheet, no SSC key artefact; not parsed")
    if all(p.textless for p in pages):
        return "no text layer and no digialm structure found by OCR"
    return "layout_not_recognised (not a digialm response sheet or QID/Correct-Answer listing)"


def summarize():
    rows, failures = [], []
    for st in sorted((PARSED / "_status").glob("*.json")):
        s = json.loads(st.read_text())
        if s.get("failure"):
            failures.append({"file": s["file"], "reason": s["failure"]})
        for o in s.get("outputs", []):
            p = REPO / o
            if not p.exists():
                continue
            out = json.loads(p.read_text())
            d, pp = out["diagnostics"], out["paper"]
            rows.append({
                "output": o,
                "source": out["source"]["file"],
                "identity": f"{pp['paper']}|{pp['exam_date']}|{pp['exam_time']}|{pp['language']}",
                "paper_key": pp["paper_key"],
                "cycle_year": pp["cycle_year"],
                "questions": d["question_count"],
                "keyed": d["keyed"],
                "key_disagreements": d["key_disagreements"],
                "missing_key": d["missing_key"],
                "icon_only_keys": d.get("icon_only_keys", 0),
                "answer_text_keys": d.get("answer_text_keys", 0),
                "tick_not_rendered_keys": d.get("tick_not_rendered_keys", 0),
                "crops_unavailable": d.get("crops_unavailable", 0),
                "ocr_lines_rejected_as_fragments": d.get("ocr_lines_rejected_as_fragments", 0),
                "figures": d["figures"],
                "text_quality": d["text_quality"],
                "warnings": d["warnings"],
            })
    ident: dict[str, list[str]] = {}
    for r in rows:
        ident.setdefault(r["identity"], []).append(r["output"])
    summary = {
        "schema": 1,
        "outputs": rows,
        "duplicate_identities": {k: v for k, v in ident.items() if len(v) > 1},
        "same_question_set": same_question_sets([r["output"] for r in rows]),
        "cross_file_key_check": cross_check([r["output"] for r in rows]),
        "unparsed": failures,
    }
    write_json(PARSED / "_summary.json", summary)
    return summary


def same_question_sets(outputs: list[str]) -> list[dict]:
    """Outputs that are the same sitting by content: >= 90 % shared SSC
    question IDs (robust to language / header differences)."""
    sets = {}
    for o in outputs:
        out = json.loads((REPO / o).read_text())
        ids = {q["ssc_question_id"] for q in out["questions"] if q.get("ssc_question_id")}
        if len(ids) >= 20:
            sets[o] = ids
    res = []
    keys = sorted(sets)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = sets[keys[i]], sets[keys[j]]
            share = len(a & b) / min(len(a), len(b))
            if share >= 0.9:
                res.append({"a": keys[i], "b": keys[j], "shared_question_ids": len(a & b), "share": round(share, 3)})
    return res


def _canon_opt(t):
    import unicodedata
    t = unicodedata.normalize("NFKC", t or "")
    t = re.sub(r"[‘’`´]", "'", t)
    t = re.sub(r"[–—−]", "-", t)
    return re.sub(r"\s+", "", t).lower()


def cross_check(outputs: list[str]) -> dict:
    """Independent check across files: the same SSC Question ID must carry the
    same key everywhere. digialm shuffles question AND option order per
    candidate, so printed numbers are not comparable across sheets. Keys are
    compared (a) by SSC option ID when both copies have option IDs, else
    (b) by the key option's text when both copies have the same set of four
    trusted option texts (text_layer or two-engine OCR). Otherwise the pair is "not comparable".
    Nothing is filled in from other files."""
    by_qid: dict[str, list[dict]] = {}
    for o in outputs:
        out = json.loads((REPO / o).read_text())
        for q in out["questions"]:
            qid = q.get("ssc_question_id")
            n = q["key"]["printed_number"]
            if not qid or not n:
                continue
            texts = [x["text"] for x in q["options"]]
            trusted = q["text_quality"] in ("text_layer", "ocr") and all(texts)
            by_qid.setdefault(qid, []).append({
                "output": o, "position": q["position"], "key_printed_number": n,
                "key_option_id": q["ssc_option_ids"][n - 1] if q.get("ssc_option_ids") else None,
                "texts": [_canon_opt(t) for t in texts] if trusted else None})
    agree = conflicts = not_comparable = 0
    conflict_list = []
    for qid, xs in by_qid.items():
        for i in range(len(xs)):
            for j in range(i + 1, len(xs)):
                a, b = xs[i], xs[j]
                if a["key_option_id"] and b["key_option_id"]:
                    same = a["key_option_id"] == b["key_option_id"]
                elif a["texts"] and b["texts"] and sorted(a["texts"]) == sorted(b["texts"]) and len(set(a["texts"])) == 4:
                    same = a["texts"][a["key_printed_number"] - 1] == b["texts"][b["key_printed_number"] - 1]
                else:
                    not_comparable += 1
                    continue
                if same:
                    agree += 1
                else:
                    conflicts += 1
                    conflict_list.append({"ssc_question_id": qid, "a": {k: a[k] for k in ("output", "position", "key_printed_number", "key_option_id")},
                                          "b": {k: b[k] for k in ("output", "position", "key_printed_number", "key_option_id")}})
    return {"method": "pairs of copies of the same SSC question ID; by option ID, else by identical option-text sets",
            "pairs_compared": agree + conflicts, "pairs_agree": agree, "pairs_conflict": conflicts,
            "pairs_not_comparable": not_comparable, "conflicts": conflict_list[:200]}


if __name__ == "__main__":
    main()
