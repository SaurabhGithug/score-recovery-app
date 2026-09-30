# How syllabus and content updates work over time

This platform's content is not static — SSC and Railway change exam patterns, and General
Awareness content ages even when it's "evergreen." This document is the operational answer to
"how does this stay current," aimed at whoever owns the editorial pipeline next.

## What actually changes, and how often

| What | How often it realistically changes | What that means here |
|---|---|---|
| Exam pattern (sections, question count, marking scheme, timing) | Rarely — SSC has changed the CGL Tier 1 pattern only a handful of times in a decade, usually announced months ahead via official notification | `CONTENT_VERSION.examPatternVersion` (`src/lib/exam.ts`) is a stable string tag like `SSC-CGL-Tier1-2025`. Bump it and update `EXAM_BLUEPRINTS`/marking constants only when SSC publishes a new pattern notification — never speculatively. |
| CBT interface conventions (palette legend, button labels, Save & Next semantics) | Occasional — the research behind `SscExamRunner.tsx` found a documented 2024→2026 interface revision (button positions moved) | These are hand-coded in `SscExamRunner.tsx`, not data-driven, because they're UI conventions, not content. Re-verify against current official/vendor documentation before a major exam cycle, not on a fixed schedule. |
| Quant/Reasoning/English question bank | Slow — the underlying skills (percentage, blood relations, error spotting...) don't change; only which concepts get emphasized shifts slightly between cycles | Add new concepts/questions as `contentVersion` minor bumps (`1.0.0` → `1.1.0`). Never edit a *scored* question's answer key in place — see "Correcting a live question" below. |
| General Awareness | Fastest-moving, which is exactly why this bank deliberately excludes current affairs (see `src/lib/content/gk.ts` authoring brief) and sticks to static facts (historical events, geography, constitutional counts, national symbols). Even "static" facts need periodic re-verification — a Fundamental Rights count or "largest state by area" claim can go stale after a constitutional amendment or boundary change. | Re-verify every GK question against a current authoritative source at each `lastReviewedAt` cycle (quarterly is reasonable), independent of whether anything else changed. |

## Versioning fields

Defined in `src/lib/types.ts` (`ContentVersion`) and set in `src/lib/exam.ts` (`CONTENT_VERSION`),
shown to every learner in the site footer for transparency (`SiteFooter.tsx`) — nothing about
content changes silently:

- **`contentVersion`** — semver-style. Bump the patch (`1.0.0`→`1.0.1`) for a wording/translation
  fix that doesn't change the correct answer or difficulty; minor (`1.0.0`→`1.1.0`) for new
  questions/concepts added; major (`1.0.0`→`2.0.0`) for a change big enough that old attempt
  history becomes hard to compare against new attempts (e.g., a full blueprint redesign).
- **`examPatternVersion`** — which official SSC/Railway notification this content was authored
  against. Changes only when the *real* exam pattern changes.
- **`lastReviewedAt`** — the date someone last re-verified every fact/answer key, independent of
  whether the version number moved. This is the number that should never go stale even in a quiet
  period — a GK question with no factual errors still needs a "yes, still checked, still true"
  pass on a cadence.

Each `Question` also carries its own optional `version` field (`src/lib/types.ts`) — bumped when
*that specific question* is corrected, independent of the platform-wide `contentVersion`.

## Correcting a live question (the dispute → fix loop)

This is the loop the plan's quality-pipeline section calls for, and the piece most directly tied
to a student-visible feature already built:

1. A learner hits **"⚑ Report a problem with this question"** (`ReportIssueButton.tsx`) — visible
   on every question in both the timed mock and repair drills. This writes a `Dispute` record
   (`src/lib/storage.ts: saveDispute`) — deliberately **not** connected to the diagnosis engine or
   the learner's score in any way (see the file header comment in `diagnosis.ts` for why: folding
   "the question was wrong" into the personal-cause flow creates a strong incentive to blame the
   question for every wrong answer, which would both bias the cause-diagnosis data and quietly
   inflate the dispute-rate quality gate the original plan gates national expansion on).
2. **Not yet built**: an editorial console to triage `listDisputes()`. For the pilot, this is a
   `localStorage`-backed list a developer can inspect directly; the plan's real quality pipeline
   (independent blind re-solve → correction → versioned republish → recomputed analytics for
   affected attempts) needs a real backend before it can run for real, per the plan's own
   architecture section. This document exists so that backend, when built, has a clear contract to
   implement against rather than guessing.
3. When a question is corrected: bump that question's `version` field, bump `contentVersion`
   (patch), and — per the original plan's quality-pipeline requirement — keep a correction log
   (reason, reviewer, affected attempts, score treatment) rather than silently overwriting. That
   log doesn't exist as a system yet; the `Dispute.status` field (`"open" | "reviewed"`) is the
   seed of it.

## What this means for a learner's historical data

Concept keys (`Question.concept`, e.g. `"Percentage"`) are the stable identifier the error ledger
is built on (`src/lib/diagnosis.ts`) — **not** question IDs. This is deliberate: if a Percentage
question gets swapped out for a better-calibrated one next cycle, a learner's ledger entry for
"Percentage" keeps its history (`occurrences`, `resolvedCount`) intact, because the ledger never
stored which literal question they got wrong — only which concept. Renaming or splitting a
`concept` string, on the other hand, orphans existing ledger entries — treat `concept` values as
close to immutable; add a new concept rather than renaming an old one.

## Pilot measure this maps to

The original plan's 90-day sequence tracks *"Days from official change to verified simulator
update"* as a pilot measure. Operationally that means: when SSC/Railway publish a new pattern
notification, the clock starts there — this document, `examPatternVersion`, and the (not yet
built) correction-log system are what "verified update" should mean once that day comes, not an
ad hoc scramble.
