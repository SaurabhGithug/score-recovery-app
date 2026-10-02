# Standards teaching engine (design, 2 Oct 2026)

One engine that teaches a standard (IS/ISO/IEC 17025:2017 first, any standard later) by **sequential question solving**: it starts at the beginning, finds out what the learner already knows, teaches only what is missing, and moves from recognising a term to applying it in a lab scenario. It is the "learn" half of the product; the timed test (`/standards/<id>/test`) stays the independent check.

## 1. Research we apply (already in this repo, not new claims)

Source: `docs/ssc-je-civil-execution-prompt.md` §6–8 and §11, and the critique in `docs/ai-score-recovery-review.md` §2.7. Evidence supports these *ingredients*; the numbers below are our configurable heuristics, not proven constants.

| Ingredient | Where it shows up in the engine |
| --- | --- |
| Cycle: diagnose → teach if needed → guided attempt → independent attempt → mixed practice → delayed review | Each concept runs through it (§3) |
| Prerequisite model | Concept graph with `prerequisites`; a concept opens only when they are practised |
| Retrieval practice and spacing (Dunlosky 2013, Cepeda 2006) | Every question is a retrieval attempt; reviews at the existing 1/3/7/14/30-day intervals (`LEARNING_POLICY.intervals`, imported, not copied) |
| Worked examples that fade; expertise reversal | Teach card only if the opening question is missed; hints fade to none |
| Interleaving (Rohrer 2020; "confusable-concept interference") | After basics, rung-4 questions mix confusable concepts |
| Informative feedback (Wisniewski 2020) | Every answer: why right, why *each* wrong option is wrong, the verbatim clause |
| Transfer is limited (Pan & Rickard 2018) | Mastery needs new questions at higher rungs, not repeats |
| Independent accuracy before speed | Timed test stays separate; no time pressure in learn mode |
| Human-readable reasons, sample-size caveats, no predicted scores | Every step shows a one-line reason; status is evidence counts, never a forecast |
| LLM proposes, code decides | See §6 |

## 2. What the learner sees

1. Learn hub card says **Continue**. It opens the guided session at `/standards/<id>/learn`.
2. A session is ~10 steps. Each step shows one line of *why* ("New idea: impartiality", "Review: due after 3 days", "You mixed these up twice").
3. **New concept**: one opening question first (rung 2). Right without help → skip the teaching, climb. Wrong → a short **teach card** (plain-words summary + the verbatim clause extract + one worked example), then guided questions with an optional hint, then independent ones.
4. After every answer: right/wrong, the reason for each wrong option, the proof quote, a link to the clause, "Ask AI" if curious. Then Next.
5. Wrong twice at a rung → step down and re-teach; three misses on a concept → the engine inserts the prerequisite it depends on and says so.
6. A path screen shows modules → concepts with a plain status: Not started · Learning · Practised · Solid, with evidence counts ("4 independent correct, last 2 days ago").

## 3. Concept model and the ladder

- A **concept** is one idea worth learning (e.g. *impartiality*, *metrological traceability*, *method verification vs validation*). It cites the clauses it comes from and the verbatim extracts that support its summary. Concepts are grouped into **modules** in teaching order (orientation → words that matter → trust → structure → people/place → equipment/traceability → … → management system).
- **Ladder (rungs)** per concept: 1 Recognise (term ↔ meaning) · 2 Recall (what the clause requires; shall/should/may) · 3 Explain (why it exists, what goes wrong without it) · 4 Tell apart (confusable concepts) · 5 Apply (one-clause lab scenario) · 6 Combine (scenario across clauses).
- Existing `level` on questions maps: rungs 1–2 = recall, 3–4 = understanding, 5–6 = application.
- **Misconceptions**: each concept lists the typical confusions (verified against the text). Each *wrong option* of a question is tagged with the misconception it represents, so a wrong pick says what the learner probably believes.

## 4. Planner (deterministic, pure code, unit-tested)

Inputs: concept graph, the learner's events, the clock, the question supply. Output: the next step and its reason. No model call is ever on this path.

State per concept (derived from events, cached): `rung` reached, independent-correct count per rung, wrong streak, recent misconception tags, `status`, `dueAt`/`intervalIndex`.

Rules (all thresholds in one config object, documented as heuristics):
1. **Order**: due reviews first but capped at ~30% of a session; then the next new concept whose prerequisites are *Practised*; then remediation.
2. **Opening**: new concept → one rung-2 question, no help offered. Correct → rung 3. Wrong → teach card → guided rung-2 sibling.
3. **Pass a rung**: 2 independent correct answers on *different* questions at that rung, at most 1 wrong in the last 3. Then climb.
4. **Step down**: 2 consecutive wrong at a rung → previous rung + worked example. 3 misses on a concept in a session → queue its weakest prerequisite with the reason shown.
5. **Practised** = rungs 2–5 passed at least once. **Solid** = a later *delayed* (≥1 day) independent correct at rung ≥3; spacing by `nextReview()` from `src/lib/learning/policy.ts`. Hinted or repeated-same-question answers never count toward Solid.
6. **Interleave**: once ≥3 concepts of a module reach rung 3, rung-4 questions mix them with earlier confusables.
7. **Misconception loop**: same tag chosen twice → next step is a rung-4 contrast question for that confusion, with a one-line explanation of the difference.
8. **Supply**: never repeat a question inside 3 attempts; never block on the generator. If unseen supply at (concept, rung) drops below 3, request background generation and use the nearest rung meanwhile.
9. The timed test's wrong answers also feed the review queue (the "mistake loop").

## 5. Question generation intelligence

The generator is driven by a **spec**, not by "write 4 questions about this clause": `{concept, rung, misconceptionTarget?, clauses, count, avoid[]}`.

- Rung templates (recognise, recall incl. shall/should, explain-why, contrast, scenario, cross-clause scenario) with Indian laboratory contexts (assessor, calibration lab, testing lab, customer request).
- Distractors must each instantiate a *listed misconception* or a near-miss requirement from another clause; they are tagged. Every wrong option has a one-sentence reason. No letter references, no all/none/both.
- **Truth gates (unchanged and mandatory)**: proof quote verbatim in the clause (no fuzzy match); the correct option is not in the stem; an independent model from another company solves it blind to the same key; disagreement → discarded, checker failure never counts as agreement; every call reserved against the daily spend cap.
- **Bank first**: questions are generated ahead of time per (concept, rung) and verified. A background top-up job refills thin cells, results appear next session. Nothing waits on a model on the learner's critical path.
- No IRT or per-learner difficulty modelling (too few responses; `docs/ai-score-recovery-review.md` §2.3). Difficulty = rung plus empirical right-rate once ≥20 answers exist.

## 6. AI roles and limits

| AI may | Code only |
| --- | --- |
| Propose concepts, modules, prerequisites, plain-words summaries, misconception lists, questions, hints, worked examples | Decide eligibility, correctness, scoring, scheduling, rung changes, status labels, what is shown next |
| Explain on request ("Ask AI", already built) | Declare anyone "mastered" or predict a score |

Every AI-written text carries the "AI-generated" badge. Concepts and summaries are validated before use: each cites verbatim extracts that exist in the clause; prerequisites are acyclic; every unit with a body belongs to exactly one module; a second AI critiques the proposal and disagreements are listed for human review, not silently resolved.

## 7. Data (migration `0013_standard_teaching.sql`, all RLS-on, additive)

- `standard_concepts` — id, standard_id, module_no, module_title, ord, title, summary, extracts (JSON), clause_nos (JSON), prerequisites (JSON), confusable_with (JSON), misconceptions (JSON), content_fp, status (`proposed`|`reviewed`), model, created_at.
- `standard_question_meta` — question_id (PK), standard_id, concept_id, rung, option_tags (JSON option id → misconception id).
- `standard_learn_events` — id, user_id, standard_id, concept_id, question_id, rung, answer, correct, hinted, seconds, picked_tag, mode (`learn`|`review`|`test`), created_at.
- `standard_learn_cursor` — user_id + standard_id (PK), current step JSON, updated_at (so a refresh returns the same step).
- Per-concept state is recomputed from events by pure code (cached in memory per request); no hidden mutable mastery value.

## 8. API contract (types in `src/lib/standards/engine-types.ts`)

- `GET  /api/standards/<id>/learn` → `LearnOverview` (modules, concepts with status/evidence, due count, whether a next step exists, session position).
- `POST /api/standards/<id>/learn` `{action:"next"}` → `LearnStep` (teach | question | summary); idempotent until answered.
  `{action:"answer", questionId, answer, hinted, seconds}` → `AnswerFeedback`.
  `{action:"hint", questionId}` → `{hint}` (marks the attempt hinted).
  `{action:"ack-teach", conceptId}` → `{ok:true}`.
Answer keys, explanations and proof quotes are returned only in `AnswerFeedback`, after the learner has answered. Same ownership and same-site rules as the other standards routes.

## 9. Work packages (file ownership)

| Pkg | Owns | Depends on |
| --- | --- | --- |
| P1 Curriculum builder | `src/lib/server/standards/curriculum/**`, `scripts/build-standard-curriculum.mjs`, `scripts/import-standard-curriculum.mjs` | the standard text only |
| P2 Engine core | `src/lib/standards/engine/**` (pure), `src/lib/server/standards/engine/**`, `src/app/api/standards/[id]/learn/**`, `scripts/test-standard-engine.mjs` | contract types |
| P3 Guided session UI | `src/app/standards/[id]/learn/**`, `src/components/standards/learn/**` | contract types (mock service) |
| P4 Ladder-aware generator | extends `src/lib/server/standards/questions/**`, `scripts/generate-standard-questions.mjs` | P1 curriculum, agent A's pipeline |
| P5 Integration | learn hub "Continue", timed-test → review queue, end-to-end simulated-learner test | all |

## 10. Verification

- Pure planner: unit tests plus **simulated learners** (strong, weak, misconception-prone, forgetful across simulated days) asserting: strong learners skip teach cards and finish; weak ones get teach cards, step-downs and prerequisites; a repeated misconception triggers the contrast question; reviews appear on the 1/3/7-day schedule; hinted answers never reach Solid; no question repeats within 3 attempts; supply starvation falls back without error.
- API: secrecy before answer, ownership, idempotent `next`, double-answer safe.
- Generator: same gate tests as the bank, plus tag validity (every wrong option has a listed misconception or "near-miss").
- Live: run against a copy of the real standard; read 30 questions by hand per rung family; Postgres run on a throwaway Neon branch.

## 11. Not now

Other standards (the engine is keyed on `standard_id`, so importing another PDF + building its curriculum is the route), Hindi teach cards, learner-visible readiness percentages, any claim about exam outcomes.
