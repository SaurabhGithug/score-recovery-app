// Standards study: parser (real IS/ISO/IEC 17025 PDF), repository and AI tutor. Isolated fixtures
// only: a fresh temp SQLite database, and Gemini replaced by a fake. Never calls a model.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "standards-test-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(temp, "data");

const { parseStandard } = await import("../src/lib/server/standards/parse.ts");
const { StandardsRepository: R } = await import("../src/lib/server/standards/repo.ts");
const { clauseLesson, storedLessons, askStandard, askCheck, waitForStandardChecks } = await import("../src/lib/server/standards/tutor.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`✗ ${name}\n    ${String(err.message).split("\n")[0]}`);
  }
}
async function rejectsWith(promise, status, pattern) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected HTTP ${status}, got ${err.status}: ${err.message}`);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

// ---------------------------------------------------------------- parser
const PDF = "/Users/saurabh/Desktop/Antigravity/Office/IOE17025.pdf";
let units = null;
if (fs.existsSync(PDF)) {
  const text = execFileSync("pdftotext", ["-layout", PDF, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  units = parseStandard(text);
} else {
  console.log(`- skipped real-PDF parser tests: ${PDF} not found`);
}

if (units) {
  const by = new Map(units.map((u) => [u.clauseNo, u]));
  await test("parser: 65 units with the expected clause numbers", () => {
    assert.equal(units.length, 65, `got ${units.length}`);
    for (const no of ["NF", "intro", "1", "3.6", "4.1", "7.2.1", "7.8.6", "8.9", "A", "A.2", "B"]) assert.ok(by.has(no), `missing unit ${no}`);
    assert.equal(new Set(units.map((u) => u.clauseNo)).size, units.length, "clause numbers unique");
    assert.deepEqual(units.map((u) => u.ord), units.map((_, i) => i));
  });
  await test("parser: 3.6 is the term 'laboratory'; 4.1 is on page 9; 3.6 body has 'testing;'", () => {
    assert.equal(by.get("3.6").title, "laboratory");
    assert.equal(by.get("4.1").page, 9);
    assert.match(by.get("3.6").body, /testing;/);
  });
  await test("parser: '5.2' is a requirement line inside clause 5, not a unit", () => {
    assert.equal(by.has("5.2"), false);
    assert.match(by.get("5").body, /(^|\n)5\.2 /);
  });
  await test("parser: no page furniture or Bibliography in any body", () => {
    const dirty = units.filter((u) => /All rights reserved/i.test(u.body)).map((u) => u.clauseNo);
    assert.deepEqual(dirty, [], `bodies containing "All rights reserved": ${dirty.join(", ")}`);
    const last = units[units.length - 1];
    assert.doesNotMatch(units.map((u) => u.body).join("\n"), /Bibliography/);
    assert.ok(last.clauseNo === "B" || /^B\./.test(last.clauseNo), `last unit is ${last.clauseNo}`);
  });
}
await test("parser: text without a Contents page throws", () => {
  assert.throws(() => parseStandard("NATIONAL FOREWORD\nSome text\n\f1 Scope\nThe lab shall do things.\n"), /table of contents/i);
});

// ---------------------------------------------------------------- fixtures
const db = getDatabase();
const addUser = (id) => db.prepare("INSERT INTO users (id, name, normalized_name) VALUES (?, ?, ?)").run(id, id, id);
const ALICE = "usr_alice";
const BOB = "usr_bob";
addUser(ALICE);
addUser(BOB);

const U = (clauseNo, title, body, page = 1, parentNo = null) => ({ clauseNo, parentNo, title, body, page, ord: 0 });
const unitsA = () => [
  U("NF", "National Foreword (BIS)", "This standard was adopted by BIS.", 1),
  U("4", "General requirements", "", 9),
  U("4.1", "Impartiality", "4.1.1 Laboratory activities shall be undertaken impartially.", 9, "4"),
  U("3.6", "laboratory", "body that performs one or more of the following activities: testing;", 8),
].map((u, ord) => ({ ...u, ord }));

// ---------------------------------------------------------------- repository
const imp = (owner, units, code = "TEST 17025") => R.importStandard({ ownerUserId: owner, code, title: "Test standard", sourceName: "fixture.pdf", units });
let stdId;

await test("repo: import, then identical re-import keeps id and lessons (changed:false)", async () => {
  const first = await imp(ALICE, unitsA());
  assert.equal(first.changed, true);
  stdId = first.id;
  assert.match(stdId, /^std_[0-9a-f]{16}$/);
  await R.saveLesson(stdId, { clause_no: "4.1", content_fp: "fp", lesson: "L", model: "m", grounded: 0, sources: "[]", search_html: null, created_at: "2026-01-01T00:00:00.000Z" });
  const again = await imp(ALICE, unitsA());
  assert.deepEqual(again, { id: stdId, changed: false });
  assert.equal((await R.lessons(stdId)).length, 1);
  assert.equal((await R.clauses(stdId)).length, 4);
});

await test("repo: changed body replaces clauses and deletes lessons (changed:true, same id)", async () => {
  const edited = unitsA();
  edited[2] = { ...edited[2], body: "4.1.1 Different text." };
  const res = await imp(ALICE, edited);
  assert.equal(res.changed, true);
  assert.equal(res.id, stdId);
  assert.equal((await R.lessons(stdId)).length, 0);
  assert.match((await R.clauses(stdId)).find((c) => c.clause_no === "4.1").body, /Different text/);
  const restored = await imp(ALICE, unitsA());
  assert.equal(restored.changed, true);
});

await test("repo: owner isolation", async () => {
  assert.ok(await R.find(stdId, ALICE));
  assert.equal(await R.find(stdId, BOB), undefined);
  assert.equal((await R.listForUser(BOB)).length, 0);
  const list = await R.listForUser(ALICE);
  assert.equal(list.length, 1);
  assert.equal(list[0].clauses, 4);
});

// ---------------------------------------------------------------- tutor
const CHECK_JSON = JSON.stringify({ verdict: "consistent", issues: [], keyConcern: false });
function fakeGemini() {
  const calls = [];
  const fn = async (_key, request) => {
    calls.push(request);
    return {
      text: request.json ? CHECK_JSON : `Lesson text ${calls.length}`,
      finishReason: "STOP",
      usage: { promptTokens: 100, outputTokens: 100, searchQueries: 1 },
      grounded: true,
      sources: [{ title: "NABL", uri: "https://nabl-india.org" }],
      searchEntryPointHtml: "<div></div>",
      usageKnown: true,
    };
  };
  fn.calls = calls;
  return fn;
}
const mkDeps = (gemini = fakeGemini()) => ({ provider: "google", googleKey: "k", geminiModel: "gemini-test", deepseek: null, deepseekModel: "ds", geminiCheckModel: "check-model", capUsd: 5, gemini, fetchImage: async () => null });
const promptOf = (req) => req.turns.map((t) => t.text).join("\n");

// Use a distinct standard for tutor tests (the lessons above are gone).
const tutorId = (await imp(ALICE, unitsA(), "TUTOR 17025")).id;

await test("tutor: lesson prompt carries the full standard and the focus clause; result is cached", async () => {
  const gemini = fakeGemini();
  const deps = mkDeps(gemini);
  const lesson = await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4.1" }, deps);
  assert.equal(gemini.calls.length, 1);
  const prompt = promptOf(gemini.calls[0]);
  assert.match(prompt, /=== FULL TEXT OF TUTOR 17025/);
  assert.match(prompt, /TEACH THIS CLAUSE: 4\.1 Impartiality/);
  assert.match(prompt, /undertaken impartially/);
  assert.match(prompt, /testing;/, "other clauses are included too");
  assert.equal(gemini.calls[0].grounded, true);
  assert.equal(lesson.text, "Lesson text 1");
  assert.equal(lesson.grounded, true);
  assert.equal(lesson.sources[0].uri, "https://nabl-india.org");

  await waitForStandardChecks();
  const calls = gemini.calls.length;
  const again = await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4.1" }, deps);
  assert.equal(gemini.calls.length, calls, "cached: no new Gemini call");
  assert.equal(again.text, lesson.text);
  assert.equal(again.check.status, "done");
});

await test("tutor: background check stores the verdict; storedLessons shows check done", async () => {
  await waitForStandardChecks();
  const stored = await storedLessons(ALICE, tutorId, "en");
  assert.deepEqual(Object.keys(stored), ["4.1"]);
  assert.equal(stored["4.1"].check.status, "done");
  assert.equal(stored["4.1"].check.verdict, "consistent");
  assert.equal(stored["4.1"].check.checkedBy, "check-model");
});

await test("tutor: regenerate:true calls Gemini again and replaces the lesson", async () => {
  const gemini = fakeGemini();
  const deps = mkDeps(gemini);
  const lesson = await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4.1", regenerate: true }, deps);
  assert.equal(gemini.calls.filter((c) => !c.json).length, 1);
  assert.equal(lesson.text, "Lesson text 1");
  await waitForStandardChecks();
  assert.equal((await storedLessons(ALICE, tutorId, "en"))["4.1"].check.status, "done");
});

await test("tutor: a heading clause lists its sub-clauses; defined terms get a definition hint", async () => {
  const gemini = fakeGemini();
  await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4" }, mkDeps(gemini));
  assert.match(promptOf(gemini.calls[0]), /- 4\.1 Impartiality/);
  await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "3.6" }, mkDeps(gemini));
  assert.match(promptOf(gemini.calls.filter((c) => !c.json)[1]), /defined term/);
  await waitForStandardChecks();
});

await test("tutor: Hindi lessons are cached separately from English", async () => {
  const gemini = fakeGemini();
  const deps = mkDeps(gemini);
  const hi = await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4.1", lang: "hi" }, deps);
  assert.equal(gemini.calls.filter((c) => !c.json).length, 1, "hi was generated, not served from the en cache");
  assert.match(promptOf(gemini.calls[0]), /Hindi/);
  await clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4.1", lang: "hi" }, deps);
  assert.equal(gemini.calls.filter((c) => !c.json).length, 1, "second hi call cached");
  await waitForStandardChecks();
  assert.ok((await storedLessons(ALICE, tutorId, "hi"))["4.1"]);
  assert.equal(hi.clauseNo, "4.1");
});

await test("tutor: another user and unknown ids/clauses get 404", async () => {
  const deps = mkDeps();
  await rejectsWith(clauseLesson(BOB, { standardId: tutorId, clauseNo: "4.1" }, deps), 404);
  await rejectsWith(storedLessons(BOB, tutorId, "en"), 404);
  await rejectsWith(clauseLesson(ALICE, { standardId: tutorId, clauseNo: "99.9" }, deps), 404);
  await rejectsWith(clauseLesson(ALICE, { standardId: "std_0000000000000000", clauseNo: "4.1" }, deps), 404);
  await rejectsWith(clauseLesson(ALICE, { standardId: "nonsense", clauseNo: "4.1" }, deps), 404);
  await rejectsWith(askStandard(BOB, { standardId: tutorId, message: "hi" }, deps), 404);
});

await test("tutor: askStandard sends the standard, the question and history; returns a check id", async () => {
  const gemini = fakeGemini();
  const deps = mkDeps(gemini);
  const history = [{ role: "user", text: "Earlier Q" }, { role: "model", text: "Earlier A" }];
  const ans = await askStandard(ALICE, { standardId: tutorId, message: "  What is impartiality?  ", history, clauseNo: "4.1" }, deps);
  const req = gemini.calls[0];
  assert.equal(req.turns.length, 3);
  assert.match(req.turns[0].text, /=== FULL TEXT OF TUTOR 17025/);
  assert.match(req.turns[0].text, /currently reading: 4\.1 Impartiality/);
  assert.match(req.turns[0].text, /Earlier Q/);
  assert.equal(req.turns[2].text, "What is impartiality?");
  assert.equal(ans.aiGenerated, true);
  assert.equal(ans.check.status, "pending");
  assert.match(ans.check.id, /^schk_[0-9a-f]{24}$/);
  assert.ok(["pending", "done"].includes((await askCheck(ALICE, ans.check.id)).status));
  await waitForStandardChecks();
  // Stored in the database, so a poll that reaches another server instance still finds it.
  const done = await askCheck(ALICE, ans.check.id);
  assert.equal(done.status, "done");
  assert.equal(done.verdict, "consistent");
  await assert.rejects(() => askCheck(BOB, ans.check.id), (e) => e.status === 404);
  await assert.rejects(() => askCheck(ALICE, "schk_nope"), (e) => e.status === 404);
  await assert.rejects(() => askCheck(ALICE, undefined), (e) => e.status === 404);
});

await test("tutor: askStandard validates message and history (400)", async () => {
  const gemini = fakeGemini();
  const deps = mkDeps(gemini);
  const base = { standardId: tutorId };
  await rejectsWith(askStandard(ALICE, { ...base, message: "" }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "   " }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: 5 }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "x".repeat(1501) }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "q", history: "nope" }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "q", history: [{ role: "model", text: "a" }, { role: "user", text: "b" }] }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "q", history: [{ role: "user", text: "a" }] }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "q", history: [{ role: "user", text: "a" }, { role: "user", text: "b" }] }, deps), 400);
  await rejectsWith(askStandard(ALICE, { ...base, message: "q", history: [{ role: "user", text: "" }, { role: "model", text: "b" }] }, deps), 400);
  assert.equal(gemini.calls.length, 0, "validation happens before any model call");
  const ok = await askStandard(ALICE, { ...base, message: "x".repeat(1500) }, deps);
  assert.ok(ok.answer);
  await waitForStandardChecks();
});

await test("tutor: no Google key gives 503", async () => {
  const deps = { ...mkDeps(), googleKey: "" };
  await rejectsWith(clauseLesson(ALICE, { standardId: tutorId, clauseNo: "4", lang: "hi", regenerate: true }, deps), 503);
  await rejectsWith(askStandard(ALICE, { standardId: tutorId, message: "q" }, deps), 503);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
fs.rmSync(temp, { recursive: true, force: true });
if (failures.length) process.exit(1);
