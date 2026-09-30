# Score Recovery — SSC JE Civil learning and recovery app

A working, bilingual learning platform whose active recovery workflow is scoped to **SSC JE Civil**.
Its purpose is to identify recoverable marks, train the exact knowledge/method/speed gaps behind them,
and preserve a strict boundary between portal evidence and AI-generated teaching assistance.

## What's actually implemented

This is a real, running product for the MVP scope defined in the plan — not a mockup:

- **Diagnostic mock** (`/exam`) — 24 original SSC CGL Tier 1–style questions (6 concepts × 4 sections:
  Quant, Reasoning, English, GK), timed, with a question palette, mark-for-review, and answer-change/skip
  tracking. Deterministic scoring: +2 / −0.5, matching the real exam's marking scheme.
- **Recovery report** (`/results/[attemptId]`) — not just a score. Shows exactly how many marks were lost,
  how many are recoverable, *why* (concept gap / calculation error / misreading / risky guess / time
  pressure / recurring mistake), and the next 3 highest-impact actions — the core differentiator from
  the plan.
- **Repair drill** (`/repair/[attemptId]`) — review the specific trap that caused the error, then answer a
  **genuinely different, unseen question testing the same concept** (not the one you just saw) to prove
  whether it's actually fixed.
- **Error ledger & dashboard** (`/dashboard`) — persistent record of recurring weak spots across attempts,
  with a resolved/outstanding count per concept — this is the "attempt → cause → intervention → outcome"
  longitudinal dataset the plan identifies as the real moat.
- **Bilingual throughout** — every question, explanation, trap, and UI string has fluent (not
  machine-translated) Hindi and English, toggleable at any time.
- **Mobile-first** — bottom tab bar on mobile, full-width single-column layouts, works down to a 375px
  viewport; desktop gets a wider two-column exam layout with the question palette alongside.
- **Attempt resume** — progress checkpoints to local storage on every navigation; a dropped connection or
  closed tab can resume from where you left off.
- **Learner accounts** — name/password login backed by SQLite, scrypt password hashing, random server-side
  sessions, and HttpOnly cookies. Testbook banks and training attempts are namespaced by learner so people
  using the same browser do not share progress.
- **Testbook recovery bank** (`/recovery-lab/testbook`) — imports only SSC JE Civil question records captured
  from an accessible portal solution page. A question enters checked practice only when its answer and
  solution are portal-verified; incomplete records remain held out rather than being guessed.
- **Evidence audit** (`/recovery-lab/testbook/catalogue`) — distinguishes the portal's catalogue count,
  cards whose exact IDs were observed, and tests whose question-level evidence is actually staged.
- **Grounded AI teaching notes** — DeepSeek may expand a portal-verified solution into concept, steps,
  traps, and prerequisites, but it cannot create or change the stored answer key. Topic labels are limited
  to the official SSC JE Civil syllabus whitelist.

## The diagnosis engine is a rules engine, not an unverified AI

This matters and is deliberate, per both the plan's own compliance section and the five-lens review in
[`docs/ai-score-recovery-review.md`](docs/ai-score-recovery-review.md) (all five independent reviewers —
causal inference, learning science, ML systems, business, ethics — flagged the same thing): a 300-student
pilot cannot generate enough labeled examples to train a real cause-classifier, and self-reported error
causes are a biased, circular signal. So `src/lib/diagnosis.ts` is entirely deterministic — every
"marks lost" and "recoverable" number traces back to an explicit, documented if/then rule over objective
behavioral signals (time spent vs. the question's expected time, answer changes, prior ledger history).
Nothing here is a black box, and nothing is branded "AI" that isn't genuinely doing generation or ranking.

## Current boundaries

- Testbook question evidence and learner drill history are currently stored in browser local storage under
  the authenticated learner ID. Accounts and sessions are server-side; cross-device synchronization is not
  yet implemented.
- A portal catalogue total is not treated as downloaded content. Locked/hidden tests are never fabricated,
  paywalls are not bypassed, and unattempted tests are not submitted blank to expose their solutions.
- Previous-year papers are admitted only with authentic question/answer evidence. A label such as “PYP” is
  not enough to manufacture a question bank.
- IRT/adaptive testing, native app, multi-exam catalogue, RCT infrastructure — all explicitly deferred
  in the plan until retention/quality gates are met.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Create a learner account with a name and a password of at least eight
characters. Portal import and ordinary drills work without an AI key; AI teaching notes require the
server-only DeepSeek configuration below.

## Practice questions from your own documents (DeepSeek)

On any uploaded document with readable pages, **Generate questions** (`/library/[id]`) writes exam-style
MCQs from a chosen page range. This is genuine generation, so it is labelled AI-generated throughout, and
the answer key is guarded because a wrong key teaches a falsehood:

1. The model must copy the sentence(s) from the student's material that prove each answer.
2. Plain code (no model) checks that quote really is on the cited page; invented quotes are rejected.
3. Shape/style checks reject malformed questions, "all of the above" options and "according to the passage" stems.
4. A second model re-solves each question **without the answer key**. Agreement → ready for practice;
   disagreement → the review queue, shown with the proof quote.
5. Practice shows the proof quote and page after each answer; "Report a problem" stays available.

Only the page text and the exam name are sent to DeepSeek — never names, user ids or file names. Each run
has a spending cap, and the panel shows an estimate before you start and the actual spend after.

Configure in `.env.local` (ignored by git), then restart `npm run dev`:

```bash
DEEPSEEK_API_KEY=                          # paste a current key only in .env.local
LLM_PROVIDER=deepseek
# LLM_PROVIDER=mock                        # offline fake for testing: free, fill-in-the-blank questions
# DEEPSEEK_GENERATION_MODEL=deepseek-flash # writes questions (thinking off)
# DEEPSEEK_CHECK_MODEL=deepseek-v4-pro     # blind re-solve (thinking on)
# DEEPSEEK_CHECK_EFFORT=high               # low | high | max thinking effort for the re-solve
# GENERATION_MAX_USD_PER_RUN=2             # a run stops once it has spent this much
# GENERATION_MAX_USD_PER_DAY=5             # all runs, rolling 24 hours; one run at a time
```

Every billed call, including ones that fail after being charged, is written to the `llm_spend` table and
counts toward both limits. Runs execute inside the Node server process, so this needs `next dev` /
`next start`, not a serverless host.

Tests: `npx tsx scripts/test-question-generation.mjs` (runs on a throwaway database).

## The 4-Brain Adaptive Platform Architecture

The repository implements a four-layer separated intelligence foundation for Indian government examinations:

1. **Universal Knowledge Brain** (`src/lib/domain/universal-brain.ts`): Canonical taxonomy of subjects, syllabus nodes, concepts, prerequisites, formulas, and misconceptions.
2. **Exam Brain** (`src/lib/domain/exam-brain.ts`): Exam families (SSC JE, ISRO JPA), cycles, branches, stages, papers, sections, and separate institutional roles (`recruiting_organization`, `exam_owner`, `paper_setting_organization`, `conducting_agency`, `cbt_platform_vendor`).
3. **Student Brain** (`src/lib/domain/student-brain.ts`): Multi-dimensional capability modeling tracking 8 distinct behavioural dimensions (Accuracy, Difficulty-Adjusted Mastery, Solving Speed Index, Retention Score, Confidence Calibration, Transfer Ability, Hint Dependence, Consistency) with automated spaced repetition review scheduling.
4. **Learning Policy Brain** (`src/lib/domain/learning-policy.ts`): Explainable, deterministic rule-based Next-Best Action prioritization engine based on blueprint weights, weakness gaps, and forgetting risk.

## Examination Packs

- **SSC Junior Engineer (`src/lib/ssc-je/`)**:
  - Structural support for Civil (`civil`), Electrical (`electrical`), and Mechanical (`mechanical`) disciplines with mandatory candidate branch selection.
  - Active cycle marked as `draft` with recorded evidence gaps; technical questions gated until verified primary sources are added.
- **ISRO JPA / Stenographer (`src/lib/isro-jpa/`)**:
  - Official 2026 Annexure III blueprint (200 Qs / 200 Marks / 150 Minutes, +1/−0.25).
  - Verified DigiALM platform delivery provenance (TCS not assumed).
  - Validated question import with strict rights gating.

## ISRO Artifacts Importer CLI

```bash
# Run idempotent import verification in dry-run mode
npx tsx src/lib/isro-jpa/run-import.ts

# Run with live output
npx tsx src/lib/isro-jpa/run-import.ts --live
```

## Database Migration

Production-ready PostgreSQL DDL is located in [`migrations/0001_foundation_schema.sql`](migrations/0001_foundation_schema.sql) covering all 26 tables, foreign keys, indexes, and publishing status enums.

## Project structure

```
src/
  lib/
    domain/
      schema.ts           — 24 core domain entities & enums
      universal-brain.ts  — Universal Knowledge Brain & concept registry
      exam-brain.ts       — Exam Brain & institutional role provenance
      student-brain.ts    — Multi-dimensional Student Brain capability model
      learning-policy.ts  — Explainable Learning Policy Next-Best Action engine
    ssc-je/
      config.ts           — SSC JE (Civil/Electrical/Mechanical) exam pack
    isro-jpa/
      config.ts           — ISRO JPA 2026 blueprint & DigiALM provenance
      importer.ts         — Idempotent importer with source rights gating
      run-import.ts       — CLI runner for paper analysis ingestion
    storage/
      platform-store.ts   — LocalStorage bridge for the 4-Brain state
    types.ts              — core data model for existing diagnostic mock
    scoring.ts            — deterministic scoring
    diagnosis.ts          — rules-engine cause-diagnosis + recovery report
    exam.ts               — question catalog aggregation
    storage.ts            — client-first localStorage storage
    i18n.tsx              — bilingual context/provider
  components/
    ExamFamilySelector.tsx   — exam & branch switcher with institutional evidence modal
    StudentBrainVisualizer.tsx — 6-dimension cognitive mastery cards
    AdaptivePolicyCard.tsx   — prioritized Next-Best Action cards
    ExamRunner.tsx           — question-taking engine
    SscExamRunner.tsx        — SSC exam runner
    SiteHeader.tsx           — responsive header with bilingual toggle
    SiteFooter.tsx           — responsive footer
  app/
    page.tsx                 — landing page with exam switcher & 4 brains
    exam/page.tsx            — diagnostic exam runner & student brain update
    dashboard/page.tsx       — multi-dimensional brain visualizer & ledger
    results/[attemptId]/     — recovery report
    repair/[attemptId]/      — repair drill & unseen retests
```
