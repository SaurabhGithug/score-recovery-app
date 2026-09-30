# SSC JE Civil learning implementation — 29 September 2026

This is an implementation record, not a claim that the full execution prompt or content acquisition is complete.

## Available now

Open `/learn`, or the **Learn** navigation item. This workspace is fixed to SSC JE Civil and does not inherit the old CGL target label. Signing in is required. The generic personal-profile onboarding wizard does not block this fixed-scope workspace.

- Eight-question sessions, with explicit reasons for the selection and optional focus-area selection.
- A deterministic planner prioritising due questions and evidenced weaknesses, interleaving available groups and reserving coverage slots.
- Persisted sessions, selections, active time, confidence, assistance, learner-reported error causes, response events and due dates in SQLite. Resume after leaving/reloading; account-scoped API access.
- Separate first-seen, repeated, assisted and delayed-retrieval statistics. No predicted marks or mastery claims. Outside-app exposure cannot be detected.
- Delayed reviews at 1, 3, 7, 14 and 30 days. These are configurable code-level product heuristics, not validated optimal intervals. Same-day retries cannot accelerate the spacing level.
- Fluency mode: a modest personal target only after at least three correct unassisted, uninterrupted timings on the **same question**, with at least 80% accuracy in its last five comparable attempts. This measures repeat fluency, not transfer. Other practice has no deadline.
- Approximately one fifth of exact-content fingerprints reserved for independent checks. Once exposed/answered, these can enter subsequent learning and due reviews. Checks provide no teaching help.
- Server-resolved answers; immutable session snapshots; stale/disputed evidence blocks new scoring. No answer keys or source explanations in the pre-check question DTO. Double check/next requests cannot create duplicate scoring events or skip a question.
- Missing/garbled essential content and unverified answer-bearing images held out. Existing verified answer-free crop routes are reused. An answer-only solution is explicitly not counted as an explanation.
- Current syllabus browser, sources, theory records and formulas. Starter content is deliberately limited to three sourced stress/strain/modulus formulas, one short immutable extract and a separately labelled unverified teaching note. Seeded idempotently on authenticated learning access. Most nodes remain empty.
- An optional extractive AI study guide using the existing server-side provider adapter. The model can select received passage IDs only; displayed wording is taken from stored sources. Unknown IDs, conflicts and insufficient evidence publish no guide. No source means no invented explanation. Caches are user/content/source-version scoped, concurrent identical calls share work, usage is recorded, and the existing daily budget is checked. This is **not** the full generative tutor proposed in the execution prompt.

The exact-content fingerprint normalises text and option order. It is not semantic or multilingual near-duplicate detection. Visual records with different asset paths can remain separate.

## Code organisation

- `src/lib/learning/`: DTOs and testable scheduling/planning rules.
- `src/lib/server/learning/`: additive schema, inventory, eligibility, sessions, snapshots, scoring, references and extractive tutor.
- `src/app/api/learn/route.ts`: authenticated API and same-origin mutations.
- `src/app/learn/page.tsx`: Today, session runner, syllabus/reference and progress views.
- Small integrations in database initialization, navigation, footer and onboarding.
- `scripts/test-learning.mjs`: isolated fixture database; never writes fixture questions or learner attempts to the real database.

The server-only `SCORE_RECOVERY_DATA_DIR` setting overrides the SQLite directory for isolated testing. Unset it for the normal `data/score_recovery.db`. Crop paths still use the existing project content roots.

## Account migration protections

Two unsafe pre-existing behaviours were removed:

1. Registration no longer assigns a password to an existing passwordless account merely by matching its name. Existing records are preserved. Recovery needs explicit local administrator ownership verification; no recovery endpoint is added here.
2. Legacy unowned Testbook browser storage is no longer silently assigned to whichever account signs in next. The import page offers an explicit ownership confirmation when copying an old browser bank. An ownership marker prevents assigning the same legacy bank to another account through the normal migration function. Existing scoped records are not overwritten, and raw legacy data is not deleted.

Browser ownership confirmation is a migration safeguard, not protection from someone with unrestricted access to the same browser profile or machine. Previously misassigned records are not automatically reassigned or erased.

## Actual content inventory

Read-only database inspection on this implementation run found:

- 27 persisted paper records, all labelled `pyp` by the existing importer.
- 5,199 question records.
- 0 stored generated bank explanations.
- 215 syllabus nodes across stored cycles.
- Before the new reference seed is first invoked in this database: 0 formulas / 0 theory notes. The seed adds only the bounded starter set described above.

These counts do **not** authenticate every PYQ or prove complete capture. They do **not** mean that 1,021 Testbook tests have been imported. Earlier browser-only Testbook captures must be explicitly attached/synced to the correct account. Portal access and content completeness are separate from catalogue discovery.

## Verification

- Production build: `npm run build -- --webpack`.
- TypeScript validation included in the production build.
- Targeted ESLint: new learning files, importer ownership changes and account protection changes passed without errors. An existing unused `academicBranch` warning remains in the onboarding component.
- Isolated learning assertions cover persistence, account isolation, server scoring, stale evidence, assistance, duplicate requests, next-question reset, spacing, held-out questions, reserved-item reuse, exact-question timing, source seeding, API authentication/origin checks, AI passage selection and legacy ownership protection.
- Existing bank suite: 22 tests passed.
- Existing syllabus suite: 17 tests passed.
- Existing explanation suite: 23 tests passed with mock provider, no paid calls.
- Browser-tested a production build with a temporary database on a separate localhost origin. Verified login, no onboarding obstruction, answer check, next question with cleared options/timer, Save & leave/resume availability, syllabus search and sourced formula rendering. Screenshot: `output/learning-reference-qa.png` (isolated fixture account, not the user's progress).
- The temporary QA server was stopped. The existing app server and user browser sessions were not intentionally stopped or replaced.

## Still required; not represented as finished

- Capture/reconcile all legitimately accessible Testbook tests and complete missing assets/solutions; independent PYQ authenticity/completeness audit.
- Reviewed chapter/topic/concept mappings and a comprehensive sourced Civil theory/formula/worked-example library. Broad section data cannot justify chapter diagnoses.
- Prerequisite-aware teaching, faded worked examples, step-level formula/method/unit drills, and targeted diagnostic follow-ups. Current cause selections are reflections, not inferred diagnoses.
- Robust semantic/visual duplicate grouping, exposure tracking across every legacy route, and balanced equivalent unseen checks. Current checks use exact-content reservation, not psychometrically matched papers.
- A grounded generative tutor with claim-level validation and Google-provider support. No live paid AI request was made in this implementation run. Extractive selection can still be irrelevant or select incorrect source material; it is not a correctness proof.
- Hard cross-process AI budget reservations and admission controls. Current pre-call daily checking and spend recording are not an absolute concurrent-spend guarantee.
- Public-deployment hardening, including login rate limits, operational backups, recovery tooling and broader security testing. Do not treat this local implementation as a finished public multi-user service.
- Accessibility/mobile testing beyond the exercised desktop flow; generic inherited surfaces still have legacy behaviour outside `/learn`.

## Concurrent work

The workspace already contained extensive uncommitted bank, syllabus, importer, UI and AI changes. They were preserved and reused. Shared integration files were re-read before edits. The identity/activity of the user's other editor (Claude) was not independently verified; this document makes no claim that Claude was running or assigned work.
