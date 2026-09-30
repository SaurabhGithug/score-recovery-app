"""Parser for the older "QID : n - stem / Options: / Correct Answer:" layout.

Used by the 2016 compiled listing (careerpower Civil-Engineering-2016.pdf,
adda247 SSC-JE-CE-2016-1.pdf) and the 2017 candidate response sheets
(careerpower Civil-Engineering-2017.pdf, 12 shifts). These have no graphical
key: the key is a printed "Correct Answer: <option text>" line. It is matched
to exactly one option (whitespace-insensitive, first line of each); any other
outcome -> key null. Basis is recorded as "answer_text" (a single printed
signal, not the two-signal graphical rule) and flagged in warnings.

"Candidate Answer" (the candidate's own answer), registration number and candidate name
are never parsed into the JSON, and a crop ends above the "Candidate Answer" line.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image

from common import OPTION_IDS, REPO, norm_space, rel, sha256, text_is_garbled
from digialm import Line, build_lines, join_tokens

RE_QID = re.compile(r"^QID\s*:\s*(\d{1,4})\s*-?\s*(.*)$")
RE_OPT = re.compile(r"^([1-4])\)\s*(.*)$")
RE_FOOTER = re.compile(r"^P\s?age\s*\|\s*\d+$")
RE_SECTION = re.compile(r"^\((General [^)]+|Reasoning[^)]*)\)$", re.I)


def canon(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[‘’`´]", "'", s)
    s = re.sub(r"[“”]", '"', s)
    s = re.sub(r"[–—−]", "-", s)
    return re.sub(r"\s+", "", s).lower()


def _lines(pages):
    out = []
    for pd in pages:
        if pd.ad_page:
            continue
        for ln in build_lines(pd.tokens):
            out.append(ln)
    return out


def _parse_headers(lines):
    """Shift boundaries. 2017: 'EXAM DATE : 22-January-2018 EXAM START TIME : 10:30:00'.
    2016: 'SSC Junior Engineers (JE) Exam - 2016 "held on 02 March 2017"'."""
    shifts = []
    for i, ln in enumerate(lines):
        t = ln.text
        m = re.search(r"EXAM DATE\s*:\s*(\d{1,2})-([A-Za-z]+)-(\d{4})\s*EXAM START TIME\s*:\s*(\d{1,2}):(\d\d)", t)
        if m:
            import datetime
            mon = datetime.datetime.strptime(m.group(2)[:3], "%b").month
            start = f"{int(m.group(4)):02d}:{m.group(5)}"
            end = None
            near = " ".join(l.text for l in lines[i:i + 4])
            md = re.search(r"EXAM DURATION\s*:\s*(\d{1,2}):(\d\d)", near)
            if md:  # end time = start + printed duration
                tot = int(m.group(4)) * 60 + int(m.group(5)) + int(md.group(1)) * 60 + int(md.group(2))
                end = f"{tot // 60:02d}:{tot % 60:02d}"
            shifts.append({"line": i, "exam_date": f"{m.group(3)}-{mon:02d}-{int(m.group(1)):02d}",
                           "start": start, "end": end, "title": None})
            continue
        m = re.search(r"Exam\s*-\s*(20\d\d)\s*\"?held on (\d{1,2}) ([A-Za-z]+) (20\d\d)", t)
        if m:
            import datetime
            mon = datetime.datetime.strptime(m.group(3)[:3], "%b").month
            shifts.append({"line": i, "exam_date": f"{m.group(4)}-{mon:02d}-{int(m.group(2)):02d}", "start": None,
                           "title": norm_space(t), "cycle": int(m.group(1))})
    return shifts


def process_qid_file(src: Path, pages, renderer, urls, used_keys, log):
    lines = _lines(pages)
    shifts = _parse_headers(lines)
    if not shifts:
        shifts = [{"line": 0, "exam_date": None, "start": None, "title": None}]
    bounds = [s["line"] for s in shifts] + [len(lines)]
    publisher = "adda247" if "adda247" in src.parts else "careerpower"
    digest = sha256(src)
    outs = []
    names = set()
    for si, sh in enumerate(shifts):
        seg = lines[bounds[si]:bounds[si + 1]]
        qs = _parse_questions(seg, log, lines[bounds[si + 1]] if bounds[si + 1] < len(lines) else None)
        if not qs:
            continue
        out, name = _build(src, publisher, digest, sh, qs, renderer, pages, urls, used_keys, multi=len(shifts) > 1)
        base, k = name, 2
        while name in names:
            name = f"{base}-{k}"
            k += 1
        names.add(name)
        outs.append((name, out))
    return outs


RE_CAND_HEADER = re.compile(r"^(Click to Print|REGISTRATION\s*(NUMBER|NO)|CANDIDATE\s*NAME|EXAM\s*(DATE|NAME)|TOTAL\s*MARKS)", re.I)


def _stop(cur, ln):
    if cur is not None and cur.get("stop") is None:
        cur["stop"] = (ln.page, ln.top)


def _parse_questions(seg: list[Line], log, next_line=None):
    """Questions of one shift. Each question records `stop`: the (page, top) of the first line
    that is not part of it -- the next "QID", a section line, the candidate header of the next
    shift, or its own "Candidate Answer" line (the candidate's answer is never cropped)."""
    qs = []
    cur = None
    mode = None
    section = None
    title_section = None
    for ln in seg:
        t = ln.text.strip()
        if RE_FOOTER.match(t):
            continue
        if RE_CAND_HEADER.match(t):
            _stop(cur, ln)
            cur = None
            continue
        ms = RE_SECTION.match(t)
        if ms:
            section = ms.group(1).strip()
            _stop(cur, ln)
            continue
        mt = re.search(r"Shift\s*\((General [^)]+)\)", t)
        if mt:
            title_section = mt.group(1)
            section = section or title_section
            continue
        m = RE_QID.match(t)
        if m:
            _stop(cur, ln)
            cur = {"qid": int(m.group(1)), "stem": [], "options": [[] for _ in range(4)], "answer": [],
                   "lines": [ln], "cand_lines": [], "section": section, "warnings": []}
            first = [x for x in ln.tokens]
            # drop "QID : n -" tokens
            k = 0
            txt = ""
            while k < len(first) and not txt.endswith("-") and k < 5:
                txt += first[k].text
                k += 1
            if first[k:]:
                cur["stem"].append(first[k:])
            qs.append(cur)
            mode = "stem"
            continue
        if cur is None:
            continue
        if t.startswith("Candidate Answer"):
            _stop(cur, ln)
        if cur.get("stop") is None:
            cur["lines"].append(ln)  # lines from "Candidate Answer" on are never part of the crop
        if t.startswith("Options:"):
            mode = "opt?"
            continue
        mo = RE_OPT.match(t)
        if mo and mode in ("opt?", "opt"):
            n = int(mo.group(1))
            mode = "opt"
            cur["cur_opt"] = n - 1
            toks = ln.tokens
            # "1)" may be glued to the first word
            head = toks[0].text
            rest = re.sub(r"^[1-4]\)", "", head)
            from pages import Token
            first = [Token(toks[0].page, toks[0].x0, toks[0].top, toks[0].x1, toks[0].bottom, rest, "D", size=toks[0].size)] if rest else []
            cur["options"][n - 1].append(first + toks[1:])
            continue
        if t.startswith("Correct Answer"):
            mode = "ans"
            rest = re.sub(r"^Correct Answer\s*:\s*", "", t)
            cur["answer"].append(rest)
            continue
        if t.startswith("Candidate Answer"):
            mode = "cand"
            cur["cand_lines"].append(ln)
            continue
        if mode == "stem":
            cur["stem"].append(ln.tokens)
        elif mode == "opt":
            cur["options"][cur["cur_opt"]].append(ln.tokens)
        elif mode == "ans":
            cur["answer"].append(t)
        elif mode == "cand":
            cur["cand_lines"].append(ln)
    if cur is not None and next_line is not None:
        _stop(cur, next_line)
    return qs


def _join(lines_):
    return "\n".join(s for s in (join_tokens(l) for l in lines_) if s.strip()).strip()


def _build(src, publisher, digest, sh, qs, renderer, pages, urls, used_keys, multi):
    warn = ["layout:qid_answer_text (no graphical key; key from printed 'Correct Answer' text)"]
    cycle = sh.get("cycle")
    if cycle is None:
        m = re.search(r"(20\d\d)", src.stem)
        if m:
            cycle = int(m.group(1))
            warn.append("cycle_year_from_publisher_filename(header has none)")
    date = sh.get("exam_date")
    start = sh.get("start")
    hhmm = start.replace(":", "") if start else None
    n = len(qs)
    paper = "P1" if n == 200 else None
    if paper is None:
        warn.append(f"paper_undetermined(question_count={n})")
    else:
        warn.append("paper_inferred_P1_from_200_questions")
    # language
    deva = sum(1 for q in qs if re.search(r"[ऀ-ॿ]", _join(q["stem"])))
    language = "bilingual" if deva > 0.5 * n else "en"
    paper_key = f"sscje-civil-{paper or 'P?'}-{date or 'nodate'}-{hhmm or 'notime'}-{language}"
    from common import crop_key_for
    crop_key, owner = crop_key_for(paper_key, src.name + (f"#{sh.get('exam_date')}-{hhmm}" if multi else ""), used_keys)
    if owner:
        warn.append(f"same_paper_key_as:{owner}")
    out_q = []
    sections = []
    keyed = 0
    for pos, q in enumerate(qs, start=1):
        w = list(q["warnings"])
        stem = norm_space(_join(q["stem"])) or None
        opts = []
        for k in range(4):
            txt = norm_space(_join(q["options"][k])) or None
            if not txt:
                w.append(f"option_{k + 1}_no_text")
            opts.append({"id": OPTION_IDS[k], "printed_number": k + 1, "text": txt})
        ans = norm_space("\n".join(q["answer"]))
        key_n = None
        if ans:
            a0 = canon(ans.split("\n")[0])
            hits = [k for k in range(4) if opts[k]["text"] and canon(opts[k]["text"].split("\n")[0]) == a0]
            if len(hits) != 1:
                full = canon(ans)
                hits = [k for k in range(4) if opts[k]["text"] and canon(opts[k]["text"]) == full]
            if len(hits) == 1:
                key_n = hits[0] + 1
            else:
                w.append(f"answer_text_matches_{len(hits)}_options")
        else:
            w.append("no_correct_answer_line")
        if key_n:
            keyed += 1
            w.append("key_single_signal_answer_text")
        full = (stem or "") + "\n" + "\n".join(o["text"] or "" for o in opts)
        garbled, why = text_is_garbled(full)
        if garbled:
            w.append(why)
        if not sections or sections[-1]["name"] != q["section"]:
            sections.append({"name": q["section"], "first_position": pos, "count": 0})
        sections[-1]["count"] += 1
        # crop: the union of the question's text lines and the images inside its span, on every
        # page it touches (an image stem can sit alone at the top of the next page, and an image
        # can be wider than any text line)
        regions, figs, spans = _regions(q, pages)
        crop_rel = f"data/storage/pyp-crops/{crop_key}/{pos}.png"
        if not regions or not _crop(renderer, regions, REPO / crop_rel, pages):
            (REPO / crop_rel).unlink(missing_ok=True)
            w.append("crop_unavailable:no_region")
            crop_rel = None
        if not stem:
            w.append("stem_no_text")
        tq = "garbled" if garbled else "text_layer"
        if not stem or any(not o["text"] for o in opts):
            tq = "incomplete"
        out_q.append({
            "position": pos, "printed_number": q["qid"], "section": q["section"], "stem": stem, "options": opts,
            "ssc_question_id": None, "ssc_option_ids": None,
            "key": {"option_id": OPTION_IDS[key_n - 1] if key_n else None, "printed_number": key_n,
                    "signals": {"text_colour": None, "icon": None, "answer_text": key_n},
                    "basis": "answer_text" if key_n else "none"},
            "page": min(regions) + 1 if regions else None,
            "pages": sorted(p + 1 for p in regions),
            "bbox": [round(v, 1) for v in regions[min(regions)]] if regions else None,
            "crop_regions": [[p + 1] + [round(v, 1) for v in regions[p]] for p in sorted(regions)],
            "crop": crop_rel,
            "has_figure": bool(figs) or (stem is not None and len(stem) < 12),
            "figure_evidence": [f"images:{len(figs)}"] if figs else [],
            "text_quality": tq,
            "language": "bilingual" if re.search(r"[ऀ-ॿ]", full) else "en",
            "warnings": w,
        })
    exp = 200
    if n != exp:
        warn.append(f"question_count:{n}!={exp}")
    pages_used = sorted({p for q in out_q for p in q["pages"]})
    out = {
        "schema": 1,
        "source": {"file": rel(src), "sha256": digest, "publisher": publisher,
                   "source_url": urls.get((publisher, src.name)),
                   "pages": [pages_used[0], pages_used[-1]] if pages_used else None},
        "paper": {"header_title": sh.get("title"), "cycle_year": cycle, "paper": paper, "exam_date": date,
                  "exam_time": (f"{start}-{sh['end']}" if start and sh.get("end") else None), "subject": None, "language": language,
                  "paper_key": paper_key},
        "sections": sections,
        "questions": out_q,
        "diagnostics": {"question_count": n, "keyed": keyed, "key_disagreements": 0, "missing_key": n - keyed,
                        "icon_only_keys": 0, "answer_text_keys": keyed,
                        "figures": sum(1 for q in out_q if q["has_figure"]),
                        "text_quality": {k: sum(1 for q in out_q if q["text_quality"] == k)
                                         for k in ("text_layer", "garbled", "incomplete")},
                        "crops_unavailable": sum(1 for q in out_q if q["crop"] is None),
                        "warnings": warn},
    }
    name = src.stem + (f"--{date}-{hhmm}" if multi else "")
    return out, name


def _regions(q, pages):
    """Per page {page: [x0, top, x1, bottom]}: text lines plus images inside the question's span
    (from its QID line, or the page's content top on later pages, to its stop line, or the
    page's content bottom), clamped to that span. Returns (regions, figures, spans)."""
    from furniture import content_limits

    first = q["lines"][0]
    stop = q.get("stop")
    last_page = max([ln.page for ln in q["lines"]] + ([stop[0]] if stop else []))
    spans = {}
    for p in range(first.page, last_page + 1):
        if p not in range(len(pages)) or pages[p].ad_page:
            continue
        ctop, cbot = content_limits(pages[p])
        top = first.top - 3 if p == first.page else ctop
        bottom = stop[1] - 4 if (stop and stop[0] == p) else cbot  # the next question starts at its top - 3
        top, bottom = max(top, ctop), min(bottom, cbot)
        if bottom > top:
            spans[p] = (top, bottom)
    regions: dict[int, list[float]] = {}

    def add(p, x0, top, x1, bottom):
        r = regions.setdefault(p, [x0, top, x1, bottom])
        r[0], r[1], r[2], r[3] = min(r[0], x0), min(r[1], top), max(r[2], x1), max(r[3], bottom)

    for ln in q["lines"]:
        if ln.page in spans:
            add(ln.page, ln.x0, ln.top, ln.x1, ln.bottom)
    figs = []
    for p, (top, bottom) in spans.items():
        for b in pages[p].images:
            if b.kind == "chrome" or b.w * b.h <= 30:
                continue
            if b.top >= top - 2 and b.bottom <= bottom + 2:
                figs.append(b)
                add(p, b.x0, b.top, b.x1, b.bottom)
    for p in list(regions):
        top, bottom = spans[p]
        r = regions[p]
        r[1], r[3] = max(r[1] - 4, top), min(r[3] + 4, bottom)
        r[0], r[2] = max(0.0, r[0] - 6), min(pages[p].width, r[2] + 8)
        if r[3] - r[1] < 3:
            del regions[p]
    return regions, figs, spans


def _crop(renderer, regions, out_path: Path, pages) -> bool:
    """Render the regions (print header/footer zones blanked) and stack the page parts."""
    s = renderer.scale
    parts = []
    for p in sorted(regions):
        x0, top, x1, bottom = regions[p]
        a = renderer.page_array(p).copy()
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
    rows = []
    for k, p in enumerate(parts):
        if p.shape[1] < width:
            p = np.concatenate([p, np.full((p.shape[0], width - p.shape[1], 3), 255, np.uint8)], axis=1)
        if k:
            rows.append(np.full((6, width, 3), 200, np.uint8))
        rows.append(p)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.concatenate(rows, axis=0)).save(out_path, optimize=True)
    return True
