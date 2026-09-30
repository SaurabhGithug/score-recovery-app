# Reported controls and images — 2026-09-30

Implemented the seven browser comments and profile screenshot fixes:

- Removed the Papers introductory paragraph and in-app PWA install control.
  PWA service worker/manifest remain; browser installation is no longer intercepted.
- Exam preferences now use a native modal with one scroll area, usable touch
  targets, labelled fields, explicit loading/error/retry states, and Cancel/Close.
  Missing active preparation context previously made Save silently return. It now
  offers Choose goal, rather than pretending the preferences were saved.
- Department selections returned from storage as JSON strings are serialized as
  arrays by the profile API. Empty selections restore correctly. Explicit null DOB
  and disability category clear the old stored values. Stale load requests are
  aborted and cannot overwrite a new context's edits.
- Removed unsupported fixed-cutoff/eligibility assurances from the preferences UI.
  This form stores preferences; it does not verify legal eligibility.
- Clear answer works before an answer is checked, updates the count, and saves.
  Checked answers remain locked. Image-dependent choices cannot be selected until
  the image loads. Broken images have an explicit retry state, not a broken icon.
- Mobile question navigation sits above the question, is height-bounded, and
  collapses after a jump. Source images can be enlarged and scrolled at full size.
- Cached-image completion is checked on mounting as well as onLoad, so a fast
  image finishing before hydration does not leave all choices disabled.

## Image repair scope

The selected Paper-II 06 November 2024 paper had legacy clean_crop metadata but no
clean_sha256. Its original crops had also changed since the redaction manifest
was made. Re-ran the existing redaction/verifier on that paper's source JSON:
100/100 clean crops passed. `repair-crop-hashes.mjs --apply` then backfilled only
those 100 missing hashes after checking both original and clean file hashes and
the existing verifier's OCR check. A metadata backup was saved in output/.
No stems, options, keys, learner answers, or attempts were rewritten.

Other stale image records were rejected by the audit, not granted unverified
access. This is not a claim that the entire question bank's images are repaired.

## Checks

- Isolated profile test: all five categories, department/PwBD/ESM persistence,
  clearing all departments and optional data, then GET reload.
- 25 bank, 5 redaction/access-control, and 6 option-order tests passed.
- Browser at 390px: selection, clear, marking, Next, Previous, jump to Q20,
  navigator collapse, enlarged image open/close. Q1 and Q20 images loaded.
  Used a temporary fixture with no real attempt ID or timer; removed it afterward.
- Original profile failure checked on a real session without saving changes:
  no active context, now accompanied by an explicit Choose goal action.
- Removed paragraph/install button verified in the browser. No real learner
  answers, profiles or submissions were changed for testing.

Concurrent backend edits added verified image URL versions; the image URL
expectations in existing regression tests were updated to include those hashes.
