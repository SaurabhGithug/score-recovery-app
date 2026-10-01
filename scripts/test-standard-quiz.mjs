// Timed standards quiz: selection, secrecy, deadlines, scoring, ownership, validation.
// Isolated fixtures only: a fresh temp SQLite database, an INVENTED "standard" and invented
// questions (no text from any real standard), two learners and a fixed, hand-advanced clock.
// Run: npx tsx scripts/test-standard-quiz.mjs
// Postgres run (ONLY a throwaway database or Neon branch, never production; the 0010 and 0011 migrations must be applied):
//   TEST_DATABASE_URL=postgres://... npx tsx scripts/test-standard-quiz.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "standard-quiz-test-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(temp, "data");
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;
// Unique per run so a shared Postgres database never sees clashing primary keys.
const RUN = Math.random().toString(16).slice(2, 8);
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  console.log(`Postgres run against ${new URL(process.env.TEST_DATABASE_URL).host.replace(/^[^@]*@/, "")}`);
}

const { StandardsRepository: R } = await import("../src/lib/server/standards/repo.ts");
const { QuizRepository, clauseFingerprint } = await import("../src/lib/server/standards/quiz-repo.ts");
const { createQuizService, selectQuestions, ActiveAttemptError, GRACE_SECONDS } = await import("../src/lib/server/standards/quiz.ts");
const { SessionRepository } = await import("../src/lib/server/repositories/session-repo.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");
if (getDatabase().dialect !== (process.env.TEST_DATABASE_URL ? "postgres" : "sqlite")) throw new Error("Wrong database dialect for this run.");
const quizRoute = await import("../src/app/api/standards/[id]/quiz/route.ts");
const attemptRoute = await import("../src/app/api/standards/quiz/attempt/[attemptId]/route.ts");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`✗ ${name}\n    ${String(err?.stack ?? err).split("\n").slice(0, 3).join("\n    ")}`);
  }
}
async function rejectsWith(promise, status, pattern) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected HTTP ${status}, got ${err.status}: ${err.message}`);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

// ---------------------------------------------------------------- fixtures (all invented)
const db = getDatabase();
const addUser = (id) => db.prepare("INSERT INTO users (id, name, normalized_name) VALUES (?, ?, ?)").run(id, id, id);
const ALICE = `usr_quiz_alice_${RUN}`;
const BOB = `usr_quiz_bob_${RUN}`;
const CAROL = `usr_quiz_carol_${RUN}`;
for (const u of [ALICE, BOB, CAROL]) await addUser(u);

const U = (clauseNo, title, body, parentNo = null) => ({ clauseNo, parentNo, title, body, page: 1 });
const unitsFor = (overrides = {}) =>
  [
    U("3", "Terms", ""),
    U("3.1", "gizmo", "a small device used in the pretend workshop", "3"),
    U("4", "General rules", ""),
    U("4.1", "Fairness", "The pretend workshop shall treat every customer evenly.", "4"),
    U("4.2", "Secrecy", "The pretend workshop shall keep customer drawings locked away.", "4"),
    U("6", "Resource requirements", ""),
    U("6.1", "Staff", "Workers shall wear blue hats on Tuesdays.", "6"),
    U("6.2", "Tools", "Hammers shall be counted every evening.", "6"),
    U("7", "Process requirements", ""),
    U("7.8", "Reporting of results", ""),
    U("7.8.1", "Report basics", "Every report shall be printed on green paper.", "7.8"),
    U("7.8.2", "Report contents", "Every report shall name the gizmo tested.", "7.8"),
    U("A", "Annex A (informative) — Pretend tracing", ""),
    U("A.1", "General", "Tracing is done with string.", "A"),
  ].map((u, ord) => ({ ...u, ...(overrides[u.clauseNo] ?? {}), ord }));

const { id: STD } = await R.importStandard({ ownerUserId: ALICE, code: "PRETEND 1", title: "Pretend Workshop Standard", sourceName: "invented.txt", units: unitsFor() });
const { id: BOB_STD } = await R.importStandard({ ownerUserId: BOB, code: "PRETEND 1", title: "Pretend Workshop Standard", sourceName: "invented.txt", units: unitsFor() });
const { id: CAROL_STD } = await R.importStandard({ ownerUserId: CAROL, code: "PRETEND 1", title: "Pretend Workshop Standard", sourceName: "invented.txt", units: unitsFor() });

const PER_UNIT = { "3.1": 2, "4.1": 6, "4.2": 3, "6.1": 3, "6.2": 2, "7.8.1": 3, "7.8.2": 2, "A.1": 2 };
const KEY = {}; // question id -> answer
const SECRETS = []; // strings that must never appear before submit
let seq = 0;
async function seed(standardId) {
  const clauses = await R.clauses(standardId);
  for (const [clauseNo, n] of Object.entries(PER_UNIT)) {
    const clause = clauses.find((c) => c.clause_no === clauseNo);
    const qs = [];
    for (let i = 0; i < n; i++) {
      const k = ++seq;
      const answer = ["A", "B", "C", "D"][k % 4];
      const id = `sq_test_${RUN}_${k}`;
      KEY[id] = answer;
      const explanation = `EXPLAIN-SECRET-${k} because the pretend rule says so`;
      const notes = Object.fromEntries(["A", "B", "C", "D"].filter((o) => o !== answer).map((o) => [o, `NOTE-SECRET-${k}-${o}`]));
      const proof = `PROOF-SECRET-${k} quoted from pretend clause`;
      SECRETS.push(explanation, proof, ...Object.values(notes));
      qs.push({
        id,
        clauseNo,
        clauseFp: clauseFingerprint(clause),
        stem: `Pretend question ${k} about clause ${clauseNo}?`,
        options: ["A", "B", "C", "D"].map((o) => ({ id: o, text: `Option ${o} of question ${k}` })),
        answer,
        explanation,
        optionNotes: notes,
        proofQuote: proof,
        proofClauseNo: `${clauseNo}.1`,
        difficulty: 2,
        level: "recall",
        status: "verified",
        generatedBy: "fixture",
        checkedBy: "fixture-checker",
        checkIndependence: "other_provider",
      });
    }
    // Never shown: one needs_review and one stale (clause changed since it was written) per unit.
    qs.push({ ...qs[0], id: `sq_review_${clauseNo}_${standardId}`, status: "needs_review" });
    qs.push({ ...qs[0], id: `sq_stale_${clauseNo}_${standardId}`, clauseFp: "0".repeat(32) });
    await QuizRepository.replaceClauseQuestions(standardId, clauseNo, qs);
  }
}
await seed(STD);
await seed(BOB_STD);
await seed(CAROL_STD);
const TOTAL = Object.values(PER_UNIT).reduce((a, b) => a + b, 0);

let clock = new Date("2026-03-01T10:00:00.000Z");
const advance = (seconds) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};
let rngState = 1;
const svc = createQuizService({ now: () => new Date(clock.getTime()), random: () => ((rngState = (rngState * 48271) % 2147483647) / 2147483647) });

const clauseOfId = async (ids) => new Map((await QuizRepository.getMany(STD, ids)).map((q) => [q.id, q.clauseNo]));
const allScope = { kind: "all" };
/** Finishes whatever is running for a learner by letting time run out. */
async function finishRunning(user = ALICE, std = STD) {
  const o = await svc.overview(user, std);
  if (o.active) {
    advance(Math.ceil((new Date(o.active.deadlineAt).getTime() - clock.getTime()) / 1000) + 1);
    await svc.get(user, o.active.id);
  }
}

// ---------------------------------------------------------------- overview
await test("overview: counts only verified, fresh questions; sections 4-8 only; empty history", async () => {
  const o = await svc.overview(ALICE, STD);
  assert.equal(o.available.total, TOTAL);
  assert.deepEqual(o.available.byClause, PER_UNIT);
  assert.deepEqual(o.available.bySection, { 4: 9, 6: 5, 7: 5 });
  assert.deepEqual(o.history, []);
  assert.equal(o.active, null);
  assert.equal(o.bestPercent, null);
});

// ---------------------------------------------------------------- selection
await test("selection: balanced across units (one per unit per round) — service, whole standard", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 16 });
  const units = await clauseOfId(a.questions.map((q) => q.id));
  const per = {};
  for (const q of a.questions) per[units.get(q.id)] = (per[units.get(q.id)] ?? 0) + 1;
  assert.deepEqual(per, Object.fromEntries(Object.keys(PER_UNIT).map((u) => [u, 2])));
  assert.equal(new Set(a.questions.map((q) => q.id)).size, 16, "no duplicates");
  for (const q of a.questions) assert.match(q.id, /^sq_test_/, "only verified, fresh questions");
  await finishRunning();
});

await test("selection: pure round-robin keeps units within 1 of each other and prefers unseen questions", () => {
  const mk = (unit, n) => Array.from({ length: n }, (_, i) => ({ id: `${unit}#${i}`, clauseNo: unit }));
  const pool = [...mk("u1", 10), ...mk("u2", 3), ...mk("u3", 3), ...mk("u4", 3)];
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const ids = selectQuestions(pool, 12, new Set(), rnd);
  const per = {};
  for (const id of ids) per[id.split("#")[0]] = (per[id.split("#")[0]] ?? 0) + 1;
  assert.deepEqual(per, { u1: 3, u2: 3, u3: 3, u4: 3 });
  const thirteen = selectQuestions(pool, 13, new Set(), rnd);
  assert.equal(thirteen.filter((id) => id.startsWith("u1#")).length, 4, "the only unit with spare questions takes the extra one");
  const recent = new Set(mk("u1", 10).slice(0, 8).map((q) => q.id));
  const one = selectQuestions(mk("u1", 10), 2, recent, rnd);
  assert.deepEqual([...one].sort(), ["u1#8", "u1#9"], "unseen questions first");
});

await test("selection: questions from the last 3 attempts are used last", async () => {
  const first = await svc.start(ALICE, STD, { scope: { kind: "clause", clauseNo: "4.1" }, count: 5 });
  await svc.submit(ALICE, first.id, { action: "submit", responses: {} });
  const second = await svc.start(ALICE, STD, { scope: { kind: "clause", clauseNo: "4.1" }, count: 5 });
  const all41 = (await QuizRepository.listVerified(STD, await R.clauses(STD), new Set(["4.1"]))).map((q) => q.id);
  const unseen = all41.filter((id) => !first.questions.some((q) => q.id === id));
  assert.equal(unseen.length, 1);
  assert.ok(second.questions.some((q) => q.id === unseen[0]), "the one unseen question is included");
  await svc.submit(ALICE, second.id, { action: "submit", responses: {} });
});

await test("selection: clause scope takes the clause and its sub-clauses; labels name the clause", async () => {
  const a = await svc.start(ALICE, STD, { scope: { kind: "clause", clauseNo: "7.8" }, count: 5 });
  assert.equal(a.scopeLabel, "Clause 7.8 Reporting of results");
  assert.deepEqual(new Set(a.questions.map((q) => q.clauseNo)), new Set(["7.8.1", "7.8.2"]));
  assert.equal(a.questions.find((q) => q.clauseNo === "7.8.1").clauseTitle, "Report basics");
  await svc.submit(ALICE, a.id, { action: "submit", responses: {} });
  const s = await svc.start(ALICE, STD, { scope: { kind: "section", section: "6" }, count: 5 });
  assert.equal(s.scopeLabel, "Clause 6 – Resource requirements");
  assert.deepEqual(new Set(s.questions.map((q) => q.clauseNo)), new Set(["6.1", "6.2"]));
  await svc.submit(ALICE, s.id, { action: "submit", responses: {} });
  const w = await svc.start(ALICE, STD, { scope: allScope, count: 5 });
  assert.equal(w.scopeLabel, "Whole standard");
  await svc.submit(ALICE, w.id, { action: "submit", responses: {} });
});

// ---------------------------------------------------------------- secrecy
await test("secrecy: AttemptView (start, GET, route JSON) carries no key, explanation, option note or proof", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 20, secondsPerQuestion: 45 });
  const views = [a, await svc.get(ALICE, a.id)];
  for (const v of views) {
    const json = JSON.stringify(v);
    for (const s of SECRETS) assert.ok(!json.includes(s), `leaked: ${s}`);
    assert.doesNotMatch(json, /SECRET|explanation|optionNotes|proofQuote|proofClauseNo/);
    for (const q of v.questions) {
      assert.deepEqual(Object.keys(q).sort(), ["clauseNo", "clauseTitle", "id", "options", "stem"]);
      for (const o of q.options) assert.deepEqual(Object.keys(o).sort(), ["id", "text"]);
    }
    assert.ok(!("answer" in v.questions[0]));
  }
  assert.equal(a.limitSeconds, 20 * 45);
  assert.equal(new Date(a.deadlineAt).getTime() - new Date(a.startedAt).getTime(), 20 * 45 * 1000);
  assert.equal(a.serverNow, clock.toISOString());
  await svc.submit(ALICE, a.id, { action: "submit", responses: {} });
});

// ---------------------------------------------------------------- running attempt rules
let running;
await test("start: 409 with activeAttemptId while a test is running; ids stable on GET", async () => {
  running = await svc.start(ALICE, STD, { scope: allScope, count: 10, limitSeconds: 600 });
  await assert.rejects(svc.start(ALICE, STD, { scope: allScope, count: 5 }), (err) => {
    assert.ok(err instanceof ActiveAttemptError);
    assert.equal(err.status, 409);
    assert.equal(err.activeAttemptId, running.id);
    return true;
  });
  const again = await svc.get(ALICE, running.id);
  assert.deepEqual(again.questions.map((q) => q.id), running.questions.map((q) => q.id));
  assert.equal((await svc.overview(ALICE, STD)).active.id, running.id);
});

await test("save: autosaved responses come back on GET (refresh resumes)", async () => {
  const [q1, q2] = running.questions;
  advance(30);
  const res = await svc.save(ALICE, running.id, { action: "save", responses: { [q1.id]: { answer: "B", marked: true, seconds: 12 }, [q2.id]: { answer: null, marked: false, seconds: 3 } } });
  assert.equal(res.saved, true);
  const v = await svc.get(ALICE, running.id);
  assert.deepEqual(v.responses[q1.id], { answer: "B", marked: true, seconds: 12 });
  assert.deepEqual(v.responses[q2.id], { answer: null, marked: false, seconds: 3 });
  assert.equal(v.serverNow, clock.toISOString());
});

await test("validation: bad answer letters, unknown question ids, bad marked/seconds are 400", async () => {
  const q = running.questions[0];
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: { [q.id]: { answer: "E" } } }), 400, /A, B, C, D or null/);
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: { [q.id]: { answer: "a" } } }), 400, /A, B, C, D/);
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: { sq_not_in_test: { answer: "A" } } }), 400, /not in this test/);
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: { [q.id]: { answer: "A", marked: "yes" } } }), 400, /marked/);
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: { [q.id]: { answer: "A", seconds: -1 } } }), 400, /seconds/);
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: [] }), 400, /responses/);
  await rejectsWith(svc.submit(ALICE, running.id, { action: "submit", responses: { [q.id]: { answer: "Z" } } }), 400);
});

await test("deadline: save inside the grace period is accepted; after it 409; submit after grace scores the last save", async () => {
  const [q1, q2, q3] = running.questions;
  advance((new Date(running.deadlineAt).getTime() - clock.getTime()) / 1000 + GRACE_SECONDS - 2);
  await svc.save(ALICE, running.id, { action: "save", responses: { [q1.id]: { answer: KEY[q1.id], marked: false, seconds: 20 }, [q2.id]: { answer: KEY[q2.id], marked: false, seconds: 20 } } });
  advance(3); // deadline + grace + 1 s
  await rejectsWith(svc.save(ALICE, running.id, { action: "save", responses: {} }), 409, /Time is up/);
  const r = await svc.submit(ALICE, running.id, { action: "submit", responses: { [q3.id]: { answer: KEY[q3.id], marked: false, seconds: 5 } } });
  assert.equal(r.correct, 2, "the late body is ignored; the two saved answers count");
  assert.equal(r.questions.find((q) => q.id === q3.id).yourAnswer, null);
  assert.equal(r.autoSubmitted, true);
  assert.equal(r.timeUsedSeconds, 600);
  assert.equal(r.submittedAt, running.deadlineAt, "never later than the deadline");
});

await test("deadline: submit within the grace period uses the body's answers", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 5, limitSeconds: 60 });
  advance(60 + GRACE_SECONDS - 1);
  const body = Object.fromEntries(a.questions.map((q) => [q.id, { answer: KEY[q.id], marked: false, seconds: 10 }]));
  const r = await svc.submit(ALICE, a.id, { action: "submit", responses: body, auto: true });
  assert.equal(r.correct, 5);
  assert.equal(r.autoSubmitted, true);
});

await test("auto-finalize: GET after the deadline returns the result scored from saved answers", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 6, limitSeconds: 120 });
  const [q1, q2] = a.questions;
  const wrong = ["A", "B", "C", "D"].find((o) => o !== KEY[q2.id]);
  await svc.save(ALICE, a.id, { action: "save", responses: { [q1.id]: { answer: KEY[q1.id], marked: true, seconds: 40 }, [q2.id]: { answer: wrong, marked: false, seconds: 30 } } });
  advance(121);
  const r = await svc.get(ALICE, a.id);
  assert.ok("submittedAt" in r && r.autoSubmitted === true);
  assert.deepEqual([r.correct, r.wrong, r.skipped, r.total], [1, 1, 4, 6]);
  assert.equal(r.questions.find((q) => q.id === q1.id).marked, true);
  assert.equal(r.questions.find((q) => q.id === q1.id).seconds, 40);
  assert.equal((await svc.overview(ALICE, STD)).active, null);
});

await test("auto-finalize: starting a new test finishes an expired one first", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 5, limitSeconds: 60 });
  advance(61);
  const b = await svc.start(ALICE, STD, { scope: allScope, count: 5 });
  const old = await svc.get(ALICE, a.id);
  assert.ok(old.submittedAt && old.autoSubmitted);
  assert.notEqual(a.id, b.id);
  await svc.submit(ALICE, b.id, { action: "submit", responses: {} });
});

await test("start: two starts at once leave exactly one running attempt", async () => {
  const results = await Promise.allSettled([svc.start(ALICE, STD, { scope: allScope, count: 5 }), svc.start(ALICE, STD, { scope: allScope, count: 5 })]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const bad = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1, "one start succeeds");
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.activeAttemptId, ok[0].value.id);
  const open = await db.prepare("SELECT id FROM standard_quiz_attempts WHERE user_id = ? AND submitted_at IS NULL").all(ALICE);
  assert.deepEqual(open.map((r) => r.id), [ok[0].value.id]);
  await svc.submit(ALICE, ok[0].value.id, { action: "submit", responses: {} });
});

// ---------------------------------------------------------------- scoring
let scored;
await test("scoring: correct / wrong / skipped, time used, byClause in clause order with titles, review fields", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 8, limitSeconds: 600 });
  const responses = {};
  a.questions.forEach((q, i) => {
    if (i < 4) responses[q.id] = { answer: KEY[q.id], marked: i === 0, seconds: 15 };
    else if (i < 6) responses[q.id] = { answer: ["A", "B", "C", "D"].find((o) => o !== KEY[q.id]), marked: false, seconds: 9 };
  });
  advance(125);
  scored = await svc.submit(ALICE, a.id, { action: "submit", responses });
  assert.deepEqual([scored.total, scored.correct, scored.wrong, scored.skipped], [8, 4, 2, 2]);
  assert.equal(scored.timeUsedSeconds, 125);
  assert.equal(scored.autoSubmitted, false);
  assert.equal(scored.scopeLabel, "Whole standard");
  assert.deepEqual(scored.scope, { kind: "all" });
  assert.deepEqual(scored.questions.map((q) => q.id), a.questions.map((q) => q.id), "test order kept");
  assert.deepEqual(scored.byClause.map((b) => b.clauseNo), ["3.1", "4.1", "4.2", "6.1", "6.2", "7.8.1", "7.8.2", "A.1"]);
  assert.equal(scored.byClause.find((b) => b.clauseNo === "6.2").clauseTitle, "Tools");
  assert.equal(scored.byClause.reduce((s, b) => s + b.correct, 0), 4);
  const q = scored.questions[0];
  assert.equal(q.answer, KEY[q.id]);
  assert.match(q.explanation, /EXPLAIN-SECRET/);
  assert.match(q.proofQuote, /PROOF-SECRET/);
  assert.equal(q.proofClauseNo, `${q.clauseNo}.1`);
  assert.equal(Object.keys(q.optionNotes).length, 3);
  assert.equal(q.marked, true);
  assert.equal(q.seconds, 15);
});

await test("submit is idempotent: a second submit returns the stored result unchanged; save after submit is 409", async () => {
  advance(50);
  const again = await svc.submit(ALICE, scored.id, { action: "submit", responses: {} });
  assert.deepEqual(again, scored);
  assert.deepEqual(await svc.get(ALICE, scored.id), scored);
  await rejectsWith(svc.save(ALICE, scored.id, { action: "save", responses: {} }), 409, /already been submitted/);
});

// ---------------------------------------------------------------- validation
await test("validation: count, scope, time limit, not enough questions; count above available is capped", async () => {
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 4 }), 400, /5 to 60/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 61 }), 400, /5 to 60/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 7.5 }), 400, /5 to 60/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: "10" }), 400, /5 to 60/);
  await rejectsWith(svc.start(ALICE, STD, { scope: { kind: "chapter" }, count: 5 }), 400, /scope kind/);
  await rejectsWith(svc.start(ALICE, STD, { count: 5 }), 400, /scope/);
  await rejectsWith(svc.start(ALICE, STD, { scope: { kind: "section", section: "9" }, count: 5 }), 400, /4 to 8/);
  await rejectsWith(svc.start(ALICE, STD, { scope: { kind: "clause", clauseNo: "9.9" }, count: 5 }), 400, /No such clause/);
  await rejectsWith(svc.start(ALICE, STD, { scope: { kind: "clause", clauseNo: "4.2" }, count: 5 }), 400, /Not enough verified questions yet/);
  await rejectsWith(svc.start(ALICE, STD, { scope: { kind: "section", section: "5" }, count: 5 }), 400, /Not enough verified questions yet/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 5, limitSeconds: 59 }), 400, /1 minute and 4 hours/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 5, limitSeconds: 4 * 3600 + 1 }), 400, /1 minute and 4 hours/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 5, secondsPerQuestion: 10 }), 400, /1 minute and 4 hours/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 5, secondsPerQuestion: 60, limitSeconds: 300 }), 400, /either/);
  await rejectsWith(svc.start(ALICE, STD, { scope: allScope, count: 5, limitSeconds: "300" }), 400, /whole number/);
  const capped = await svc.start(ALICE, STD, { scope: { kind: "section", section: "4" }, count: 20 });
  assert.equal(capped.questions.length, 9, "capped to the 9 available");
  assert.equal(capped.limitSeconds, 9 * 60, "default 60 s per question, on the capped count");
  await svc.submit(ALICE, capped.id, { action: "submit", responses: {} });
  await rejectsWith(svc.submit(ALICE, "../../etc", { action: "submit" }), 404);
});

// ---------------------------------------------------------------- ownership
await test("ownership: another learner gets 404 for the standard and for every attempt action", async () => {
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 5 });
  await rejectsWith(svc.overview(BOB, STD), 404, /No such standard/);
  await rejectsWith(svc.start(BOB, STD, { scope: allScope, count: 5 }), 404, /No such standard/);
  await rejectsWith(svc.get(BOB, a.id), 404, /No such test/);
  await rejectsWith(svc.save(BOB, a.id, { action: "save", responses: {} }), 404, /No such test/);
  await rejectsWith(svc.submit(BOB, a.id, { action: "submit", responses: {} }), 404, /No such test/);
  await rejectsWith(svc.get(BOB, "sqa_doesnotexist0000"), 404, /No such test/);
  // Bob's own copy is separate and empty of Alice's history.
  assert.deepEqual((await svc.overview(BOB, BOB_STD)).history, []);
  await rejectsWith(svc.overview(ALICE, BOB_STD), 404);
  await svc.submit(ALICE, a.id, { action: "submit", responses: {} });
});

// ---------------------------------------------------------------- history
await test("history: newest first, at most 10, with scores; bestPercent is the best finished score", async () => {
  const o = await svc.overview(ALICE, STD);
  const count = (await db.prepare("SELECT COUNT(*) AS n FROM standard_quiz_attempts WHERE user_id = ?").get(ALICE)).n;
  assert.ok(count > 10, `fixture has ${count} attempts`);
  assert.equal(o.history.length, 10);
  const starts = o.history.map((h) => h.startedAt);
  assert.deepEqual(starts, [...starts].sort().reverse());
  for (const h of o.history) {
    assert.ok(h.submittedAt, "all finished");
    assert.equal(typeof h.correct, "number");
    assert.ok(h.total >= 5);
  }
  // Earlier: "submit within grace" scored 5/5 = 100 %.
  assert.equal(o.bestPercent, 100);
  assert.equal(o.active, null);
  assert.ok(o.history.some((h) => h.scopeLabel === "Clause 4 – General rules"));
});

// ---------------------------------------------------------------- stale questions
await test("stale questions: a changed clause hides its questions from counts and from selection", async () => {
  await R.importStandard({ ownerUserId: ALICE, code: "PRETEND 1", title: "Pretend Workshop Standard", sourceName: "invented.txt", units: unitsFor({ "6.2": { body: "Hammers shall be counted every morning." } }) });
  const o = await svc.overview(ALICE, STD);
  assert.equal(o.available.total, TOTAL - PER_UNIT["6.2"]);
  assert.equal(o.available.byClause["6.2"], undefined);
  assert.equal(o.available.bySection["6"], PER_UNIT["6.1"]);
  const a = await svc.start(ALICE, STD, { scope: allScope, count: 60 });
  assert.equal(a.questions.length, TOTAL - PER_UNIT["6.2"]);
  assert.ok(!a.questions.some((q) => q.clauseNo === "6.2"));
  await svc.submit(ALICE, a.id, { action: "submit", responses: {} });
  const everShown = (await db.prepare("SELECT question_ids FROM standard_quiz_attempts").all()).flatMap((r) => JSON.parse(r.question_ids));
  assert.ok(!everShown.some((id) => /^sq_(review|stale)_/.test(id)), "needs_review and stale-fingerprint questions never selected");
});

// ---------------------------------------------------------------- route handlers (real clock, Carol's own standard)
const { token } = await SessionRepository.create(CAROL);
const COOKIE = `score_recovery_session=${encodeURIComponent(token)}`;
const { token: bobToken } = await SessionRepository.create(BOB);
const BOB_COOKIE = `score_recovery_session=${encodeURIComponent(bobToken)}`;
function request(url, { cookie = COOKIE, method = "GET", body, origin } = {}) {
  const headers = { host: "localhost" };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
async function call(handler, url, opts, params) {
  const res = await handler(request(url, opts), { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

await test("routes: overview shape, 201 start, 409 body has activeAttemptId, save, submit, no-store", async () => {
  const ov = await call(quizRoute.GET, `/api/standards/${CAROL_STD}/quiz`, {}, { id: CAROL_STD });
  assert.equal(ov.status, 200);
  assert.deepEqual(Object.keys(ov.body).sort(), ["active", "available", "bestPercent", "history"]);
  assert.deepEqual(Object.keys(ov.body.available).sort(), ["byClause", "bySection", "total"]);
  assert.match(ov.headers.get("cache-control"), /no-store/);
  const start = await call(quizRoute.POST, `/api/standards/${CAROL_STD}/quiz`, { method: "POST", body: { scope: { kind: "all" }, count: 5 }, origin: "http://localhost" }, { id: CAROL_STD });
  assert.equal(start.status, 201);
  for (const s of SECRETS) assert.ok(!JSON.stringify(start.body).includes(s));
  const dup = await call(quizRoute.POST, `/api/standards/${CAROL_STD}/quiz`, { method: "POST", body: { scope: { kind: "all" }, count: 5 } }, { id: CAROL_STD });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.activeAttemptId, start.body.id);
  assert.match(dup.body.error, /still running/);
  const id = start.body.id;
  const q = start.body.questions[0];
  const save = await call(attemptRoute.POST, `/api/standards/quiz/attempt/${id}`, { method: "POST", body: { action: "save", responses: { [q.id]: { answer: "A", marked: false, seconds: 2 } } } }, { attemptId: id });
  assert.equal(save.status, 200);
  assert.equal(save.body.saved, true);
  const got = await call(attemptRoute.GET, `/api/standards/quiz/attempt/${id}`, {}, { attemptId: id });
  assert.equal(got.body.responses[q.id].answer, "A");
  const bad = await call(attemptRoute.POST, `/api/standards/quiz/attempt/${id}`, { method: "POST", body: { action: "explode" } }, { attemptId: id });
  assert.equal(bad.status, 400);
  const sub = await call(attemptRoute.POST, `/api/standards/quiz/attempt/${id}`, { method: "POST", body: { action: "submit", responses: { [q.id]: { answer: "A", marked: false, seconds: 2 } } } }, { attemptId: id });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.total, 5);
  assert.ok(sub.body.questions[0].proofQuote);
});

await test("routes: 401 signed out, 403 cross-site, 404 for another learner, 413 for an oversized body", async () => {
  const anon = await call(quizRoute.GET, `/api/standards/${CAROL_STD}/quiz`, { cookie: null }, { id: CAROL_STD });
  assert.equal(anon.status, 401);
  const cross = await call(quizRoute.POST, `/api/standards/${CAROL_STD}/quiz`, { method: "POST", body: { scope: { kind: "all" }, count: 5 }, origin: "https://evil.example" }, { id: CAROL_STD });
  assert.equal(cross.status, 403);
  const start = await call(quizRoute.POST, `/api/standards/${CAROL_STD}/quiz`, { method: "POST", body: { scope: { kind: "all" }, count: 5 } }, { id: CAROL_STD });
  assert.equal(start.status, 201);
  const id = start.body.id;
  const bobGet = await call(attemptRoute.GET, `/api/standards/quiz/attempt/${id}`, { cookie: BOB_COOKIE }, { attemptId: id });
  assert.equal(bobGet.status, 404);
  const bobOverview = await call(quizRoute.GET, `/api/standards/${CAROL_STD}/quiz`, { cookie: BOB_COOKIE }, { id: CAROL_STD });
  assert.equal(bobOverview.status, 404);
  const huge = JSON.stringify({ action: "save", responses: {}, pad: "x".repeat(70 * 1024) });
  const tooBig = await call(attemptRoute.POST, `/api/standards/quiz/attempt/${id}`, { method: "POST", body: huge }, { attemptId: id });
  assert.equal(tooBig.status, 413);
  const xsSubmit = await call(attemptRoute.POST, `/api/standards/quiz/attempt/${id}`, { method: "POST", body: { action: "submit" }, origin: "https://evil.example" }, { attemptId: id });
  assert.equal(xsSubmit.status, 403);
  const done = await call(attemptRoute.POST, `/api/standards/quiz/attempt/${id}`, { method: "POST", body: { action: "submit" } }, { attemptId: id });
  assert.equal(done.status, 200);
  assert.equal(done.body.skipped, 5);
});

// Throwaway fixtures: deleting the users cascades to their standards, questions and attempts.
for (const u of [ALICE, BOB, CAROL]) await db.prepare("DELETE FROM users WHERE id = ?").run(u);
fs.rmSync(temp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Failed: ${failures.join("; ")}`);
  process.exit(1);
}
