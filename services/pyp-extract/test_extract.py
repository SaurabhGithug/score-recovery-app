#!/usr/bin/env python3
"""Checks on the extractor's outputs (run after extract.py).

    python3 services/pyp-extract/test_extract.py

Plain asserts, no test framework. Exits non-zero on the first failure.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import PARSED, REPO, SOURCES  # noqa: E402

OUTPUTS = sorted(p for p in PARSED.glob("*.json") if not p.name.startswith("_"))
LOADED = {p.name: json.loads(p.read_text()) for p in OUTPUTS}


def out_for(src_rel: str) -> list[dict]:
    return [d for d in LOADED.values() if d["source"]["file"] == src_rel]


def q(d, pos):
    return d["questions"][pos - 1]


def check(cond, msg):
    if not cond:
        print("FAIL:", msg)
        sys.exit(1)
    print("ok  ", msg)


# ---------------------------------------------------------------- 1. hand-checked keys
HAND = [
    ("data/pyp-sources/careerpower/SSC-JE-Civil-Question-Paper-2024-in-English-05-06-2024-S1.pdf",
     [(1, 1, "21, 55"), (2, 3, "79")]),
    ("data/pyp-sources/careerpower/SSC-JE-CIVIL-9-Oct-2023-Shift-1.pdf",
     [(1, 1, "50"), (2, 1, "218"), (3, 1, "2, 1, 5, 3, 4")]),
    ("data/pyp-sources/adda247/SSC-JE-Civil-Question-Paper-23-March-2021-1st-Shift-With-Answer.pdf",
     [(1, 3, "÷, ×, −, +")]),
]
for src, cases in HAND:
    ds = out_for(src)
    check(len(ds) == 1, f"one output for {Path(src).name}")
    for pos, key, text in cases:
        qq = q(ds[0], pos)
        check(qq["key"]["printed_number"] == key and qq["key"]["basis"] == "text_colour+icon",
              f"{Path(src).name} Q{pos} key = option {key} (both signals)")
        check(qq["options"][key - 1]["text"] == text, f"{Path(src).name} Q{pos} option {key} text = {text!r}")
        check(qq["key"]["option_id"] == "ABCD"[key - 1], f"{Path(src).name} Q{pos} option_id")

# ---------------------------------------------------------------- 2. no candidate data
FORBIDDEN_LABELS = ["Chosen Option", "Candidate Name", "Roll Number", "Venue Name", "Registration No",
                    "Candidate Answer", "CANDIDATE NAME", "REGISTRATION NUMBER", "Test Venue"]
pii_values: set[str] = set()
import pdfplumber  # noqa: E402

for pdf in sorted((SOURCES / "careerpower").glob("*.pdf")) + sorted((SOURCES / "adda247").glob("*.pdf")):
    with pdfplumber.open(str(pdf)) as doc:
        for i, page in enumerate(doc.pages):
            if i > 700:
                break
            t = page.extract_text() or ""
            if not re.search(r"Roll|Candidate|REGISTRATION|Venue|Name", t):
                continue
            for rx in (r"Roll\s*(?:Number|No\.?)\s*:?\s*(\d{6,})", r"Registration\s*No\.?\s*:?\s*(\d{6,})",
                       r"REGISTRATION NUMBER\s*:\s*(\d{6,})", r"CANDIDATE NAME\s*:\s*([A-Z][A-Z .]{3,}?)\s+EXAM",
                       r"(?m)^Candidate Name\s+(.{4,})$", r"(?m)^Name\s+([A-Z][A-Z .]{3,})$",
                       r"(?m)^Venue Name\s+(.{6,})$", r"(?m)^Test Venue\s+(.{6,})$"):
                for m in re.finditer(rx, t):
                    v = m.group(1).strip()
                    if len(v) >= 5:
                        pii_values.add(v)
print(f"     ({len(pii_values)} roll-number / name / venue values harvested from the sources)")
leaks = []
for name, d in LOADED.items():
    blob = json.dumps(d, ensure_ascii=False)
    for lab in FORBIDDEN_LABELS:
        if lab in blob:
            leaks.append((name, lab))
    for v in pii_values:
        if v in blob:
            leaks.append((name, v[:3] + "…"))
summary_blob = (PARSED / "_summary.json").read_text() if (PARSED / "_summary.json").exists() else ""
for v in pii_values:
    if v in summary_blob:
        leaks.append(("_summary.json", v[:3] + "…"))
check(not leaks, f"no Chosen Option / candidate labels or values in any output ({leaks[:5]})")
for name, d in LOADED.items():
    for qq in d["questions"]:
        assert not re.search(r"chosen[ _]?option", json.dumps(qq).lower()), name

# ---------------------------------------------------------------- 3. structure + counts
for name, d in LOADED.items():
    qs = d["questions"]
    check([x["position"] for x in qs] == list(range(1, len(qs) + 1)), f"{name}: contiguous positions 1..{len(qs)}")
    assert all(len(x["options"]) == 4 and [o["id"] for o in x["options"]] == list("ABCD") for x in qs), name
    tl = sum(1 for x in qs if x["text_quality"] in ("text_layer", "garbled"))
    if d["paper"]["paper"] == "P1" and tl >= 0.5 * max(1, len(qs)):
        n = len(qs)
        check(n == 200 or any(w.startswith("question_count") for w in d["diagnostics"]["warnings"]),
              f"{name}: text-layer P1 has 200 questions (n={n}) or an explicit warning")
    if d["paper"]["paper"] == "P2":
        n = len(qs)
        check(n == 100 or any(w.startswith("question_count") for w in d["diagnostics"]["warnings"]),
              f"{name}: P2 has 100 questions (n={n}) or an explicit warning")

# ---------------------------------------------------------------- 4. key rules + agreement stats
tot = both = agree = disagree = keyed = icon_only = answer_text = 0
tl_both = tl_agree = 0
for name, d in LOADED.items():
    for x in d["questions"]:
        tot += 1
        k, s = x["key"], x["key"]["signals"]
        if k["printed_number"] is not None:
            keyed += 1
            assert k["option_id"] == "ABCD"[k["printed_number"] - 1], (name, x["position"])
            if k["basis"] == "text_colour+icon":
                assert s["text_colour"] == s["icon"] == k["printed_number"], (name, x["position"])
            elif k["basis"] == "icon_only":
                icon_only += 1
                assert s["icon"] == k["printed_number"] and s["text_colour"] is None, (name, x["position"])
                assert any(w.startswith("key_icon_only") for w in x["warnings"]), (name, x["position"])
            elif k["basis"] == "text_colour+crosses":
                # tick not rendered: one green option, three red, and SSC's crosses on exactly the red ones
                det = s["icon_detail"]
                assert s["text_colour"] == k["printed_number"] and s["icon"] is None, (name, x["position"])
                assert len(det) == 4 and det.count("X") == 3 and det[k["printed_number"] - 1] == "-", (name, x["position"])
                assert any(w.startswith("key_tick_not_rendered") for w in x["warnings"]), (name, x["position"])
            elif k["basis"] == "answer_text":
                answer_text += 1
                assert s.get("answer_text") == k["printed_number"]
            else:
                raise AssertionError(f"unknown basis {k['basis']} in {name}")
        else:
            assert k["option_id"] is None and k["basis"] == "none", (name, x["position"])
            assert any(w.startswith(("key_", "answer_text", "no_correct")) for w in x["warnings"]), (name, x["position"])
        if s.get("text_colour") is not None and s.get("icon") is not None:
            both += 1
            if s["text_colour"] == s["icon"]:
                agree += 1
            else:
                disagree += 1
                assert k["printed_number"] is None, (name, x["position"])
        if x["text_quality"] in ("text_layer", "garbled") and s.get("text_colour") is not None and s.get("icon") is not None:
            tl_both += 1
            tl_agree += s["text_colour"] == s["icon"]
print(f"     questions={tot} keyed={keyed} (two-signal={keyed - icon_only - answer_text}, icon_only={icon_only}, "
      f"answer_text={answer_text}); both signals present={both}: agree={agree} disagree={disagree}")
print(f"     text-layer questions with both signals: {tl_both}, agreeing: {tl_agree}")
check(True, f"all {disagree} signal disagreements produced key=null (asserted per question above)")
check(tl_both == tl_agree, "text-layer files: colour and icon signals agree on every question where both exist")

# ---------------------------------------------------------------- 5. cross-file key consistency
summ = json.loads((PARSED / "_summary.json").read_text())
cc = summ["cross_file_key_check"]
print(f"     cross-file: {cc['pairs_compared']} comparable copy pairs, {cc['pairs_agree']} agree, "
      f"{cc['pairs_conflict']} conflict, {cc['pairs_not_comparable']} not comparable")
check(cc["pairs_compared"] > 0 and cc["pairs_conflict"] == 0, "same SSC question ID never carries two different keys across files")

# ---------------------------------------------------------------- 6. crops exist (or are declared unavailable)
missing = [(n, x["crop"]) for n, d in LOADED.items() for x in d["questions"] if x["crop"] and not (REPO / x["crop"]).exists()]
check(not missing, f"every crop the JSON names exists ({missing[:3]})")
undeclared = [(n, x["position"]) for n, d in LOADED.items() for x in d["questions"]
              if x["crop"] is None and not any(w.startswith("crop_unavailable:") for w in x["warnings"])]
check(not undeclared, f"a question without a crop carries crop_unavailable:<reason> ({undeclared[:3]})")
n_crops = sum(1 for d in LOADED.values() for x in d["questions"] if x["crop"])
n_null = sum(1 for d in LOADED.values() for x in d["questions"] if not x["crop"])
print(f"     crops written={n_crops} crop_unavailable={n_null}")

# ---------------------------------------------------------------- 7. crop geometry: one question, no print furniture
import pypdfium2 as pdfium  # noqa: E402

_sizes: dict[str, list] = {}


def page_size(src_rel: str, page1: int) -> tuple[float, float]:
    if src_rel not in _sizes:
        doc = pdfium.PdfDocument(str(REPO / src_rel))
        _sizes[src_rel] = [tuple(doc[i].get_size()) for i in range(len(doc))]
    return _sizes[src_rel][page1 - 1]


whole, overlaps, in_zone = [], [], []
for name, d in LOADED.items():
    src = d["source"]["file"]
    st_path = PARSED / "_status" / f"{Path(src).parent.name}__{Path(src).stem}.json"
    groups = json.loads(st_path.read_text()).get("print_furniture", {}).get("groups", {}) if st_path.exists() else {}
    by_page: dict[int, list] = {}
    for x in d["questions"]:
        if not x["crop"]:
            continue
        for p, x0, top, x1, bottom in x["crop_regions"]:
            W, H = page_size(src, p)
            if bottom - top >= 0.9 * H and x1 - x0 >= 0.9 * W:
                whole.append((name, x["position"]))
            z = groups.get(f"{round(W)}x{round(H)}", {})
            if ("head" in z and top < z["head"] - 0.5) or ("foot" in z and bottom > z["foot"] + 0.5):
                in_zone.append((name, x["position"], p))
            by_page.setdefault(p, []).append((x["position"], x0, top, x1, bottom))
    for p, rs in by_page.items():
        rs.sort(key=lambda r: r[2])
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]
                if b[2] >= a[4]:
                    break
                ov = (min(a[4], b[4]) - max(a[2], b[2])) * max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
                small = min((a[4] - a[2]) * (a[3] - a[1]), (b[4] - b[2]) * (b[3] - b[1]))
                if ov > 0.05 * small:
                    overlaps.append((name, p, a[0], b[0]))
check(not whole, f"no whole-page crop region ({whole[:5]})")
check(not overlaps, f"no two questions' crop regions overlap on a page ({overlaps[:5]})")
check(not in_zone, f"no crop region reaches into a print header/footer zone ({in_zone[:5]})")

# ---------------------------------------------------------------- 8. text labels match what was read
bad_stem = [(n, x["position"]) for n, d in LOADED.items() for x in d["questions"]
            if not x["stem"] and "stem_no_text" not in x["warnings"]]
check(not bad_stem, f"stem_no_text is present whenever the stem is null ({bad_stem[:5]})")
bad_tq = [(n, x["position"], x["text_quality"]) for n, d in LOADED.items() for x in d["questions"]
          if (x["text_quality"] != "incomplete") != (bool(x["stem"]) and all(o["text"] for o in x["options"]))]
check(not bad_tq, f"text_quality is 'incomplete' exactly when the stem or an option is null ({bad_tq[:5]})")
tqd: dict[str, int] = {}
for d in LOADED.values():
    for x in d["questions"]:
        tqd[x["text_quality"]] = tqd.get(x["text_quality"], 0) + 1
print(f"     text_quality: {tqd}")

# ---------------------------------------------------------------- 9. OCR word-fragment rejection
from wordcheck import is_fragment  # noqa: E402

for line, frag in [("t watering which is given to a crop", "t"), ("st watering which is given", "st"),
                   ("rst watering which is given", "rst"), ("lecrease in strength", "lecrease"),
                   ("uantity of water", "uantity")]:
    check(is_fragment(line) == frag, f"fragment rejected: {line!r}")
for line in ["the first watering", "a triangle is the only simple figure", "x = 2y", "kN/m2", "levelling staff",
             "centre of gravity", "ii. Increase", "co-efficient of friction", "(a) only", "m3/s", "has a head of"]:
    check(is_fragment(line) is None, f"whole word accepted: {line!r}")
accepted_frag = []
n_frag_rej = 0
for name, d in LOADED.items():
    n_frag_rej += d["diagnostics"].get("ocr_lines_rejected_as_fragments", 0)
    for x in d["questions"]:
        parts = [w.split(":", 1)[1] for w in x["warnings"] if w.startswith("ocr_text(two-engine agreement):")]
        if not parts:
            continue
        labels = parts[0].split(",")
        texts = ([x["stem"]] if "stem" in labels and x["stem"] else []) + \
            [o["text"] for k, o in enumerate(x["options"]) if f"option_{k + 1}" in labels and o["text"]]
        accepted_frag += [(name, x["position"], ln[:30]) for t in texts for ln in t.split("\n") if is_fragment(ln)]
check(not accepted_frag, f"no accepted OCR line starts with a word fragment ({accepted_frag[:5]})")
print(f"     OCR lines rejected as word fragments: {n_frag_rej}")
print("ALL CHECKS PASSED")
