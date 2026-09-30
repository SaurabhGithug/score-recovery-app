# pyp-extract — SSC JE Civil previous-year papers → JSON + crops

Deterministic extractor for SSC JE (Civil) previous-year papers published as
SSC / TCS-iON "digialm" candidate response sheets (re-published with Adda247
branding by Adda247 and Career Power), plus the older "QID / Correct Answer"
listings. No network, no model downloads. It uses pypdfium2, pdfplumber, numpy,
OpenCV, PIL, the `tesseract` binary (eng) and the local PaddleOCR English
recogniser.

**The rule throughout: never guess.** If the evidence for a key or for a piece
of text is missing or conflicting, the value is `null` and a warning says why.
The crop PNG of each question is the authoritative record. Text is a
convenience.

## Run

```bash
python3 services/pyp-extract/extract.py                    # all 40 PDFs (about 1–2 h, OCR-bound)
python3 services/pyp-extract/extract.py path/a.pdf b.pdf   # selected files, then rebuild _summary.json
python3 services/pyp-extract/extract.py --no-text-ocr      # layout and keys only; image text is not read (fast)
python3 services/pyp-extract/extract.py --summarize        # rebuild _summary.json only
python3 services/pyp-extract/test_extract.py               # checks on the outputs
```

`PYP_WORKERS` (default 6) sets the size of the OCR process pool. Results are
put together in page order, so parallel runs give the same output as serial
runs.

OCR is cached under `services/pyp-extract/.cache/` (git-ignored; see
`ocr_cache.py`): the layout-OCR tokens of each textless page, and the two
engines' readings of each text-line image keyed by a hash of its pixels. A re-run
reads only lines whose pixels changed (for example a wider OCR box that now
includes a letter that used to be cut off). Delete the folder to force a full
re-read. `python3 services/pyp-extract/wordcheck.py` rebuilds
`vocab_corpus.txt` (see *Text*).

Outputs:

* `data/pyp-sources/parsed/<source-stem>[--<YYYY-MM-DD>-<HHMM>].json`: one file per
  paper sitting. A compiled PDF with several shifts gets one file per shift.
* `data/storage/pyp-crops/<paper-key>/<position>.png`: one question block
  (stem, figures, options and icons) at 2x, and nothing else (see *Crops*). When
  two sources give the same paper key, the second source writes to
  `<paper-key>--dup-<source-stem>/` so neither overwrites the other. Ownership is
  recorded in a `.source` marker. A question whose block cannot be located
  exactly has `crop: null` and a `crop_unavailable:<reason>` warning; no crop is
  better than a crop that shows a neighbour or candidate data.
* `data/pyp-sources/parsed/_summary.json`: one row per output, duplicate
  identities, a cross-file key check, and the list of files that could not be
  parsed.
* `data/pyp-sources/parsed/_status/*.json`: the per-source run status that the
  summary is built from.

`paper-key` = `sscje-civil-<P1|P2>-<YYYY-MM-DD>-<HHMM>-<en|hi|bilingual>`.
`cycle_year` is the SSC cycle in the header title ("Examination,2020" → 2020),
not the year of the sitting.

## Source formats

| Family | Files | How it is read |
|---|---|---|
| digialm, text layer, 2023–24 | 2024 P1 EN/HI (8), 2023 P1 EN/HI (7), 04-Dec-2023 P2, 06-Nov-2024 P2 | pdfplumber words (`x_tolerance=1.5`, duplicate chars removed; the 06-Nov-2024 file overprints every glyph twice) |
| digialm, text layer, 2018–21 | 23-Mar-2021 (EN, HI, 2nd shift), 2020-2 (2 shifts), 23-03-2021-Shift-3, 29-Oct-2020, Sep-2019 Hindi (3), Civil-Engineering-2018 (3 shifts) | as above. pdfium splits words ("Select t he"); pdfplumber's character-gap grouping rebuilds them |
| digialm, no text layer | 2022 (4 files, glyphs drawn as vector outlines), 2019-cycle scans (3), Civil-Engineering-2019 (mixed), Civil-Engineering-2022 | tesseract layout OCR at 300 dpi, then options and keys found from key-colour pixels (below). The 29/10/2020 10:00 sitting inside Civil-Engineering-2019 has a text layer but was printed with a clip that hides the left and bottom ~121 pt of every page (the `Q.n` labels, icons, option numbers and the left of each stem image are in the file but not drawn); `pages.neutralise_hidden_clip` undoes that clip in memory before any render, so its crops are whole and its keys readable (warning `source_page_clip_removed`). The redactor renders the same way |
| QID / Correct Answer | Civil-Engineering-2016, SSC-JE-CE-2016-1 (same content), Civil-Engineering-2017 (12 shifts) | text layer. The key is the printed "Correct Answer" text matched to exactly one option |
| not parsed | Civil-Engineering-2023 | the publisher re-typeset this paper in two columns with its own answer table and solutions. It has no SSC key artefact |

### digialm layout facts used

* A question starts with `Q.<n>` at the left margin. In 2018–21 papers the
  numbering restarts in each section, so `position` counts through the paper
  and `printed_number` keeps the printed number.
* Options follow `Ans`, numbered `1.` to `4.`. Options map to ids A–D in printed order.
* The box that holds "Question ID / Option n ID / Status / Chosen Option" is
  found from its labels. Only `Question ID` and `Option n ID` are kept.
  Status and Chosen Option belong to the anonymous candidate and are never
  written.
* The header block (title, Roll Number, Candidate Name, Venue, Exam Date/Time,
  Subject) starts a new shift. Only the title, date, time and subject are kept.
  The roll number, name and venue are matched only so they can be skipped.
* Publisher chrome is dropped: full-page "Test Prime" ad pages (detected by a
  deep-red background), images or drawings repeated at the same place on
  many pages (logo, Google Play badge, watermark), a page-sized image (the scan
  of a whole page), a large image (>= 60,000 pt²) whose size repeats on many
  pages wherever it sits (the Adda247 watermark moves between the shifts of a
  compiled file), and a logo-like image at the page top that lies above all of
  the page's text. Before this, the scan of a whole page and a moved watermark
  counted as figures of every question they overlapped, which made whole-page
  and multi-question crops.
* Browser print furniture (`furniture.py`): the header (print time and
  response-sheet URL) and footer (URL and page counter "33/58") that a browser adds
  when it prints a response sheet. A line in the top or bottom 7 % of a page that
  holds a URL, a print timestamp or a trailing page counter is furniture. Per
  page-size group of each PDF, the header zone runs from the top edge to the
  lowest such line on any page of the group, and the footer zone from the highest
  one to the bottom edge (at least two pages must agree). Every page of the group
  gets the zones, including pages where OCR missed the line. Tokens, images and
  drawings in a zone are dropped before parsing. A URL token anywhere else on a
  page (the "www.exammix.com" watermark of the Sep-2019 Hindi sheets) is dropped
  too. `_status/*.json → print_furniture` lists the zones.

## Answer key: two independent signals

For each question the correct printed option comes from two signals:

1. **Text colour.** Text-layer pages use the fill colour of each option's number
   and text (pdfplumber `non_stroking_color`). OCR pages use the pixel colour of
   the printed number `k.`. The signal fires only when exactly one option is
   green and three are red.
2. **Icon colour.** The page is rendered with pypdfium2. In a column 30 pt wide
   left of the option numbers, key-coloured blobs are found. Each blob is
   assigned to the option whose vertical interval (from its number to the next
   number) contains the blob's centre. This handles icons that sit a little
   above the number, and icons placed beside the middle of a tall figure option
   (2023 style). The signal fires only on exactly one green tick and three red
   crosses. Raster, vector or other icon objects all work, because only pixels
   are used.

`key.basis`:

* `text_colour+icon`: both signals fire and name the same option.
* `text_colour+crosses`: the tick was not rendered, but exactly one option is
  green, the other three are red, and SSC's crosses sit on exactly those three
  red options (icon detail e.g. `-XXX`). Both printed signals name the same
  option (DECISION-002 addendum, 2026-09-29). A `key_tick_not_rendered`
  warning is added; `diagnostics.tick_not_rendered_keys` counts them.
* `icon_only`: an OCR page where the option-number colour could not be read
  (`?`) but the icon pattern is complete. A `key_icon_only` warning is added.
* `answer_text`: the QID listings. The key is the printed "Correct Answer" text
  and matches exactly one option. It is a single printed signal and is flagged
  with a `key_single_signal_answer_text` warning.
* `none`: any other case, with `key_missing:text_colour=XXXX,icon=YYYY`
  (per-option detail: G/R/M/? and T/X/M/-) or `key_disagreement:...`.

The 2022 vector files often show three crosses and no tick; those are the
`text_colour+crosses` cases. Anything short of that pattern stays `none`.

Key-colour pixel rules, measured on every family, are in `common.pixel_masks`:
red means `r ≥ 110, r−g ≥ 60, r−b ≥ 55, g ≤ 130`. This covers vector red
(247,24,24), dark-red crosses (121,9,2) and JPEG-scan digits (175,100,100).
The pink watermark, (250,215,215) in vector files, ~(225,175,175) in scans and
~(100,50,50) where it overlaps black text, is excluded because its r−g is at
most 50.

**Cross-file check.** When the same SSC Question ID appears in several outputs
(EN and HI versions, duplicate uploads, compiled copies), the keys must match.
Option IDs are compared when present, otherwise printed numbers. Results are in
`_summary.json → cross_file_key_check`. Nothing is copied from one file into
another.

## Crops

Each crop holds exactly one question and no candidate or print data:

* **Span.** A question owns the band of each page from its `Q.n` line (4 pt
  above; on a continuation page, from the top of the content area) to 5 pt above
  the line that ended it (the next question, a section heading or the next
  shift's header), or the bottom of the content area. The content area excludes
  the print header/footer zones. Nothing outside the span is ever cropped.
* **Block.** Inside the span, the crop covers the question's tokens, the images
  and figure-sized drawings wholly inside the span, the icons, and runs down to
  its own ID box. On OCR pages a part that continues on the next page runs down
  to the last row of printed ink, because a figure drawn in pixels has no tokens.
  `crop_regions` lists `[page, x0, top, x1, bottom]` per part (points).
* **ID boxes.** A box is found from its labels (text layer or OCR) and, in
  every family whose box has a drawn outline, from that grey rounded rectangle
  in pixels (`digialm.idbox_frames`). Every box on the page that reaches into
  the crop is painted white, the question's own and any neighbour's. On OCR
  pages the outline also stops the ID-box text from joining an option's OCR box.
* **Print furniture.** The header/footer zones and stray URL tokens are painted
  white in every part.
* **No crop** (`crop: null`, `crop_unavailable:<reason>`): `segment_holds_2_questions`
  (the segment contains two ID boxes, so a question anchor was missed and the
  block cannot be split exactly), `id_box_not_located` (an OCR page where
  neither the labels nor the outline of the ID box were found, so an un-blanked
  Chosen Option could be inside), `no_region`.

What the previous version got wrong: it painted only the question's own ID box
(found from its labels), so a crop that reached into a neighbour showed that
neighbour's Question ID / Status / Chosen Option. On scans whose labels OCR
misread, it painted nothing. Page-sized scan images and moved watermarks made
whole-page and two-question crops. Header/footer lines joined the running
question, so page-spanning crops showed the response-sheet URL, the print time
and the page counter.

The 2016–17 QID listings (`other_layouts.py`) crop the union of the question's
text lines and the images inside its span on every page it touches. An image
stem can sit alone at the top of the next page, and an image can be wider than
any text line. The crop ends above the "Candidate Answer" line (the candidate's
own answer is never cropped), and above the next shift's candidate header.

## Text

* `text_quality: "text_layer"`: words from the PDF. Superscripts and
  subscripts are detected from glyph size and baseline and written as `m³`,
  `C₃S`, `1^(st)`, so exponents do not flatten into different numbers.
* `"garbled"`: Devanagari in these PDFs is stored in visual order with missing
  conjuncts (`िनि त`, `सं ाओ ं`, unmapped glyphs shown as U+FFFD), or has
  mojibake. The text is kept but should not be trusted. Use the crop.
* `"ocr"`: text that exists only as pixels (image stems or options, pages with
  no text layer). Every line is read by **two engines**: tesseract on the
  grey line image and PaddleOCR PP-OCRv5 (en) on the binarised line. A
  region's text is accepted only if every line agrees after normalising
  whitespace, quotes and dashes. Otherwise the text is `null` with
  `ocr_rejected_<part>:ocr_engines_disagree:'…'|'…'`. Both engines flatten
  exponents in the same way (`m³` → `m3`), so agreement does not prove them
  right. Any line image that contains a glyph shifted up or down relative to
  the line is therefore rejected
  (`superscript_or_subscript_in_image_text`). Hindi image text cannot
  be read, because no Hindi OCR model is installed, and stays null. Accepted
  OCR text is still marked `ocr_text_unverified_crop_authoritative`.
* OCR boxes. For an image stem or option on a text-layer page, the box is the
  union of the images themselves (+1.5 pt). An option image can start left of
  its printed number, which sits on the line above it, so a box that started
  after the number cut the first letters off every line ("t watering",
  "st watering" for "the first watering"). On OCR pages the stem box starts at
  the document's stem column (the median left edge of the first stem word).
  No OCR box reaches into an ID box.
* Word fragments (`wordcheck.py`). Both engines read the same cut pixels, so
  they agree on a cut. A line whose first token is not a word is therefore
  rejected (`ocr_rejected_<part>:first_token_word_fragment:'t' in '…'`).
  Lowercase-initial tokens are checked against `/usr/share/dict/words` (with
  regular inflections, British spellings, prefixes and closed compounds), a
  curated list of 1–2 letter words, and a civil-engineering / units vocabulary.
  `vocab_corpus.txt` adds the words that the papers themselves print in their
  text layers: at least 5 letters, at least 3 times, and not the tail of another
  printed word, so a text layer that lost a ligature ("nished") adds nothing.
  Numbers, symbols, capitals, roman numerals and formulae are not checked.
  Two-engine agreement is still required. `diagnostics.ocr_lines_rejected_as_fragments`
  counts the rejected lines.
* `"incomplete"`: the stem or any option is null. `text_layer`, `ocr` and
  `garbled` are used only when the stem and all four options were read, so a
  label never claims text that is not there. `stem_no_text` / `option_<k>_no_text`
  say which part is missing.
* `has_figure` is true when the block has non-chrome images or at least three
  vector drawings (or one large one) inside the content area, or when the stem
  is empty or very short but the block is tall. `figure_evidence` gives the
  reason.

## Validation and diagnostics

Per output, `diagnostics.warnings` reports each of these:

* the question count is not 200 (P1) or 100 (P2);
* gaps in printed numbering;
* section counts are not 50/50/100;
* a question does not have exactly 4 options;
* the paper was inferred from its sections (P1 is the only paper with GI&R and
  GA sections) because the header gives no paper number;
* the date was taken from the filename because the OCR'd header date could not
  be read.

Nothing is padded or invented. On OCR pages, question anchors are taken from
the layout (a line in the Q column after the previous question's ID box),
because `Q.39` is often misread (`9.39`, `2-39`, `Q.§`). The misreading is
recorded as a warning (`q_anchor_by_layout(ocr_read:…)`,
`printed_number_ocr_read_<n>_taken_as_<m>`).

**Numbering gaps: what happened to the missing question.** A
`numbering_gap_before_position` warning in an earlier run meant that a question
was dropped, not merged into a neighbour in the JSON. When the `Q.n` line of a
question was misread *and* the previous question's ID-box labels were misread,
no anchor was taken. The missed question's lines were appended to the previous
question: that question kept its own four options (the extra ones were
ignored), but its crop showed both questions, and the missed question had no
entry of its own. Examples: Q.8 of Civil-Engineering-2019 30/10/2020 10:00 (a
Hindi-script question in the English sheet, read as `ay ase a …`), Q.5 of
12/11/2020 15:00, Q.5 of SSC-JE-CIVIL-2019-28-10-2020-Shift-3. Two changes now
recover them:

* the drawn outline of the previous question's ID box closes that question even
  when its labels were misread;
* a line that starts in the Q column after a closed question, and is followed by
  an `Ans` label in the Q column before any other ID box, is the next anchor
  whatever OCR read.

The recovered question gets the expected printed number and a
`q_anchor_by_layout` warning. A segment that still holds two ID boxes gets no
crop (`crop_unavailable:segment_holds_2_questions`) and a
`segment_holds_<n>_id_boxes` warning. The count and gap checks still report any
shortfall.

## Files

* `extract.py`: CLI, per-shift assembly, validation, crops, summary, cross-check.
* `digialm.py`: line building, header and section and question segmentation,
  option detection, the two key signals, and pixel option-row detection for OCR pages.
* `pages.py`: page model (text-layer and OCR tokens), rendering (with a hiding
  print clip undone), chrome tagging, layout OCR (rules and icons erased before
  tesseract).
* `furniture.py`: browser print header/footer zones and stray URLs.
* `ocr_consensus.py`: two-engine line OCR.
* `ocr_cache.py`: on-disk OCR cache.
* `wordcheck.py`, `vocab_corpus.txt`: the word-fragment check for OCR lines.
* `other_layouts.py`: the QID / Correct Answer format.
* `workers.py`: process pool for OCR.
* `common.py`: colour rules, paths, text-quality heuristics, crop ownership.
