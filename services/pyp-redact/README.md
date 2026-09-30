# pyp-redact — key-free question crops

The extractor's crops (`data/storage/pyp-crops/**`, see `services/pyp-extract`) are the
authoritative image of each question, but they show SSC's answer key. So the bank serves them
only after a learner has submitted (or checked) the question — which leaves the ~1,260 questions
without usable text and the ~1,700 with figures unattemptable. This tool writes a second,
key-free crop for each question that the bank can show before submit:

```
data/storage/pyp-crops-clean/<same relative path as the original crop>.png
data/storage/pyp-crops-clean/_manifest.json   one row per crop: status, reason, input/output sha256, original_ok
data/storage/pyp-crops-clean/_report.json     counts, failure reasons, original_ok counts, leak test
```

It only reads the extractor's outputs and source PDFs; it never writes into them.

## Run

```bash
python3 services/pyp-redact/redact.py                    # every parsed JSON present
python3 services/pyp-redact/redact.py data/pyp-sources/parsed/a.json
python3 services/pyp-redact/redact.py --force            # ignore the manifest
python3 services/pyp-redact/redact.py --report           # rebuild _report.json only
npx tsx scripts/import-pyp.mjs                           # then record clean crops in the bank
```

Re-runnable. A crop is skipped when its fingerprint (algorithm `VERSION`, whether the tesseract
checks ran, source PDF sha256, page/pages/bbox, sha256 of the original crop) is unchanged, so a
`--no-ocr` row is never reused by a full run. `ocr_chars` is written whenever the OCR check ran. `REDACT_WORKERS` (default 6) sets
the process pool. Needs pypdfium2, numpy, OpenCV, Pillow and the `tesseract` binary (eng).

## What gives the key away, and what is done about it

| Signal | Families | Removal |
|---|---|---|
| Tick / cross icon beside each option | all digialm | icon objects deactivated in the PDF (vector) or blanked from key-colour pixels (scans); then a white box of one size over the icon column of every option |
| Option number / text in green vs red | digialm | every red/green (or strongly coloured) text and path object set to black before rendering; output is grayscale (vector) or 1-bit (scans) |
| Tick narrower than cross, so the correct option's line starts ~1.6–1.8 pt further right | 2022, 2023, 2024, P2 | each option's first line is translated in the PDF so every option's number has the same pen origin (text) or period x (path glyphs); only the correct row moves, by exactly the tick/cross width difference |
| 2022 glyphs are vector paths snapped per glyph, so a moved number sits ~0.1 pt off | 2022 | the four numbers are replaced by identical Helvetica "1." … "4." text objects at one x |
| Scans print green numbers lighter than red ones (any threshold makes them thinner) | 2019–20 scans | the icon + number zone of every option is blanked (one box size) and neutral "1." … "4." labels are drawn at each row's number baseline |
| Green lighter than red in scans | scans | 1-bit output cut per ink blob at 40% of that blob's own contrast; watermark blobs dropped. Where the option TEXT itself is green/red (some 2020 scan pages) the green text still comes out bolder (leak test: 94% of crops), so those crops fail (`raster_coloured_option_text`) |
| "Correct Answer: …" (and "Candidate Answer") line, sometimes followed by an image of the answer | 2016–17 QID listings | text objects from "Correct Answer:" to the next "QID :" deactivated; the image is cut off at that line (a blank block's height would hint at the answer's length); a crop without the line fails |
| ID box: Question ID / Status / Chosen Option | digialm | label lines deactivated; the extractor's own white-out is replicated (pixels where its crop differs from a fresh render) |

Vector pages are edited in memory with pypdfium2 (`FPDFPageObj_SetIsActive`, colour setters,
`FPDFPageObj_Transform`, a new text object for 2022 numbers) and rendered at 2x, so glyphs are
pixel-identical to a wrong option's. Nested form XObjects are handled by composing their
matrices. The crop is located on the page by its bbox (or template matching for continuation
parts of multi-page questions) and must match a fresh render of the original page exactly,
except where the extractor painted white.

Pages are rendered with the extractor's `pages.neutralise_hidden_clip` (one 2019 sitting was
printed with a clip that hides the left/bottom of each page; the extractor's crops show the page
without it, so the fresh renders here must too).

## Print furniture and candidate data

The browser header/footer of a printed response sheet (print time, response-sheet URL, page
counter) and anything from the candidate's ID box or header must never be served.

* Zones. For every page a crop touches, tesseract reads the top and bottom 7 % of the untouched
  render. A line with a URL, a print timestamp or a trailing page counter makes a zone from the
  page edge to that line (±2 pt). The extractor's declared zones for that page size
  (`_status/*.json → print_furniture`) are added. In the CLEAN crop every zone row is painted
  white. For the ORIGINAL, a zone row with ink inside the crop makes it non-servable.
* Clean crop. After all edits, tesseract (psm 6 and psm 11) must find no URL (`http`, `www`,
  `digialm`, `://`, `.com`), no print timestamp, no trailing page counter `n/m` in the right
  quarter of a line, and none of the ID-box / candidate labels. Otherwise the row is
  `status: failed, reason: print_furniture:<what>`. The words that also occur in question text
  are matched only in their label form ("Status :", "Roll No", "Candidate Name", "Venue Name",
  "Application No"). Measured on 400 clean crops, bare "Roll" and "Application" matched stems
  ("Roll on, Roll off", "The application of curing"), which would drop good crops.
* `original_ok` (every row). The original crop (it shows SSC's tick) may be served after the
  learner answers only when all of these hold:
  1. the row checks proved it holds exactly one question: four option rows (digialm number
     glyphs or icons; 2016–17 listings: "1)".."4)" in the text layer), at most one `Q.n` in the
     text layer and in OCR, exactly one "QID" (listings);
  2. tesseract (psm 6 and 11) finds none of `Chosen Option`, `Status`, `Question ID`,
     `Candidate`, `Roll`, `Venue`, `Application`, `http`, `www`, `digialm`, `://`, `.com`, a print
     timestamp or a trailing page counter. These are bare words: a stem that says "Candidate"
     makes the original non-servable, which only means the learner sees the clean crop instead;
  3. no furniture zone inside the crop shows ink.

  A failed row has `original_ok: false` (`original_checks.why_false: clean_failed`); the importer
  serves an original only next to a verified clean crop anyway. `original_checks.why_false` says
  which check failed.

## Checks (a crop that fails any of them gets no clean file; a stale one is deleted)

* digialm: exactly four option rows found (number glyphs in the key colour, leftmost on their
  line, followed by a period); every row has its icon object removed; the icon column is free of
  ink before the belt-and-braces box is painted, and pure white after.
* no key-colour pixels remain after the object edits (otherwise the crop is binarised as a scan);
  the final image is mode L or 1 (no pixel with channel spread > 30).
* scans: exactly four aligned icons; no key-colour pixels in the icon column outside the boxes;
  the blanked number zone ends in the gap before every option's text.
* tesseract (eng, psm 6 and psm 11) on the final image finds none of `Correct Answer:`,
  `Chosen Option`, `Status :` (`ocr_forbidden`), and none of the print-furniture / candidate
  patterns above (`print_furniture:<what>`).
* leak test (`_report.json → leak_test`, per family/mode/year/language): for each option slot,
  the typical value when that option is wrong is learned for five measurements (number x, number
  ink, number darkness, stroke width of the first line, gap to the previous row); the attacker
  picks the option that deviates most. Chance is 25%. `effect` is (mean when correct − mean when
  wrong)/sd.

## Server side

`import-pyp.ts` records `metadata.clean_crop = visualPath` only when the manifest row is `ok`,
its `crop_sha256` equals the original crop on disk now, its `clean_sha256` equals the clean file,
and the crop is the primary file's own (so its printed option order is the question's order).
The bank then serves `/api/bank/assets/clean/<visualPath>` to any signed-in learner and puts it
in `imageUrl` (and `cleanImageUrl`) before submit. After a check or submit it serves the original
only when the row also has `original_ok: true` (`metadata.original_crop_ok`); otherwise the
learner keeps seeing the clean crop. `scripts/test-redact.mjs` covers both cases.

## Known limits

* Questions whose extractor crop is wrong would fail the row check and get no clean crop. The
  extractor no longer writes whole-page or multi-question crops (`crop: null` instead); such a
  question has no manifest row.
* The raster labels use Arial (macOS) or DejaVu Sans; they look slightly different from the
  scan's own digits, identically on all four options.
* In 2022 files the correct option's text glyphs (not its number) may still sit up to ~0.1 pt
  (0.25 px) off where the producer would have put them on a wrong row; there is no reference for
  arbitrary text, and the leak test's stroke-width measure shows no signal.
