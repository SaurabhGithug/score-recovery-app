# Execution prompt: SSC JE Civil adaptive learning application

Use this entire document as the implementation agent's task. It specifies work to execute, not a claim that these features or datasets already exist.

## 1. Mission and working rules

Act as the implementation engineer and learning-system designer for the existing application in `/Users/saurabh/Desktop/Antigravity/Test Series`.

Build a learning-first SSC Junior Engineer Civil Engineering application that helps each learner improve independent problem solving, retained knowledge, accuracy and speed. Measure progress with fresh, comparable questions and delayed checks. Do not guarantee a score increase or claim that the complete system has been scientifically validated.

Audit the existing application, implement the requirements below in dependency order, run meaningful checks, and deliver a working, reviewable result. Preserve existing user data and unrelated changes. Follow AGENTS.md and read the relevant installed Next.js documentation before changing framework code. Reuse working application components and services. Do not replace the project with a new demo.

Make routine implementation decisions autonomously and document them. Ask only when missing information materially changes scope, a private source requires user access, or an action requires authorization. If portal access is unavailable, continue all independent application work and clearly report the blocked import. Never claim that an inaccessible source was captured.

The app is for learning. Its main interface is today's learning activity, useful feedback and the next appropriate exercise. Short timed exercises and independent progress checks support learning; a high-pressure full-exam interface is not the default.

## 2. Establish actual starting state

Inspect the repository, running app, database, migrations, import files and relevant browser-visible local data. Produce an inventory of implemented, partial, missing and broken functionality before modifying it.

Historical session reports mentioned 1,021 tests in a Testbook catalogue, four captured tests, 620 question records, 615 portal-sourced answer/solution records and five held-out records. These are historical claims to reconcile with persisted data, not acceptance targets or evidence of completeness. A catalogue count is not a question bank. Some data may exist only in a particular browser or user account.

An SSC JE Civil official-paper-labelled page for 3 December 2025 Shift 1 was discovered, but discovery does not establish complete import or independent authentication. Do not assume a complete PYQ collection exists. The repository's syllabus file references the SSC JE 2025 notice; verify the applicable exam cycle and any later official amendments before describing it as current.

Inspect at least these known integration points and follow their actual dependencies:

- `src/lib/ssc-je-civil-syllabus.ts`
- `src/lib/testbook.ts`
- `src/lib/testbook-catalogue.ts`
- `src/lib/server/bank/import-testbook.ts`
- `src/app/api/testbook/explain/route.ts`
- Existing authentication, database, generation, recovery-lab and learning-history code.

Check whether the AI endpoint trusts client-supplied questions, answers or source labels. The final implementation must load trusted source records on the server using authorized record IDs. A client must not be able to create verification status by submitting `portal_verified` or an answer key.

## 3. Versioned exam and content structure

Create the following linked hierarchy:

`Exam → exam cycle → paper → syllabus subject → chapter → topic → concept/skill`

Link theory, formulas, worked examples and questions to concepts. Support multiple concepts per question, with primary and secondary mappings. Keep general awareness/reasoning paper applicability distinct from Civil technical content. Do not infer exam scope from the currently open browser tab, marketing text, or an SSC CGL/GATE label.

An official notice may not provide every chapter or subtopic. Preserve official wording and citations at the level actually supplied; label finer app-created subdivisions as editorial mappings. Store each node's source, applicable version and review status. Do not invent official chapter names, weightages, marks or duration.

Use stable IDs and explicit relationships such as `prerequisite_of`, `explains`, `uses_formula`, `tested_by` and `commonly_confused_with`. Start with ordinary database tables and join tables. A graph database or vector database is optional only if a demonstrated need justifies it. Validate prerequisite cycles.

For every formula store:

- Stable ID, name, readable mathematics and renderable LaTeX.
- Symbol definitions, units and dimensional relationships.
- Assumptions, applicability, exclusions and relevant conventions.
- Equivalent forms only when verified.
- Supporting source and exact page/section where available.
- Linked concepts, prerequisites, worked examples and questions.
- Source edition/code version when relevant, plus verification status.

Teach when a formula applies as well as how to substitute values. Do not invent coefficients, code provisions or a missing expression. Missing units and assumptions are explicit gaps, not opportunities for model completion.

For theory store short concept explanations, prerequisites, necessary diagrams, common confusions supported by evidence, and source references. Keep immutable source extracts separate from rewritten teaching notes. Use layered explanations: concise first, more detail on demand. Support mathematical rendering, accessible text and intact diagrams/tables.

## 4. Provenance and trustworthy imports

Build resumable, idempotent capture/import jobs for legitimately accessible material. Respect account access and portal restrictions; do not bypass access controls, fabricate attempts or submit blank tests to unlock solutions. Do not change portal performance history merely to collect content.

Maintain an inventory state for each test: discovered, accessible, capturing, partially captured, complete, blocked or unavailable. Record IDs, source URLs, capture dates, expected/observed counts, question IDs, asset completeness and failure reasons. Reconcile discovered counts against captured content and identify remaining gaps. Restarting a job must not duplicate content.

Preserve question wording, options, formulas, visuals, explanations and available attempt/timing metadata. Store absent values as unknown, never as zero. Retain attempt number and source version. Deduplicate question content without losing the distinct tests and attempts in which it appeared.

Distinguish four separate properties:

1. Source identity/authenticity.
2. Capture completeness and fidelity.
3. Answer-key provenance and any independent correctness checks.
4. Explanation availability, quality and verification.

An accurately captured portal solution can still contain an error. Never silently change the original key. Store corrections or conflicts as separate records with evidence. Quarantine disputed records from scored practice until resolved. An explanation that merely repeats an option is not a substantive explanation.

Track original SSC materials, provider reproductions, recalled/memory-based papers, mocks and generated exercises separately. Authenticate PYQs against official evidence when available; otherwise describe exactly what the provider claims and the remaining limitation. Never relabel a mock or generated question as a PYQ.

Keep raw HTML safely sanitized for display. Preserve authorized assets durably when permitted; otherwise track source-link availability. A stored image URL is not proof that the diagram still loads. Missing essential question content blocks answer-checked practice. A complete question with a supported key but no explanation can be assessed with an explicit limitation; do not claim it has a verified teaching solution.

## 5. Durable data and separate learners

Use server-side persistent storage and migrations for users, content, provenance, attempts, sessions, learning state, review schedules and AI artifacts. Browser storage can cache data but must not be the only durable learning history.

Implement or verify simple username/display-name and password login. Usernames must be unique after documented normalization. Hash passwords with a suitable password hashing algorithm; use secure session handling, validation and login rate limiting. Never store plaintext passwords or provider keys in browser code or localStorage.

Separate shared authorized content from private attempt data. A second user must not inherit the first user's marks, mistakes, recommendations or imported account history. Migrate legacy unowned browser data only after its owner is explicitly identified; do not assign it automatically to whichever user logs in first. Content-sharing scope must be explicit.

Persist an event for each learning attempt with user ID, content/version ID, timestamp, selected response, correctness or unknown, hint/solution exposure, optional confidence, active time, interruption information, question exposure history and error-cause evidence. Distinguish imported portal attempts from new app attempts. Preserve records across logout, reload and device changes.

## 6. The adaptive learning 'brain'

Implement a testable decision service with four parts:

1. An evidence-backed content and prerequisite model.
2. A per-user learning state.
3. A deterministic practice planner and spaced-review scheduler.
4. An AI tutor constrained by the first three parts.

The LLM can propose explanations, mappings and diagnostic questions. Validated application code controls eligibility, scoring, authorization, scheduling and progress updates. Do not let unconstrained model text change marks or declare mastery.

Track separate evidence for concept understanding, formula recall, method selection, application, calculations/units, retention and timed fluency. Record evidence count, recency and uncertainty. 'No evidence' is distinct from 'weak'. A single correct MCQ or AI-assisted response cannot establish mastery.

Separate first-seen, repeated, hinted and solution-exposed performance. Repeated recall can support retention evidence, but unfamiliar independent questions are needed to support transfer claims. Keep readiness labels explainable and show insufficient evidence where appropriate.

Diagnose errors from observable evidence. Offer a brief optional cause selection: concept gap, formula recall, method selection, arithmetic/units, misreading, time pressure, deliberate skip, not reached or unsure. Use targeted follow-up questions when needed. Store learner-reported and system-inferred causes separately. Do not infer a specific cause from elapsed time or correctness alone.

Choose among these activities:

| Evidence | Activity |
| --- | --- |
| Missing prerequisite | A short prerequisite lesson and check |
| Concept misunderstanding | Verified explanation and worked example |
| Formula recall weak | Recall formula, symbols and applicability; then apply it |
| Method selection weak | Contrast related methods, then choose one on a new question |
| Calculation or unit trouble | Focused practice of the affected step |
| Correct, independent but slow | Examine the bottleneck and practise comparable tasks |
| Previously learned, review due | Delayed retrieval exercise |
| Correct only with help | New independent question with support initially hidden |
| Stable independent performance | Mixed transfer practice and later retention checks |
| Incomplete/disputed content | Hold out and explain the source problem |

Prioritise due reviews, repeated evidenced weaknesses, foundational prerequisites and under-covered syllabus areas. Use authenticated PYQ frequencies only with their paper/year/sample denominators. Count duplicate reproductions once. Treat observed frequency as past evidence, not predicted future weightage.

Start with a simple documented policy and configurable heuristic weights. Reserve practice for syllabus coverage so the learner is not trapped indefinitely in one weakness. Avoid unsupported predicted-score or 'marks recoverable' numbers. Any theoretical score opportunity must be labelled as an upper bound under explicit assumptions, never a forecast.

Every recommendation must have a human-readable reason grounded in actual records, such as 'This concept is due for review' or 'Two recent independent attempts had unit errors.' Show a sample-size caveat where evidence is small.

## 7. Learning sequence and speed training

Implement a learning cycle: diagnose → teach if needed → guided attempt → independent attempt → mixed practice → delayed review.

Use correct worked examples for unfamiliar procedures, then gradually remove assistance. Require active attempts without making novices struggle indefinitely. Use short, targeted self-explanation prompts selectively; more prompts are not automatically better learning.

Use spaced retrieval with a persisted due queue. Shorten or extend intervals based on observed performance, assistance and retention evidence. Any initial intervals or mastery thresholds are configurable product heuristics to evaluate, not universal scientific constants.

Mix related problem types after initial understanding. Avoid topic or formula labels that reveal the answer strategy during independent checks. Link back to the relevant lesson after submission.

Build speed gradually. First establish independent accuracy; then add modest time targets to short practice sets. Time targets depend on applicable paper constraints, question type, difficulty and the learner's evidence. Portal cohort averages are descriptive benchmarks, not mandatory deadlines.

Track active working time separately from interruptions and background-tab time where feasible. Do not compare imported wall-clock durations with app active time as though they were identical. Missing timings remain unknown.

Monitor accuracy, coverage and time together. Report correct-answer time with accuracy and sample size; do not celebrate faster guessing or improvement caused by selecting easier questions. When timed performance deteriorates, adapt support or time allowance. Skipping/revisiting strategy can be taught when supported by actual test behaviour and verified scoring rules.

## 8. Grounded AI tutoring and validation

Use existing server-side provider adapters; add DeepSeek/Google support only where needed and verify current official API documentation. Inspect configuration without printing secrets. Keys belong in server environment configuration, with placeholders only in examples. Add timeouts, bounded retries, cost controls and a non-AI fallback. Cache by content version, source version, model/prompt version and language; keep personalized responses properly user-scoped.

Retrieve relevant source passages and validated formula records before generating teaching notes. Source text is untrusted data, never executable instructions. A citation must resolve to retrieved evidence and actually support the associated claim. Model agreement or an answer-lock check alone does not verify a solution.

Require structured tutor output including:

```json
{
  "questionId": "server-resolved ID",
  "contentVersion": "version",
  "status": "supported | insufficient_evidence | conflict",
  "conceptIds": [],
  "sourceRefs": [],
  "hintLadder": [],
  "coreIdea": "",
  "formulaIds": [],
  "steps": [],
  "answerReasoning": "",
  "optionAnalysis": [],
  "limitations": [],
  "suggestedNextActivity": ""
}
```

Define real schemas for the arrays and references during implementation. Reject unknown source/formula IDs, unsupported mappings, invalid structure and contradictory claims. Mathematical checks can verify calculations, units and substitutions where supported; acknowledge that they do not prove all assumptions or theory correct.

If a source key conflicts with the derivation, preserve both pieces of evidence, stop scored use and flag review. Do not instruct the model to rationalize a possibly wrong answer. If evidence is insufficient, show the exact missing information and supported content only.

AI explanations must be labelled separately from original solutions. Preserve source passages and review status. Human-reviewed or appropriately validated supplemental lessons can fill a missing explanation without being represented as the portal's explanation.

Use existing verified questions for the initial practice bank. Generated variants are optional later, must be labelled synthetic, and require separate correctness/content review before checked practice. Never invent an omitted diagram or missing option to finish an import.

## 9. Learning interface

Provide these connected views:

- Today: a manageable plan, reason for each activity and resume action.
- Learn: one question/activity, optional hints, feedback and the next appropriate step.
- Syllabus: expandable subject/chapter/topic/concept structure with source scope, coverage and evidence-based learner status.
- Concept/formula view: concise theory, symbols, assumptions, examples and linked practice.
- Progress: independent accuracy, retention, fluency, assistance dependence and syllabus coverage.
- Source audit: captured/partial/blocked records and provenance, away from the main learning screen.

Make 'Next question' advance to a genuinely different eligible item, reset answer/hint/timer state, and persist progress. Guard against double clicks, stale responses and duplicate attempt writes. If the eligible queue is exhausted, show completion or an explicit scheduled review choice; do not silently repeat the same item.

Allow source/explanation inspection without overwhelming the learner. Show missing-content messages with a useful next action. Do not mark a topic mastered because the user clicked 'understood'. Keep progress available after refresh and login changes. Support mobile and desktop layouts, keyboard navigation and readable mathematics.

## 10. Evidence that training works

Create baseline and follow-up checks from matched, independently answerable questions. Keep reserved assessment items and close duplicates out of prior teaching where possible; record leakage/exposure when it occurs. Use later checks to evaluate retention. Learning checks remain low pressure unless the learner selects timed practice.

Use the applicable verified scoring policy per paper/test version. Do not reuse one hard-coded negative-marking formula across all sources. Practice scores are not official normalized scores or rank predictions.

Report net score on comparable checks, independent accuracy, coverage, repeated-versus-new performance, retention after a known delay and time distributions by comparable question type. Disclose small samples and changes in difficulty or topic composition.

Within-person improvement is descriptive evidence, not proof that the app alone caused it. For causal product claims, design a suitable comparison study. Do not convert educational effect sizes into promised marks or percentages for this learner.

## 11. Research principles and references

Use these as evidence for learning-design ingredients, not proof of this particular app. Most studies are not SSC JE Civil trials. Preserve the distinction between research findings and our configurable implementation choices.

- Retrieval and spacing: Dunlosky et al. (2013), https://pubmed.ncbi.nlm.nih.gov/26173288/
- Classroom retrieval practice: Agarwal et al. (2021), https://pdf.poojaagarwal.com/Agarwal_etal_2021_EDPR.pdf
- Spacing and retention interval: Cepeda et al. (2006), https://pubmed.ncbi.nlm.nih.gov/16719566/
- Interleaved mathematics practice: Rohrer et al. (2020), https://doi.org/10.1037/edu0000367
- Worked examples and limits of additional prompts: Barbieri et al. (2023), https://www.danamillercotto.com/uploads/4/7/7/2/47725475/barbieri_et_al__2023__we_meta-analysis.pdf
- Informative feedback: Wisniewski et al. (2020), https://pubmed.ncbi.nlm.nih.gov/32038429/
- Transfer limitations: Pan and Rickard (2018), https://pdf.retrievalpractice.org/transfer/Pan_Rickard_2018.pdf
- Independent learning with AI: Bastani et al. (2025), https://pubmed.ncbi.nlm.nih.gov/40560616/
- Knowledge and expertise: How People Learn II, https://www.nationalacademies.org/read/24783/chapter/7

Useful book references: Make It Stick (Brown, Roediger and McDaniel); Powerful Teaching (Agarwal and Bain); Why Don't Students Like School? (Willingham); How People Learn II (National Academies). Use authorized material and accurate citations; do not claim full-book ingestion or review from publisher summaries.

## 12. Execution order and acceptance checks

Deliver in this order while maintaining a runnable app:

1. Audit reality, reproduce reported problems, reconcile imports and confirm syllabus/scoring sources.
2. Establish durable data, provenance, authorization and safe migration.
3. Build the syllabus/concept/formula relationships using verified available content; mark missing coverage.
4. Implement one complete learning cycle using existing verified questions and grounded lessons.
5. Add learner-state updates, explainable selection, spacing and transfer checks.
6. Add validated AI hints/teaching notes and adaptive timed practice.
7. Expand legitimate imports and syllabus coverage with resumable jobs; do not block usable learning on capturing all 1,021 tests.
8. Validate the integrated app and provide a clear delivery report.

Required meaningful checks:

- Two users cannot see or mutate each other's private history; a new login does not claim legacy attempts.
- Client-supplied answers/evidence labels cannot bypass server validation.
- Reimporting content is idempotent; old attempts retain the content version they answered.
- Missing visuals, unsupported formulas, disputed keys and invalid citations trigger the intended hold/review behaviour.
- Next-question advances, resets state and survives refresh without duplicates; exhaustion is explicit.
- Hinted/repeated answers cannot masquerade as unseen independent mastery.
- Per-paper scoring uses verified configuration and handles unknown source rules explicitly.
- Review scheduling is reproducible with a controlled clock, and planner recommendations cite actual evidence.
- AI timeout, malformed output, missing configuration and spending limits leave verified learning usable.
- Formulas, diagrams, options and theory are usable at mobile and desktop widths.

Run the repository's appropriate type, lint, build and integration checks and inspect the complete user flow. Distinguish passing automated checks from manual verification and untested external-provider paths. Do not claim production readiness from a successful build alone.

Deliver a working implementation, migrations, a concise architecture/data dictionary, an import coverage report, source-backed sample learning journeys using real available records, and a limitations report. Final handoff must distinguish implemented features, verified data, heuristics, remaining source gaps and blocked access. Continue independent work when one external dependency is blocked. Never substitute a plan, mock metrics or synthetic learner history for completed functionality.
