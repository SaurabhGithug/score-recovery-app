// Run with: npx tsx scripts/test-bank-explain.mjs
// Question-bank explainer (DECISION-002): blind solve, re-resolve, teaching-note gate, spend and
// caps, routes. LLM_PROVIDER=mock; throwaway SQLite database in a temp directory — never touches
// data/score_recovery.db and never calls a real model.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bank-explain-test-"));
process.chdir(workDir); // getDatabase() resolves data/ from cwd on first use
process.env.LLM_PROVIDER = "mock";
process.env.GENERATION_MAX_USD_PER_RUN = "2";
process.env.GENERATION_MAX_USD_PER_DAY = "5";

const mock = { requests: [] };
globalThis.__mockLlm = mock;

const { UserRepository } = await import("../src/lib/server/repositories/user-repo.ts");
const { SessionRepository } = await import("../src/lib/server/repositories/session-repo.ts");
const { BankRepository } = await import("../src/lib/server/repositories/bank-repo.ts");
const { SpendRepository } = await import("../src/lib/server/repositories/spend-repo.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");
const { MockProvider } = await import("../src/lib/server/llm/mock.ts");
const { LlmError } = await import("../src/lib/server/llm/types.ts");
const { costUsd } = await import("../src/lib/server/generation/pricing.ts");
const attempts = await import("../src/lib/server/bank/attempts.ts");
const { gateTeachingNote, gateOptionVerdicts, parseBlindSolve } = await import("../src/lib/server/bank/explain-gate.ts");
const { runExplainBatch, SKIP, ExplainQueue, estimateQuestionCostUsd, needsFigureOrCleanText, explainForLearner, worstCaseUsd } = await import("../src/lib/server/bank/explain.ts");
const { contentFingerprint } = await import("../src/lib/server/bank/content-fp.ts");
const { BLIND_SOLVE_SYSTEM_PROMPT, TEACHING_NOTE_SYSTEM_PROMPT } = await import("../src/lib/server/bank/explain-prompts.ts");
const questionExplainRoute = await import("../src/app/api/bank/questions/[id]/explain/route.ts");
const paperExplainRoute = await import("../src/app/api/bank/papers/[id]/explain/route.ts");
const testbookExplainRoute = await import("../src/app/api/testbook/explain/route.ts");
const { importTestbook } = await import("../src/lib/server/bank/import-testbook.ts");

let passed = 0;
async function test(name, fn) {
  mock.requests.length = 0;
  delete mock.blindSolve;
  delete mock.teachingNote;
  delete mock.fail;
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

function session(name) {
  const { user } = UserRepository.register(name, "correct horse battery");
  const { token } = SessionRepository.create(user.id);
  return { user, cookie: `score_recovery_session=${encodeURIComponent(token)}` };
}
const A = session("Learner A");
const B = session("Learner B");

function request(url, { cookie, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function call(handler, url, opts = {}, params = {}) {
  const res = await handler(request(url, opts), { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
}

// ------------------------------------------------------------------ fixtures
const OPTIONS = (texts) => texts.map((text, i) => ({ id: "ABCD"[i], text }));
function paper(id, title) {
  BankRepository.upsertPaper({
    id, kind: "pyp", paper: "P1", cycleYear: 2024, examDate: "2024-06-05", shift: "09:00-11:00", title,
    questionCount: 0, durationMinutes: 120, fidelity: "test", publisher: "test", sourceUrl: null, sourceFile: null,
    sourceSha256: null, capturedOn: "2026-09-29", rightsNote: "test", metadata: {},
  });
}
function question(paperId, position, stem, { section = "General Engineering", hasVisual = false, textQuality = "text_layer", solution = null } = {}) {
  const id = `${paperId}-q${position}`;
  BankRepository.upsertQuestion({
    id, paperId, position, section, stem, options: OPTIONS(["opt one", "opt two", "opt three", "opt four"]),
    hasVisual, visualPath: null, sourcePage: null, sourceSolution: solution, topic: null, topicEvidence: "pending",
    metadata: { text_quality: textQuality },
  });
  return id;
}
function key(questionId, authority, answer, group = authority === "ssc_final" ? "ssc" : "testbook") {
  BankRepository.upsertGlobalEvidence({ questionId, authority, sourceGroup: group, sourceLabel: `${authority} key`, answer, detail: {} });
}

const P = "explain-test-p1";
paper(P, "Explain test paper");
const Q = {
  agree: question(P, 1, "Which lime is used under water?"), // testbook A, blind picks A
  disagree: question(P, 2, "Unit of stress?"), // publisher C, blind picks A ⇒ disputed
  official: question(P, 3, "Minimum grade for RCC?"), // SSC final B, blind picks A ⇒ still official
  figure: question(P, 4, "In the figure shown, the force in member AB is", { hasVisual: true }),
  ocr: question(P, 5, "Slump test measures?", { textQuality: "ocr" }),
  nokey: question(P, 6, "Series 2, 4, 8, ?", { section: "Reasoning" }),
  solved: question(P, 7, "Bulking of sand is maximum at about", { solution: "SOURCE-SOLUTION-TEXT: bulking peaks near 4-6% moisture." }),
};
key(Q.agree, "testbook_portal", "A");
key(Q.disagree, "publisher_key", "C", "adda");
key(Q.official, "ssc_final", "B");
key(Q.figure, "testbook_portal", "A");
key(Q.ocr, "testbook_portal", "A");
key(Q.solved, "testbook_portal", "D");

const mockDeps = (over = {}) => ({
  provider: new MockProvider(),
  checkModel: "mock",
  generationModel: "mock",
  budgetUsd: 2,
  maxUsdPerDay: 5,
  spendUserId: "test",
  ...over,
});
const blindRequests = () => mock.requests.filter((r) => r.system === BLIND_SOLVE_SYSTEM_PROMPT);
const noteRequests = () => mock.requests.filter((r) => r.system === TEACHING_NOTE_SYSTEM_PROMPT);
const ev = (qid) => BankRepository.loadEvidenceForQuestion(qid, "");

// ------------------------------------------------------------------ gate (pure)
const IDS = ["A", "B", "C", "D"];
const goodNote = () => ({
  lockedAnswer: "B",
  topic: "Concrete Structures",
  concept: "IS 456 sets the minimum grade by exposure.",
  steps: ["Mild exposure → M20 minimum for RCC (IS 456 Table 5)."],
  whyCorrect: "M20 is the minimum for RCC.",
  options: IDS.map((id) => ({ id, verdict: id === "B" ? "correct" : "wrong", why: `reason ${id}` })),
  traps: ["Confusing PCC and RCC minimums."],
  examTip: "RCC ⇒ M20.",
  verificationLimits: [],
});

await test("gate: accepts a valid note and returns options in the question's order", () => {
  const n = goodNote();
  n.options.reverse();
  const r = gateTeachingNote(n, "B", IDS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.options.map((o) => o.id), IDS);
});

await test("gate: rejects wrong lockedAnswer, missing/extra/duplicate option, two 'correct', key marked wrong, bad topic", () => {
  const cases = [
    ["wrong lockedAnswer", (n) => void (n.lockedAnswer = "C"), /lockedAnswer/],
    ["missing option", (n) => void n.options.pop(), /cover every option/],
    ["extra option", (n) => void n.options.push({ id: "E", verdict: "wrong", why: "x" }), /does not have/],
    ["duplicate option", (n) => void (n.options[3] = { ...n.options[0] }), /twice/],
    ["two correct", (n) => void (n.options[0].verdict = "correct"), /marks a non-key option correct/],
    ["key marked wrong", (n) => void (n.options[1].verdict = "wrong"), /key wrong/],
    ["bad topic", (n) => void (n.topic = "Quantum Physics"), /syllabus/],
    ["empty steps", (n) => void (n.steps = []), /steps is empty/],
    ["empty why", (n) => void (n.options[2].why = "  "), /why is empty/],
    ["over-long why", (n) => void (n.options[2].why = "x".repeat(701)), /longer than/],
    ["not an object", () => "nope", /not a JSON object/],
  ];
  for (const [name, mutate, reason] of cases) {
    const n = goodNote();
    const out = mutate(n);
    const r = gateTeachingNote(typeof out === "string" ? out : n, "B", IDS);
    assert.equal(r.ok, false, name);
    assert.match(r.reason, reason, name);
    assert.ok(!/\bB\b/.test(r.reason), `${name}: the reason must not name the key`);
  }
  assert.equal(gateOptionVerdicts(goodNote().options, IDS, "B").ok, true);
});

await test("blind-solve parser: null / unknown option / bad confidence store nothing", () => {
  assert.equal(parseBlindSolve({ answer: null, confidence: 0.2, reasoning: "needs the figure" }, IDS).ok, false);
  assert.equal(parseBlindSolve({ answer: "E", confidence: 0.9, reasoning: "x" }, IDS).ok, false);
  assert.equal(parseBlindSolve({ answer: "A", confidence: 1.5, reasoning: "x" }, IDS).ok, false);
  const ok = parseBlindSolve({ answer: "b", confidence: 0.8, reasoning: "y".repeat(5000) }, IDS);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.answer, "B");
  assert.equal(ok.value.reasoning.length, 1200);
});

// ------------------------------------------------------------------ batch pipeline
let batch;
let firstRunRequests = [];
await test("batch: blind solve never receives the key, source solution or evidence", async () => {
  mock.blindSolve = (p) => (p.question.startsWith("Bulking") ? { answer: "D", confidence: 0.8, reasoning: "Bulking peaks at 4-6% moisture." } : undefined);
  batch = await runExplainBatch(P, mockDeps());
  firstRunRequests = [...mock.requests];
  const blind = blindRequests();
  assert.equal(blind.length, 4, "agree, disagree, official, solved — not figure/ocr/no-key");
  for (const r of blind) {
    const payload = JSON.parse(r.user);
    assert.deepEqual(Object.keys(payload).sort(), ["exam", "options", "question", "section"]);
    assert.ok(payload.options.every((o) => Object.keys(o).sort().join() === "id,text"));
    assert.doesNotMatch(r.user, /SOURCE-SOLUTION-TEXT|lockedAnswer|testbook|publisher|ssc_final|key/i);
    assert.equal(r.thinking, true);
    assert.equal(r.model, "mock");
  }
  for (const r of noteRequests()) assert.equal(r.thinking, false);
});

await test("batch: blind solve stored as ai_blind_solve evidence (one row per model), upserted on re-run", async () => {
  const rows = ev(Q.agree).filter((e) => e.authority === "ai_blind_solve");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceGroup, "ai:mock");
  assert.equal(rows[0].sourceLabel, "mock blind solve");
  assert.equal(rows[0].userId, "");
  assert.equal(rows[0].answer, "A");
  assert.equal(typeof rows[0].detail.confidence, "number");
  assert.match(rows[0].detail.reasoning, /Mock solver/);
  assert.ok(rows[0].detail.usage.completionTokens > 0);
  assert.equal(BankRepository.resolveKeyFor(Q.agree, A.user.id).status, "ai_checked");
});

await test("batch: agreeing solve ⇒ note with independent working; source solution passed to the note only", async () => {
  const note = BankRepository.getExplanation(Q.solved);
  assert.equal(note.lockedAnswer, "D");
  // Re-run the note step for inspection: delete the note, keep the evidence (no second blind solve).
  getDatabase().prepare("DELETE FROM bank_explanations WHERE question_id = ?").run(Q.solved);
  mock.requests.length = 0;
  const again = await runExplainBatch(P, mockDeps());
  assert.equal(blindRequests().length, 0, "existing blind solves are reused, not re-bought");
  assert.equal(ev(Q.agree).filter((e) => e.authority === "ai_blind_solve").length, 1, "still one row per model");
  assert.equal(again.explained, 1);
  assert.equal(again.skipped[SKIP.alreadyExplained], 1);
  assert.equal(again.skipped[SKIP.noAgreeingSolve], 1, "the official key the blind solve rejected still gets no note");
  const payload = JSON.parse(noteRequests()[0].user);
  assert.equal(payload.lockedAnswer, "D");
  assert.match(payload.sourceSolution, /SOURCE-SOLUTION-TEXT/);
  assert.equal(payload.independentWorking.reasoning, "Bulking peaks at 4-6% moisture.");
  assert.match(payload.independentWorking.note, /same answer/);
});

await test("batch: disagreeing solve on a single-source key ⇒ disputed ⇒ no note", () => {
  assert.equal(BankRepository.resolveKeyFor(Q.disagree, A.user.id).status, "disputed");
  assert.equal(BankRepository.getExplanation(Q.disagree), null);
  assert.equal(batch.disputedByAi, 1);
  assert.equal(batch.skipped[SKIP.disputedByAi], 1);
});

await test("batch: official key + disagreeing AI ⇒ still official and scored, dissent kept, but NO note (a note never argues for a key an independent solve rejected)", () => {
  const k = BankRepository.resolveKeyFor(Q.official, A.user.id);
  assert.equal(k.status, "official");
  assert.equal(k.answer, "B");
  assert.ok(k.dissent.some((e) => e.authority === "ai_blind_solve" && e.answer === "A"));
  assert.equal(BankRepository.getExplanation(Q.official), null);
  assert.equal(batch.aiDissent, 1);
  assert.equal(batch.skipped[SKIP.noAgreeingSolve], 1);
  const noteReq = firstRunRequests
    .filter((r) => r.system === TEACHING_NOTE_SYSTEM_PROMPT)
    .map((r) => JSON.parse(r.user))
    .find((p) => p.question === "Minimum grade for RCC?");
  assert.equal(noteReq, undefined, "no note request is even sent");
  for (const r of firstRunRequests.filter((x) => x.system === TEACHING_NOTE_SYSTEM_PROMPT)) {
    assert.ok(JSON.parse(r.user).independentWorking, "every note request carries the agreeing solve");
  }
});

await test("model-safe text: text layer and intact English of bilingual blocks only; never OCR, garbled, incomplete or figures", () => {
  const rec = (text_quality, hasVisual = false) => ({ hasVisual, metadata: { text_quality } });
  assert.equal(needsFigureOrCleanText(rec("text_layer")), false);
  assert.equal(needsFigureOrCleanText(rec("bilingual_en")), false);
  for (const q of ["ocr", "garbled", "incomplete", undefined]) assert.equal(needsFigureOrCleanText(rec(q)), true, String(q));
  assert.equal(needsFigureOrCleanText(rec("bilingual_en", true)), true, "figure");
});

await test("batch: figure / OCR questions skipped and never sent; no-key question costs nothing", () => {
  assert.equal(batch.skipped[SKIP.needsFigure], 2);
  assert.equal(batch.skipped[SKIP.noScoredKey("no_key")], 1);
  assert.equal(BankRepository.getExplanation(Q.figure), null);
  assert.equal(ev(Q.figure).filter((e) => e.authority === "ai_blind_solve").length, 0);
  assert.equal(batch.explained, 2);
  assert.equal(batch.done, 7);
  assert.equal(batch.state, "done");
});

await test("batch: a note that fails the gate is not stored", async () => {
  const P2 = "explain-test-gate";
  paper(P2, "Gate paper");
  const qid = question(P2, 1, "Which cement sets fastest?");
  key(qid, "testbook_portal", "A");
  mock.teachingNote = (_p, note) => ({ ...note, options: note.options.map((o) => ({ ...o, verdict: "correct" })) });
  const r = await runExplainBatch(P2, mockDeps());
  assert.equal(r.explained, 0);
  assert.equal(r.skipped[SKIP.noteRejected], 1);
  assert.match(r.problems[0].reason, /non-key option correct/);
  assert.equal(BankRepository.getExplanation(qid), null);
});

await test("review: dissent visible on the official key; disputed question has no explanation", () => {
  const attempt = attempts.startAttempt(A.user.id, { paperId: P, mode: "full" });
  attempts.submit(attempt.id, A.user.id, { responses: {} });
  const rv = attempts.review(attempt.id, A.user.id);
  const off = rv.questions.find((q) => q.id === Q.official);
  assert.equal(off.key.status, "official");
  assert.ok(off.key.dissent.some((d) => d.authority === "ai_blind_solve"));
  assert.equal(off.explanation, null, "no note for a key the blind solve rejected");
  assert.equal(rv.questions.find((q) => q.id === Q.disagree).explanation, null);
  assert.equal(rv.questions.find((q) => q.id === Q.agree).explanation.lockedAnswer, "A");
});

// ------------------------------------------------------------------ spend and caps
await test("spend: every billed call recorded, including failed ones; per-run limit stops the run", async () => {
  const P3 = "explain-test-spend";
  paper(P3, "Spend paper");
  const ids = [1, 2, 3, 4].map((n) => question(P3, n, `Priced question ${n}?`));
  for (const id of ids) key(id, "testbook_portal", "A");
  const deps = mockDeps({ checkModel: "deepseek-v4-pro", generationModel: "deepseek-flash" });
  const before = SpendRepository.totalSince(new Date(0));
  mock.fail = (req) =>
    req.system === BLIND_SOLVE_SYSTEM_PROMPT && req.user.includes("Priced question 1?")
      ? new LlmError("cut off", { retryable: false, usage: { promptCacheHitTokens: 0, promptCacheMissTokens: 100, completionTokens: 12000, reasoningTokens: 0 } })
      : null;
  const r = await runExplainBatch(P3, deps, { limit: 2 });
  const after = SpendRepository.totalSince(new Date(0));
  assert.ok(r.spentUsd > 0);
  assert.ok(Math.abs(after - before - r.spentUsd) < 1e-12, "ledger matches the run's spend");
  const failedCost = costUsd("deepseek-v4-pro", { promptCacheHitTokens: 0, promptCacheMissTokens: 100, completionTokens: 12000, reasoningTokens: 0 });
  assert.ok(r.spentUsd >= failedCost, "the failed, billed call is charged");
  assert.equal(r.skipped[SKIP.blindSolveFailed], 1);
  assert.equal(r.explained, 1);
  delete mock.fail;

  mock.requests.length = 0;
  const tiny = await runExplainBatch(P3, { ...deps, budgetUsd: 1e-7 });
  assert.equal(tiny.state, "stopped");
  assert.match(tiny.message, /this run's .* spending limit/);
  assert.equal(mock.requests.length, 0, "the first call's worst case already exceeds the limit: nothing is sent");
  assert.equal(tiny.done, 0, "the question it stopped inside is not counted as done");
});

await test("spend: a fatal provider error stops the run", async () => {
  mock.fail = () => new LlmError("DeepSeek rejected the API key (401).", { fatal: true });
  const P4 = "explain-test-fatal";
  paper(P4, "Fatal paper");
  for (const n of [1, 2]) key(question(P4, n, `Fatal q ${n}?`), "testbook_portal", "A");
  const r = await runExplainBatch(P4, mockDeps());
  assert.equal(r.state, "stopped");
  assert.match(r.message, /401/);
  assert.equal(r.done, 0);
});

// ------------------------------------------------------------------ single-question route
const SP = "explain-test-single";
paper(SP, "Single paper");
const S = {
  agree: question(SP, 1, "Single agree?"), // testbook A
  disagree: question(SP, 2, "Single disagree?"), // testbook B ⇒ blind A disputes
  figure: question(SP, 3, "Single figure?", { hasVisual: true }),
  stale: question(SP, 4, "Single stale?"), // testbook A, later SSC final C
};
key(S.agree, "testbook_portal", "A");
key(S.disagree, "testbook_portal", "B");
key(S.figure, "testbook_portal", "A");
key(S.stale, "testbook_portal", "A");
const url = (id) => `/api/bank/questions/${id}/explain`;
const explain = (who, id) => call(questionExplainRoute.POST, url(id), { cookie: who?.cookie, method: "POST" }, { id });

await test("single route: 401 signed out, 404 unknown, 403 before the learner committed to the question", async () => {
  assert.equal((await explain(null, S.agree)).status, 401);
  assert.equal((await explain(A, "nope")).status, 404);
  const r = await explain(A, S.agree);
  assert.equal(r.status, 403);
  assert.equal(blindRequests().length, 0, "nothing spent before the check");
});

let practice;
await test("single route: after a practice check, explains (blind solve + note) and returns BankExplanation", async () => {
  practice = attempts.startAttempt(A.user.id, { paperId: SP, mode: "practice" });
  for (const id of Object.values(S)) attempts.check(practice.id, A.user.id, { questionId: id, answer: "A" });
  const r = await explain(A, S.agree);
  assert.equal(r.status, 200);
  assert.equal(r.body.explanation.lockedAnswer, "A");
  assert.equal(r.body.explanation.options.length, 4);
  assert.equal(r.body.explanation.model, "mock");
  assert.equal(blindRequests().length, 1);
  mock.requests.length = 0;
  const again = await explain(A, S.agree);
  assert.equal(again.status, 200);
  assert.equal(mock.requests.length, 0, "a fresh stored note is returned without calling the model");
});

await test("single route: disagreeing blind solve on a single-source key ⇒ 409, nothing stored", async () => {
  const r = await explain(A, S.disagree);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /disputed/);
  assert.equal(BankRepository.getExplanation(S.disagree), null);
  assert.equal(BankRepository.resolveKeyFor(S.disagree, B.user.id).status, "disputed", "blind solve is global evidence");
  assert.equal((await explain(A, S.disagree)).status, 409, "stays 409 without spending again");
});

await test("single route: 422 for a figure question (never sent)", async () => {
  assert.equal((await explain(A, S.figure)).status, 422);
  assert.equal(mock.requests.length, 0);
});

await test("single route: stale note hidden after the key changes; no new note while the blind solve disagrees with the new key", async () => {
  assert.equal((await explain(A, S.stale)).status, 200);
  key(S.stale, "ssc_final", "C");
  const k = BankRepository.resolveKeyFor(S.stale, A.user.id);
  assert.equal(k.status, "official");
  const checked = attempts.check(practice.id, A.user.id, { questionId: S.stale, answer: "A" });
  assert.equal(checked.explanation, null, "note locked to A is hidden once the key is C");
  const r = await explain(A, S.stale);
  assert.equal(r.status, 409, "the stored blind solve (A) rejects the new key C");
  assert.match(r.body.error, /did not reach the key/);
  assert.equal(BankRepository.getExplanation(S.stale).lockedAnswer, "A", "nothing new stored; the old note stays hidden");
});

await test("single route: 503 { error: unavailableReason } when AI is not configured", async () => {
  const q = question(SP, 5, "Unconfigured?");
  key(q, "testbook_portal", "A");
  // q was added after `practice` started: that attempt never showed it, so check it in a new one.
  const fresh = attempts.startAttempt(A.user.id, { paperId: SP, mode: "practice" });
  attempts.check(fresh.id, A.user.id, { questionId: q, answer: "A" });
  process.env.LLM_PROVIDER = "deepseek";
  const savedKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const r = await explain(A, q);
    assert.equal(r.status, 503);
    assert.match(r.body.error, /DEEPSEEK_API_KEY is missing/);
    const b = await call(paperExplainRoute.POST, `/api/bank/papers/${SP}/explain`, { cookie: A.cookie, method: "POST" }, { id: SP });
    assert.equal(b.status, 503);
  } finally {
    process.env.LLM_PROVIDER = "mock";
    if (savedKey !== undefined) process.env.DEEPSEEK_API_KEY = savedKey;
  }
});

// ------------------------------------------------------------------ batch route
async function waitForJob(paperId, jobId) {
  for (let i = 0; i < 200; i++) {
    const r = await call(paperExplainRoute.GET, `/api/bank/papers/${paperId}/explain?job=${jobId}`, { cookie: B.cookie }, { id: paperId });
    if (r.body.job.state !== "running") return r;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not finish");
}

await test("batch route: 401, 404, 202 + progress, one run at a time, progress carries no key", async () => {
  const BP = "explain-test-route";
  paper(BP, "Route paper");
  for (const n of [1, 2, 3]) key(question(BP, n, `Route q ${n}?`), "testbook_portal", "A");
  assert.equal((await call(paperExplainRoute.POST, `/api/bank/papers/${BP}/explain`, { method: "POST" }, { id: BP })).status, 401);
  assert.equal((await call(paperExplainRoute.GET, `/api/bank/papers/${BP}/explain`, {}, { id: BP })).status, 401);
  assert.equal((await call(paperExplainRoute.POST, `/api/bank/papers/none/explain`, { cookie: A.cookie, method: "POST" }, { id: "none" })).status, 404);
  assert.equal((await call(paperExplainRoute.GET, `/api/bank/papers/${BP}/explain`, { cookie: A.cookie }, { id: BP })).status, 404);

  const start = await call(paperExplainRoute.POST, `/api/bank/papers/${BP}/explain`, { cookie: A.cookie, method: "POST", body: { limit: 2 } }, { id: BP });
  assert.equal(start.status, 202);
  assert.equal(start.body.job.state, "running");
  assert.equal(start.body.job.total, 2);
  const second = await call(paperExplainRoute.POST, `/api/bank/papers/${P}/explain`, { cookie: B.cookie, method: "POST" }, { id: P });
  assert.equal(second.status, 409, "one batch at a time, server-wide");

  const done = await waitForJob(BP, start.body.job.jobId);
  const job = done.body.job;
  assert.equal(job.state, "done");
  for (const field of ["done", "total", "explained", "skipped", "disputedByAi", "spentUsd", "state"]) assert.ok(field in job, field);
  assert.equal(job.done, 2);
  assert.equal(job.explained, 2);
  assert.doesNotMatch(JSON.stringify(job), /"answer"|lockedAnswer|"key"/);
  const latest = await call(paperExplainRoute.GET, `/api/bank/papers/${BP}/explain`, { cookie: B.cookie }, { id: BP });
  assert.equal(latest.body.job.jobId, job.jobId);
  assert.equal(ExplainQueue.isRunning(), false);
  assert.equal((await call(paperExplainRoute.POST, `/api/bank/papers/${BP}/explain`, { cookie: A.cookie, method: "POST", body: { limit: 0 } }, { id: BP })).status, 400);
});

await test("daily cap: 429 on both routes once the 24-hour limit is spent; a running batch stops", async () => {
  const q = question(SP, 6, "Daily cap?");
  key(q, "testbook_portal", "A");
  const fresh = attempts.startAttempt(A.user.id, { paperId: SP, mode: "practice" });
  attempts.check(fresh.id, A.user.id, { questionId: q, answer: "A" });
  SpendRepository.add({ userId: "test", documentId: null, model: "deepseek-v4-pro", costUsd: 5 });
  assert.equal((await explain(A, q)).status, 429);
  assert.equal((await call(paperExplainRoute.POST, `/api/bank/papers/${SP}/explain`, { cookie: A.cookie, method: "POST" }, { id: SP })).status, 429);
  const r = await runExplainBatch(SP, mockDeps());
  assert.equal(r.state, "stopped");
  assert.match(r.message, /24-hour/);
  assert.equal(mock.requests.length, 0);
});

// ------------------------------------------------------------------ testbook teaching note
await test("testbook explain: loads the question and key on the server from the learner's own capture", async () => {
  getDatabase().prepare("DELETE FROM llm_spend").run();
  const capture = {
    schemaVersion: 1,
    source: { provider: "Testbook", exam: "SSC JE", branch: "Civil Engineering", series: "SSC JE CE", capturedOn: "2026-09-20", sourceUrl: "https://testbook.com/x", attemptLabel: "1", integrityPolicy: "" },
    catalogue: { observedTotalTests: 1, observedProgress: "", categories: [], warning: "" },
    tests: [{
      id: "tb-rcc", title: "SSC JE CE Full Test 9", score: 0, maxScore: 1, attemptNumber: 1, questionCount: 1, sections: [],
      summary: { correct: 0, incorrect: 1, unattempted: 0, partial: 0 },
      questions: [{
        id: "q-rcc", globalNumber: 1, section: "Civil Engineering", sectionQuestion: 1,
        questionText: "Minimum grade of concrete for RCC?", questionHtml: "", questionAssets: [],
        options: ["M15", "M20", "M25", "M30"].map((text, i) => ({ id: "ABCD"[i], text, html: "", assets: [] })),
        originalResult: "incorrect", marksText: "+1 / -0.25", syllabusTopic: null, topicEvidence: "pending",
        evidenceState: "portal_verified",
        portalSolution: { correctOption: "B", html: "", text: "IS 456: M20 for RCC.", assets: [], evidenceText: "Correct Option: 2" },
      }],
    }],
  };

  // The old contract (question and answer supplied by the browser) is refused outright.
  const legacy = await testbookExplainRoute.POST(
    request("/api/testbook/explain", { cookie: A.cookie, method: "POST", body: { questionText: "x", options: OPTIONS(["a", "b"]), correctOption: "A", portalExplanation: "x", section: "x" } })
  );
  assert.equal(legacy.status, 400);
  // Ids of a capture that is not on the server yet.
  const missing = await testbookExplainRoute.POST(request("/api/testbook/explain", { cookie: A.cookie, method: "POST", body: { testId: "tb-rcc", questionId: "q-rcc" } }));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "not_on_server");

  importTestbook(capture, A.user.id);
  mock.blindSolve = () => ({ answer: "B", confidence: 0.9, reasoning: "IS 456 minimum for RCC is M20." });
  // A client-supplied answer is ignored: the key comes from A's stored capture (B).
  const res = await testbookExplainRoute.POST(
    request("/api/testbook/explain", { cookie: A.cookie, method: "POST", body: { testId: "tb-rcc", questionId: "q-rcc", correctOption: "A" } })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.note.lockedAnswer, "B");
  assert.deepEqual(body.note.options.map((o) => o.verdict), ["wrong", "correct", "wrong", "wrong"]);
  assert.ok(mock.requests.every((r) => !/correctOption|"A"\s*:\s*true/.test(r.user)));

  // Another learner naming the same ids reaches nothing of A's.
  const other = await testbookExplainRoute.POST(request("/api/testbook/explain", { cookie: B.cookie, method: "POST", body: { testId: "tb-rcc", questionId: "q-rcc" } }));
  assert.equal(other.status, 404);
});

await test("cost estimate per question is in the expected range for DeepSeek", () => {
  const e = estimateQuestionCostUsd(BankRepository.getQuestion(Q.agree), "deepseek-v4-pro", "deepseek-flash");
  assert.ok(e.peak > 0.005 && e.peak < 0.03, `peak ${e.peak}`);
  assert.ok(Math.abs(e.offPeak * 2 - e.peak) < 1e-12);
  console.log(`    estimate per question: $${e.offPeak.toFixed(4)} off-peak, $${e.peak.toFixed(4)} peak`);
});

// ------------------------------------------------------------------ audit fixes (2026-09-29)
await test("blind solve with no answer (text incomplete/ambiguous) ⇒ no note, nothing stored", async () => {
  getDatabase().prepare("DELETE FROM llm_spend").run();
  const PN = "explain-test-null";
  paper(PN, "Null solve paper");
  const qid = question(PN, 1, "Which of the following is correct?");
  key(qid, "testbook_portal", "B");
  mock.blindSolve = () => ({ answer: null, confidence: 0.1, reasoning: "The options are cut off; no option can be chosen." });
  mock.requests.length = 0;
  const r = await runExplainBatch(PN, mockDeps());
  delete mock.blindSolve;
  assert.equal(r.explained, 0);
  assert.equal(r.skipped[SKIP.blindSolveNoAnswer], 1);
  assert.equal(noteRequests().length, 0, "no note request after a null solve");
  assert.equal(BankRepository.getExplanation(qid), null);
});

await test("a learner's own resolution of a dispute is never explained as a verified key", async () => {
  getDatabase().prepare("DELETE FROM llm_spend").run();
  const PR = "explain-test-reviewed";
  paper(PR, "Reviewed paper");
  const qid = question(PR, 1, "Reviewed question?");
  key(qid, "publisher_key", "B", "pub");
  BankRepository.upsertGlobalEvidence({
    questionId: qid, authority: "ai_blind_solve", sourceGroup: "ai:mock", sourceLabel: "mock blind solve", answer: "A",
    detail: { reasoning: "picks A", content_fp: contentFingerprint(BankRepository.getQuestion(qid)) },
  });
  assert.equal(BankRepository.resolveKeyFor(qid, A.user.id).status, "disputed");
  const at = attempts.startAttempt(A.user.id, { paperId: PR, mode: "practice" });
  attempts.check(at.id, A.user.id, { questionId: qid, answer: "C" });
  attempts.resolveDispute(qid, A.user.id, { answer: "C" });
  assert.equal(BankRepository.resolveKeyFor(qid, A.user.id).status, "reviewed");
  mock.requests.length = 0;
  const r = await explain(A, qid);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /your own resolution/);
  assert.equal(noteRequests().length, 0);
  assert.equal(BankRepository.getExplanation(qid), null, "nothing reaches the shared notes table");
});

await test("spend: 20 concurrent explain requests can never push the ledger past the 24-hour cap", async () => {
  getDatabase().prepare("DELETE FROM llm_spend").run();
  const PC = "explain-test-concurrent";
  paper(PC, "Concurrent paper");
  const ids = Array.from({ length: 20 }, (_, i) => question(PC, i + 1, `Concurrent priced question number ${i + 1}?`));
  for (const id of ids) key(id, "testbook_portal", "A");
  const at = attempts.startAttempt(A.user.id, { paperId: PC, mode: "full" });
  attempts.submit(at.id, A.user.id, { responses: {} }); // commits all 20 at once
  const worst = worstCaseUsd({ model: "deepseek-v4-pro", system: BLIND_SOLVE_SYSTEM_PROMPT, user: "x".repeat(400), thinking: true, maxTokens: 12000 });
  const cap = worst * 3.5; // room for ~3 worst-case calls, not 20
  const deps = mockDeps({ checkModel: "deepseek-v4-pro", generationModel: "deepseek-v4-pro", maxUsdPerDay: cap, budgetUsd: 100 });
  // Every call really bills a full-length thinking answer: 20 of them would cost ~6.7 worst cases.
  mock.usage = (req) => ({ promptCacheHitTokens: 0, promptCacheMissTokens: 200, completionTokens: req.maxTokens, reasoningTokens: 0 });
  mock.delayMs = 30;
  mock.requests.length = 0;
  const results = await Promise.allSettled(ids.map((id) => explainForLearner(id, A.user.id, deps)));
  delete mock.delayMs;
  delete mock.usage;
  const total = SpendRepository.totalSince(new Date(0));
  assert.ok(total <= cap + 1e-12, `ledger ${total} must not exceed cap ${cap}`);
  assert.ok(mock.requests.length < ids.length, `not every request was sent (${mock.requests.length} of ${ids.length})`);
  assert.ok(results.some((x) => x.status === "rejected" && x.reason.status === 429), "the rest are refused with 429");
});

console.log(`\n${passed} tests passed`);
fs.rmSync(workDir, { recursive: true, force: true });
