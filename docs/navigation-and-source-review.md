# Navigation and source review — 30 September 2026

## Implemented

- Setup always offers Close and Back to app, including accounts without a preparation context. Escape dismisses the native dialog; closing does not create a goal.
- Header uses an explicit expanded-state button, outside-click dismissal and Escape. One Tests entry replaces separate Testbook practice navigation.
- `/recovery-lab/testbook` redirects to `/papers?kind=mock`. The old component is retained as `LegacyTestbookLab.tsx`, not routed. No browser captures or learner history are deleted. Existing browser-only captures can still be copied through Import questions; private captures are not shared across learners.
- Tests retain provider badges from the bank (`Testbook` for the Testbook importer). This UI change does not import new tests or assert that all catalogue entries were captured.
- Diagnostic and paper runners offer End test on the question screen. Confirmation supports continue, finalize and view results, or finalize and return to Tests. Failed bank submission leaves the dialog open with an error; no navigation falsely implies successful saving.
- Diagnostic instructions offer Back to menu, and the countdown starts after the instructions are accepted. Removed mock biometric/terminal claims. Marking instructions now derive from the questions rather than hard-coded section counts and marks.
- Mobile Reference switches between the topic tree and selected content, with All topics navigation, official wording and child topics. Missing lessons remain explicitly unavailable, not AI-invented material.
- Official notice highlights are tied to the checked notice SHA-256. A different version shows a source link rather than stale highlights.

## Source checks

SSC notice: https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_je_2026.pdf

Checked notice p.1 (original schedule), p.20 (scheme), p.22 (marking, language and tools). Highlights are a summary of this dated notice, not a claim that all later amendments have been checked. Qualification/age eligibility is left to the full relevant clauses rather than inferred from a profile.

PYQ sources checked:

- Adda247 index: https://www.adda247.com/engineering-jobs/ssc-je-previous-year-question-papers/
- Linked 6 November 2024 Civil Paper II PDF: https://www.adda247.com/jobs/wp-content/uploads/sites/22/2026/03/09182435/SSC-JE-Civil-Official-Paper-II-Held-On_-06-Nov-2024.pdf — 28-page PDF; already the kind of republished source used by this app, not an independently authoritative final key.
- Alternate 6 June 2024 morning Civil Paper I response-sheet PDF: https://cdn-images.prepp.in/public/image/SSC_JE_2024_Paper_1_Civil_Morning_Question_Paper_with_Answer_Key_PDF_English_June_6_2024__cc23157a95c1b569d88096a737956498.pdf — readable text layer with SSC question/option IDs; 69 pages. Visual render could not be fetched in this check. Candidate for comparison, not yet approved as a replacement.

Replacement gate: match exam date/shift/branch, SSC question and option IDs, complete stem and all options; inspect formulas/diagrams visually; establish answer-key evidence separately. A response sheet's Chosen Option is NOT its correct-answer key. Preserve source URL, hash and original assets; flag disagreements rather than merging by question position or generating missing text. No questions or answer keys were replaced in this UI pass.

## Verification

- TypeScript: passes.
- Targeted lint: header, end dialog, notice highlights, both test runners, learning reference and Tests page pass.
- 29 isolated bank regression tests pass (including Testbook import/isolation, scoring, missing-content handling and source-image integrity).
- Browser at 390px: first-click Menu; Escape; Reference highlights; Soil Mechanics mobile detail; Back to app on an account with no contexts; legacy Testbook redirect to Mock tests.
- Isolated runner fixture: diagnostic end-to-menu callback and cancellation; paper confirmation focus defaults to Continue test; deliberate nonexistent-attempt submission shows error and stays on the page. No real learner attempt submitted or changed. Temporary fixture removed after testing.

Remaining: no sourced lesson was added to empty topics; alternate PDFs still require full extraction/visual/key verification. `/exam` remains the existing generic diagnostic question set, not newly converted into an SSC JE Civil PYQ test by this navigation fix.
