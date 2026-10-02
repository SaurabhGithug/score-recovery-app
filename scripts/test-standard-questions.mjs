// Standard MCQ bank: gates, blind check, spend, shuffle, export/import. Isolated fixtures only: a
// fresh temp SQLite database, an INVENTED standard (never the real BIS text), and fake Gemini and
// DeepSeek. Never calls a model.  Run: npx tsx scripts/test-standard-questions.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "standard-questions-test-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(temp, "data");
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const { getDatabase } = await import("../src/lib/server/db.ts");
const { StandardsRepository } = await import("../src/lib/server/standards/repo.ts");
const { QuizRepository, clauseFingerprint } = await import("../src/lib/server/standards/quiz-repo.ts");
const { GeminiError } = await import("../src/lib/server/followup/gemini.ts");
const { LlmError } = await import("../src/lib/server/llm/types.ts");
const { geminiCostUsd } = await import("../src/lib/server/followup/followup.ts");
const gates = await import("../src/lib/server/standards/questions/gates.ts");
const text = await import("../src/lib/server/standards/questions/text.ts");
const { planUnits, quotaFor } = await import("../src/lib/server/standards/questions/units.ts");
const { shuffleQuestion, emptyCounts } = await import("../src/lib/server/standards/questions/shuffle.ts");
const { GENERATION_SYSTEM, CHECK_SYSTEM } = await import("../src/lib/server/standards/questions/prompts.ts");
const { generateStandardQuestions, exportQuestions, parseVerdict } = await import("../src/lib/server/standards/questions/generate.ts");
const { importQuestionFile } = await import("../src/lib/server/standards/questions/import.ts");

const db = getDatabase();
assert.equal(db.dialect, "sqlite", "tests must run on SQLite");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`✗ ${name}\n    ${String(err?.message ?? err).split("\n").filter((l) => l.trim()).slice(0, 6).join("\n    ")}`);
  }
}

// ---------------------------------------------------------------- invented standard
const USER = "usr_tester";
db.prepare("INSERT INTO users (id, name, normalized_name) VALUES (?, ?, ?)").run(USER, USER, USER);
const CODE = "WIDGET 99";
const BODY_41 = [
  "4.1.1 The laboratory shall calibrate each widget every 15 days and shall record the result of each calibration.",
  "4.1.2 Calibration records should be retained for at least seven years, unless a customer agrees to a shorter period.",
  "4.1.3 The laboratory manager shall be responsible for approving the calibration interval and shall review it when a widget fails a check.",
  "NOTE A widget that fails a check can be withdrawn from service until it is recalibrated by a “competent” person — for example the supplier.",
].join("\n\n");
const units = (body41 = BODY_41) =>
  [
    { clauseNo: "NF", parentNo: null, title: "National Foreword", body: "This invented foreword explains how the widget standard was adopted and must never be quizzed by the generator.".repeat(3) },
    { clauseNo: "1", parentNo: null, title: "Scope", body: "This document specifies requirements for laboratories that calibrate widgets. It applies to every organization that performs widget calibration, whatever the number of its personnel. Customers of a laboratory can use this document to confirm the competence of that laboratory, and so can regulators." },
    { clauseNo: "3.1", parentNo: "3", title: "widget", body: "device used by a laboratory to hold samples at a fixed temperature during testing" },
    { clauseNo: "4", parentNo: null, title: "Widget requirements", body: "" },
    { clauseNo: "4.1", parentNo: "4", title: "Widget calibration", body: body41 },
    { clauseNo: "4.2", parentNo: "4", title: "Widget list", body: "4.2.1 The laboratory shall keep a list of widgets." },
  ].map((u, ord) => ({ ...u, page: 1, ord }));
const imported = await StandardsRepository.importStandard({ ownerUserId: USER, code: CODE, title: "Invented widget standard", sourceName: "fixture", units: units() });
const STD = imported.id;
const clauses = async () => StandardsRepository.clauses(STD);
const unit41 = async () => (await clauses()).find((c) => c.clause_no === "4.1");

// ---------------------------------------------------------------- question fixtures (model output shape)
const note = (s) => s;
const Q = {
  interval: {
    stem: "How often must a laboratory calibrate each widget under the widget standard?",
    options: { A: "Every 15 days", B: "Every 51 days", C: "Every 30 days", D: "Only after a widget fails a check" },
    answer: "A",
    explanation: "4.1.1 fixes the interval at 15 days. A fixed interval keeps widgets from drifting unnoticed between calibrations.",
    optionNotes: { B: note("4.1.1 says 15 days, not 51."), C: note("4.1.1 sets 15 days; 30 days is not in the text."), D: note("4.1.3 makes a failed check a reason to review the interval, not the only trigger.") },
    proofQuote: "The laboratory shall calibrate each widget every 15 days",
    proofClauseNo: "4.1.1",
    difficulty: 1,
    level: "recall",
  },
  approver: {
    stem: "Who is responsible for approving the calibration interval for widgets?",
    options: { A: "The customer", B: "The laboratory manager", C: "The calibration technician", D: "The accreditation body" },
    answer: "B",
    explanation: "4.1.3 gives this responsibility to the laboratory manager. In practice: a named owner keeps the interval from being changed informally.",
    optionNotes: { A: "4.1.3 does not give the customer this role.", C: "4.1.3 names the laboratory manager, not the technician.", D: "4.1.3 assigns it inside the laboratory." },
    proofQuote: "The laboratory manager shall be responsible for approving the calibration interval",
    proofClauseNo: "4.1.3",
    difficulty: 2,
    level: "understanding",
  },
  retention: {
    stem: "What status does the seven-year retention of calibration records have in the widget standard?",
    options: { A: "A recommendation", B: "A requirement", C: "A permission", D: "A possibility" },
    answer: "A",
    explanation: "4.1.2 uses 'should', which makes the retention period a recommendation.",
    optionNotes: { B: "4.1.2 says 'should', not 'shall'.", C: "4.1.2 does not use 'may'.", D: "4.1.2 does not use 'can'." },
    proofQuote: "Calibration records should be retained for at least seven years",
    proofClauseNo: "4.1.2",
    difficulty: 2,
    level: "recall",
  },
  failed: {
    stem: "A widget fails a check on Monday. What must the laboratory do about its calibration interval?",
    options: { A: "Review the calibration interval", B: "Scrap the widget permanently", C: "Tell the accreditation body within 15 days", D: "Stop all testing in the laboratory" },
    answer: "A",
    explanation: "4.1.3 requires the interval to be reviewed when a widget fails a check, so the interval reflects real performance.",
    optionNotes: { B: "4.1.3 asks for a review; the NOTE only says the widget can be withdrawn.", C: "4.1.3 sets no notification to an accreditation body.", D: "4.1.3 concerns the interval, not all testing." },
    proofQuote: "shall review it when a widget fails a check",
    proofClauseNo: "4.1.3",
    difficulty: 2,
    level: "application",
  },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const variant = (base, patch) => ({ ...clone(base), ...patch });
const BAD = {
  fabricated: variant(Q.interval, { stem: "Which reference must be used when calibrating widgets each day?", proofQuote: "The laboratory shall calibrate widgets daily using certified weights" }),
  changedWord: variant(Q.retention, { stem: "How long are calibration records kept under the widget standard?", options: { A: "At least seven years", B: "At least five years", C: "At least one year", D: "Until the next audit" }, proofQuote: "Calibration records shall be retained for at least seven years" }),
  changedNumber: variant(Q.interval, { stem: "What is the widget calibration interval?", proofQuote: "The laboratory shall calibrate each widget every 51 days" }),
  letterRef: variant(Q.approver, { stem: "Which person approves widget calibration intervals?", explanation: "Option B is right because 4.1.3 names the laboratory manager." }),
  duplicate: clone(Q.interval),
};

/** The checker's planned behaviour per stem: agree | disagree | none | error | malformed. */
let plan = {};
const keyOf = new Map();
function stemOf(user) {
  return user.split("QUESTION:\n")[1].split("\n")[0];
}
function verdict(stem) {
  const mode = plan[stem] ?? "agree";
  const key = keyOf.get(stem);
  if (mode === "error") throw new Error("planned checker failure");
  if (mode === "malformed") return { answer: "maybe", reason: "?" };
  if (mode === "none") return { answer: "NONE", reason: "4.1.2 makes it a recommendation, which the options do not separate." };
  if (mode === "disagree") return { answer: key === "C" ? "D" : "C", reason: "4.1.3 points elsewhere." };
  return { answer: key, reason: "4.1 says so." };
}

let generated = [];
const calls = { generation: 0, geminiCheck: 0, deepseek: 0 };
let reservedDuringCall = [];
const GEN_USAGE = { promptTokens: 1000, outputTokens: 2000, searchQueries: 0 };
function fakeGemini({ checkMode = "plan", genUsage = GEN_USAGE } = {}) {
  return async (_key, request) => {
    reservedDuringCall.push(await db.prepare("SELECT cost_usd FROM llm_spend ORDER BY rowid DESC LIMIT 1").get());
    if (request.system === GENERATION_SYSTEM) {
      calls.generation++;
      for (const q of generated) keyOf.set(q.stem, q.answer);
      return { text: JSON.stringify({ questions: generated }), finishReason: "STOP", usage: genUsage, grounded: false, sources: [], searchEntryPointHtml: null, usageKnown: true };
    }
    assert.equal(request.system, CHECK_SYSTEM);
    calls.geminiCheck++;
    if (checkMode === "error") throw new GeminiError("Google is down", 500);
    const stem = stemOf(request.turns[0].text);
    return { text: JSON.stringify(verdict(stem)), finishReason: "STOP", usage: { promptTokens: 500, outputTokens: 200, searchQueries: 0 }, grounded: false, sources: [], searchEntryPointHtml: null, usageKnown: true };
  };
}
function fakeDeepSeek({ mode = "plan" } = {}) {
  return {
    name: "deepseek",
    async completeJson(req) {
      calls.deepseek++;
      reservedDuringCall.push(await db.prepare("SELECT cost_usd FROM llm_spend ORDER BY rowid DESC LIMIT 1").get());
      if (mode === "error") throw new LlmError("DeepSeek is down", { retryable: false, usage: null });
      assert.equal(req.system, CHECK_SYSTEM);
      // Blind: the checker never sees the key, the quote or the explanation.
      for (const q of generated) {
        assert.ok(!req.user.includes(q.explanation), "checker saw an explanation");
        assert.ok(!req.user.includes(q.proofQuote) || BODY_41.includes(q.proofQuote), "checker saw a quote that is not in the text");
      }
      assert.doesNotMatch(req.user, /answer|optionNotes/i);
      return { json: verdict(stemOf(req.user)), usage: { promptCacheHitTokens: 0, promptCacheMissTokens: 800, completionTokens: 400, reasoningTokens: 300 }, model: "deepseek-v4-pro", finishReason: "stop" };
    },
  };
}
const mkDeps = (over = {}) => ({
  provider: "google",
  googleKey: "test-key",
  geminiModel: "gemini-3.8-flash",
  deepseek: fakeDeepSeek(),
  deepseekModel: "deepseek-v4-pro",
  geminiCheckModel: "gemini-3.1-pro-preview",
  capUsd: 50,
  gemini: fakeGemini(),
  fetchImage: async () => null,
  ...over,
});
const resetCalls = () => {
  calls.generation = calls.geminiCheck = calls.deepseek = 0;
  reservedDuringCall = [];
};
const run = (over = {}, deps = mkDeps()) => generateStandardQuestions({ userId: USER, code: CODE, target: "sqlite", clauses: ["4.1"], maxUsd: 5, rateLimitWaitMs: 0, ...over }, deps);
const clearQuestions = () => db.prepare("DELETE FROM standard_questions").run();

// ---------------------------------------------------------------- gates (pure)
const draft = (raw) => {
  const r = gates.draftFromModel(raw);
  if (!r.ok) return r;
  return r;
};
const grounded = async (raw) => {
  const d = gates.draftFromModel(raw);
  if (!d.ok) return d;
  const cs = await clauses();
  const { knownClauseNumbers } = await import("../src/lib/server/standards/questions/units.ts");
  return gates.checkAgainstText(d.draft, cs.find((c) => c.clause_no === "4.1"), knownClauseNumbers(cs));
};
const reasonOf = (r) => (r.ok ? "ok" : r.rejection.reason);
const why = (r) => (r.ok ? "ok" : `${r.rejection.reason}: ${r.rejection.detail}`);

await test("gate: good questions pass; stored quote is the body's own text; proof clause located", async () => {
  for (const q of Object.values(Q)) assert.equal(reasonOf(await grounded(q)), "ok", q.stem);
  const r = await grounded(variant(Q.failed, { proofQuote: "SHALL REVIEW IT WHEN A WIDGET FAILS A CHECK", proofClauseNo: "4.1" }));
  assert.equal(r.ok, true);
  assert.equal(r.draft.proofQuote, "shall review it when a widget fails a check", "the body's casing, not the model's");
  assert.equal(r.draft.proofClauseNo, "4.1.3", "the unit number is narrowed to the paragraph the quote is in");
});

await test("gate: fabricated quote rejected", async () => {
  assert.equal(reasonOf(await grounded(BAD.fabricated)), "quote_not_verbatim");
});

await test("gate: one changed word (shall/should) or number (15/51) rejected", async () => {
  let r = await grounded(BAD.changedWord);
  assert.equal(reasonOf(r), "quote_not_verbatim", why(r));
  r = await grounded(BAD.changedNumber);
  assert.equal(reasonOf(r), "quote_not_verbatim", why(r));
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofQuote: "The laboratory shall calibrate each widget every 16 days" }))), "quote_not_verbatim");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofQuote: "The laboratory shall calibrate each widget every 15 day" }))), "quote_not_verbatim", "a quote cut mid-word");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofQuote: "aboratory shall calibrate each widget every 15 days" }))), "quote_not_verbatim", "a quote starting mid-word");
  assert.equal(text.findVerbatim("within 15 days of receipt", "5 days of receipt and").length, 0);
  assert.equal(text.findVerbatim("within 15 days of receipt", "5 days of receipt").length, 0, "5 is not 15");
  assert.equal(text.findVerbatim("within 15 days of receipt.", "15 days of receipt.").length, 1);
});

await test("gate: only whitespace, curly quotes, dashes and case are normalised", async () => {
  const q = variant(Q.failed, { proofQuote: 'until it is recalibrated by a "competent" person - for example the supplier', proofClauseNo: "4.1.3" });
  const r = await grounded(q);
  assert.equal(r.ok, true, reasonOf(r));
  assert.match(r.draft.proofQuote, /“competent” person — for/, "shown quote keeps the body's characters");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofQuote: "The  laboratory\nshall calibrate EACH widget every 15 days" }))), "ok");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofQuote: "The laboratory shall calibrate each widget every 15 days." + " Extra words here" }))), "quote_not_verbatim");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofQuote: "calibrate each widget" }))), "quote_too_short");
});

await test("gate: proof clause must be a paragraph of the unit and hold the quote", async () => {
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofClauseNo: "4.1.9" }))), "proof_clause_invalid");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofClauseNo: "4.1.2" }))), "proof_clause_mismatch");
  assert.equal(reasonOf(await grounded(variant(Q.interval, { proofClauseNo: "Clause 4.1.1" }))), "ok");
});

await test("gate: letter references in explanation or notes rejected; standard names allowed", async () => {
  assert.equal(reasonOf(draft(BAD.letterRef)), "letter_reference");
  const bad = ["The answer is B because 4.1.3 says so.", "(C) is wrong per 4.1.3.", "A and D both ignore 4.1.3.", "Choice D misreads 4.1.1.", "B) ignores 4.1.3."];
  for (const explanation of bad) assert.equal(reasonOf(draft(variant(Q.approver, { explanation }))), "letter_reference", explanation);
  assert.equal(reasonOf(draft(variant(Q.approver, { optionNotes: { ...Q.approver.optionNotes, A: "Unlike option C, 4.1.3 does not name the customer." } }))), "letter_reference");
  const ok = ["Under management system Option A (8.1.2) and Annex A this differs; 4.1.3 names the manager.", "Type A and B evaluations are not involved; 4.1.3 names the manager.", "The key is a named owner, per 4.1.3."];
  for (const explanation of ok) assert.equal(reasonOf(draft(variant(Q.approver, { explanation }))), "ok", explanation);
});

await test("gate: style and shape (banned options, notes, answer in stem, distinct options, invented clause)", async () => {
  assert.equal(reasonOf(draft(variant(Q.approver, { options: { ...Q.approver.options, D: "All of the above" } }))), "banned_option");
  assert.equal(reasonOf(draft(variant(Q.approver, { options: { ...Q.approver.options, D: "the customer." } }))), "options_not_distinct");
  assert.equal(reasonOf(draft(variant(Q.approver, { stem: "Is it the laboratory manager who approves the calibration interval for widgets?" }))), "answer_in_stem");
  assert.equal(reasonOf(draft(variant(Q.approver, { optionNotes: { A: "4.1.3 no.", B: "4.1.3 yes.", C: "4.1.3 no." } }))), "notes_incomplete", "a 'why wrong' note on the key");
  assert.equal(reasonOf(draft(variant(Q.approver, { optionNotes: { ...Q.approver.optionNotes, C: "The technician does not approve it." } }))), "note_without_clause");
  assert.equal(reasonOf(draft(variant(Q.approver, { stem: "According to the passage, who approves the calibration interval?" }))), "document_reference");
  assert.equal(reasonOf(draft(variant(Q.approver, { options: { ...Q.approver.options, B: "The laboratory manager, who is accountable for the interval and its review after failures" } }))), "length_cue");
  assert.equal(reasonOf(draft(variant(Q.approver, { options: { A: "x", B: "y", C: "z" } }))), "shape");
  assert.equal(reasonOf(draft(variant(Q.approver, { answer: "E" }))), "shape");
  assert.equal(reasonOf(draft(variant(Q.approver, { level: "trivia" }))), "shape");
  assert.equal(reasonOf(await grounded(variant(Q.approver, { optionNotes: { ...Q.approver.optionNotes, A: "6.4.14 gives the customer no such role." } }))), "unknown_clause_reference");
});

await test("gate: duplicate stems and duplicate quotes within a unit rejected", () => {
  const a = { stem: "Same stem?", proofQuote: "quote one two three four five" };
  const r = gates.dedupe([a, { ...a, proofQuote: "other quote" }, { stem: "Different stem?", proofQuote: "QUOTE one two three four five" }, { stem: "Third?", proofQuote: "fresh" }]);
  assert.equal(r.kept.length, 2);
  assert.deepEqual(r.rejections.map((x) => x.reason), ["duplicate_stem", "duplicate_quote"]);
});

await test("text: verbatim finder and letter-reference helpers", () => {
  assert.equal(text.findVerbatim("A b—c “d”", 'a  B-C "D"').length, 1);
  assert.equal(text.findVerbatim("shall do it", "should do it").length, 0);
  assert.equal(text.hasLetterReference("Option B ignores 7.8.6"), true);
  assert.equal(text.hasLetterReference("management system Option B (8.1.3) applies"), false);
  assert.equal(text.stemHasLetterReference("A laboratory operating under Option B of clause 8 wants to..."), false);
});

// ---------------------------------------------------------------- units and quotas
await test("units: NF, headings and short non-definitions skipped; definitions kept; quota formula", async () => {
  const p = planUnits(await clauses());
  assert.deepEqual(p.units.map((u) => u.clause.clause_no), ["1", "3.1", "4.1"]);
  assert.deepEqual(p.skipped.map((s) => s.clauseNo), ["NF", "4", "4.2"]);
  assert.equal(quotaFor(100, "3.7"), 2);
  assert.equal(quotaFor(5000, "6.4"), 8);
  assert.equal(quotaFor(5000, "3.8"), 4);
  assert.equal(planUnits(await clauses(), { only: ["4.1", "9.9"] }).unknown[0], "9.9");
  assert.equal(planUnits(await clauses(), { only: ["4.1"], perClause: 6 }).units[0].quota, 6);
});

// ---------------------------------------------------------------- shuffle
await test("shuffle: key stays on the same text, notes follow, letters balance, deterministic", () => {
  const counts = emptyCounts();
  const results = [];
  for (let i = 0; i < 400; i++) {
    const q = { stem: `Question number ${i} about widgets?`, options: [{ id: "A", text: `right ${i}` }, { id: "B", text: `wrong b ${i}` }, { id: "C", text: `wrong c ${i}` }, { id: "D", text: `wrong d ${i}` }], answer: "A", optionNotes: { B: `nb ${i}`, C: `nc ${i}`, D: `nd ${i}` } };
    const s = shuffleQuestion(q, "4.1", counts);
    assert.equal(s.options.find((o) => o.id === s.answer).text, `right ${i}`);
    for (const l of ["b", "c", "d"]) assert.equal(s.optionNotes[s.options.find((o) => o.text === `wrong ${l} ${i}`).id], `n${l} ${i}`);
    assert.equal(s.optionNotes[s.answer], undefined);
    results.push(s.answer);
  }
  for (const l of ["A", "B", "C", "D"]) assert.ok(Math.abs(counts[l] / 400 - 0.25) <= 0.06, `letter ${l}: ${counts[l]}`);
  assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 3);
  let runs = 0;
  for (let i = 4; i < results.length; i += 4) if (new Set(results.slice(i - 4, i)).size === 4) runs++;
  assert.ok(runs < 95, "not a fixed A-B-C-D cycle");
  const q = { stem: "Fixed?", options: [{ id: "A", text: "1" }, { id: "B", text: "2" }, { id: "C", text: "3" }, { id: "D", text: "4" }], answer: "C", optionNotes: { A: "a", B: "b", D: "d" } };
  assert.deepEqual(shuffleQuestion(q, "4.1", emptyCounts()), shuffleQuestion(q, "4.1", emptyCounts()));
});

// ---------------------------------------------------------------- pipeline with fake models
await test("run: gates + blind check; only agreed, other-provider questions stored verified", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval, Q.approver, Q.retention, Q.failed, BAD.fabricated, BAD.changedWord, BAD.changedNumber, BAD.letterRef, BAD.duplicate];
  plan = { [Q.approver.stem]: "disagree", [Q.retention.stem]: "none" };
  const report = await run({ perClause: 4 });
  const u = report.units[0];
  assert.equal(calls.generation, 1);
  assert.equal(u.generated, 9);
  assert.deepEqual(u.rejected, { quote_not_verbatim: 3, letter_reference: 1, duplicate_stem: 1 });
  assert.equal(u.passedGates, 4);
  assert.equal(u.checked, 4);
  assert.equal(calls.deepseek, 4, "every survivor checked by the other provider");
  assert.equal(calls.geminiCheck, 0);
  assert.equal(u.disagreed.length, 1);
  assert.equal(u.disagreed[0].stem, Q.approver.stem);
  assert.match(u.disagreed[0].reason, /4\.1\.3/);
  assert.equal(u.noneAnswers.length, 1);
  assert.equal(u.noneAnswers[0].stem, Q.retention.stem);
  assert.equal(u.verified, 2);
  assert.equal(u.stored, "replaced");
  const stored = await QuizRepository.listVerified(STD, await clauses());
  assert.deepEqual(stored.map((q) => q.stem).sort(), [Q.failed.stem, Q.interval.stem].sort());
  for (const q of stored) {
    assert.equal(q.status, "verified");
    assert.equal(q.checkedBy, "deepseek-v4-pro");
    assert.equal(q.checkIndependence, "other_provider");
    assert.equal(q.generatedBy, "gemini-3.8-flash");
    assert.equal(q.clauseFp, clauseFingerprint(await unit41()));
    const original = q.stem === Q.interval.stem ? Q.interval : Q.failed;
    assert.equal(q.options.find((o) => o.id === q.answer).text, original.options[original.answer], "key points at the generated key's text after the shuffle");
    assert.equal(Object.keys(q.optionNotes).length, 3);
    assert.ok(BODY_41.includes(q.proofQuote));
  }
  assert.equal(report.totals.verified, 2);
  assert.equal(report.bank.verified, 2);
});

await test("run: spend is reserved before each call and settled after", async () => {
  // Every fake call saw its reservation already on the ledger (the newest row, at the worst case).
  assert.ok(reservedDuringCall.length >= 5);
  for (const row of reservedDuringCall) assert.ok(row && row.cost_usd > 0.01, "a worst-case reservation was on the ledger during the call");
  const rows = await db.prepare("SELECT model, cost_usd FROM llm_spend WHERE user_id = ? ORDER BY rowid").all(USER);
  assert.equal(rows.length, 5, "1 generation + 4 checks");
  assert.ok(Math.abs(rows[0].cost_usd - geminiCostUsd("gemini-3.8-flash", GEN_USAGE)) < 1e-9, "generation settled to its billed usage");
  for (const r of rows.slice(1)) assert.ok(r.cost_usd > 0 && r.cost_usd < 0.01, `check settled to actual (${r.cost_usd})`);
});

await test("run: a checker answering NONE or another letter is never stored", async () => {
  const all = await db.prepare("SELECT stem FROM standard_questions").all();
  assert.ok(!all.some((r) => r.stem === Q.approver.stem || r.stem === Q.retention.stem));
});

await test("run: idempotent: a unit with its quota verified is skipped without model calls; --force regenerates", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval, Q.failed];
  plan = {};
  const first = await run({ perClause: 2 });
  assert.equal(first.units[0].verified, 2);
  const ids = (await QuizRepository.listVerified(STD, await clauses())).map((q) => q.id).sort();
  resetCalls();
  const again = await run({ perClause: 2 });
  assert.equal(again.units[0].status, "skipped_enough");
  assert.equal(calls.generation + calls.deepseek + calls.geminiCheck, 0);
  assert.deepEqual((await QuizRepository.listVerified(STD, await clauses())).map((q) => q.id).sort(), ids);
  const forced = await run({ perClause: 2, force: true });
  assert.equal(forced.units[0].stored, "replaced");
  assert.equal(calls.generation, 1);
  assert.deepEqual((await QuizRepository.listVerified(STD, await clauses())).map((q) => q.id).sort(), ids, "same questions keep the same ids");
});

await test("run: a worse rerun (not forced) keeps the old questions", async () => {
  resetCalls();
  generated = [Q.interval, Q.failed];
  plan = { [Q.failed.stem]: "disagree" };
  const r = await run({ perClause: 3 });
  assert.equal(r.units[0].verified, 1);
  assert.equal(r.units[0].stored, "kept_old");
  assert.equal((await QuizRepository.listVerified(STD, await clauses())).length, 2);
});

await test("run: same-vendor checker only (no DeepSeek) -> needs_review, never verified", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval, Q.failed];
  plan = {};
  const r = await run({ perClause: 2 }, mkDeps({ deepseek: null }));
  assert.equal(calls.deepseek, 0);
  assert.equal(calls.geminiCheck, 2);
  assert.equal(r.units[0].verified, 0);
  assert.equal(r.units[0].needsReview, 2);
  assert.equal(r.units[0].stored, "stored_review_only");
  assert.equal((await QuizRepository.listVerified(STD, await clauses())).length, 0, "nothing shown in tests");
  const rows = await db.prepare("SELECT status, check_independence, checked_by FROM standard_questions").all();
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.status, "needs_review");
    assert.equal(row.check_independence, "same_vendor");
    assert.equal(row.checked_by, "gemini-3.1-pro-preview");
  }
  assert.ok(Object.keys(r.checkers).every((k) => k.includes("same_vendor")));
});

await test("run: checker errors never count as agreement", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval, Q.failed];
  plan = {};
  // Every checker fails.
  const r = await run({ perClause: 2 }, mkDeps({ deepseek: fakeDeepSeek({ mode: "error" }), gemini: fakeGemini({ checkMode: "error" }) }));
  assert.equal(r.units[0].checkFailed.length, 2);
  assert.equal(r.units[0].verified + r.units[0].needsReview, 0);
  assert.equal(r.units[0].stored, "nothing");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM standard_questions").get()).n, 0);
  // DeepSeek fails, a Google model agrees: needs_review at most.
  resetCalls();
  const r2 = await run({ perClause: 2 }, mkDeps({ deepseek: fakeDeepSeek({ mode: "error" }) }));
  assert.equal(r2.units[0].verified, 0);
  assert.equal(r2.units[0].needsReview, 2);
  assert.equal((await QuizRepository.listVerified(STD, await clauses())).length, 0);
  // A reply in an unexpected form is a failed check, not agreement.
  clearQuestions();
  plan = { [Q.interval.stem]: "malformed" };
  const r3 = await run({ perClause: 2 });
  assert.equal(r3.units[0].checkFailed.length, 1);
  assert.equal(r3.units[0].verified, 1);
  assert.equal(parseVerdict({ answer: "B." }).answer, "B");
  assert.equal(parseVerdict({ answer: "E" }), null);
  assert.equal(parseVerdict({}), null);
});

await test("run: the run cap stops cleanly before a call it cannot afford", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval, Q.failed];
  plan = {};
  const tiny = await run({ perClause: 2, maxUsd: 0.01 });
  assert.equal(tiny.stopReason, "run_cap");
  assert.equal(calls.generation, 0, "no generation call when its worst case does not fit");
  assert.match(tiny.stopDetail, /run cap/);
  // Enough for the generation, not for the checks: generation billed, nothing verified or stored.
  resetCalls();
  const big = { promptTokens: 1000, outputTokens: 120_000, searchQueries: 0 }; // ~$0.45 at the intro rate
  const deps = mkDeps({ gemini: fakeGemini({ genUsage: big }) });
  const r = await run({ perClause: 2, maxUsd: 0.5 }, deps);
  assert.equal(calls.generation, 1);
  assert.equal(calls.deepseek, 0);
  assert.equal(r.stopReason, "run_cap");
  assert.equal(r.units[0].notChecked, 2);
  assert.ok(r.spendUsd <= 0.5, `spent ${r.spendUsd}`);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM standard_questions").get()).n, 0);
});

await test("run: the daily server limit is respected (reservation refuses)", async () => {
  resetCalls();
  const r = await run({ perClause: 2 }, mkDeps({ capUsd: 0.0001 }));
  assert.ok(r.stopReason === "daily_cap" || r.stopReason === "run_cap");
  assert.equal(calls.generation, 0);
});

await test("run: refuses to write to a database other than --target", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval];
  plan = {};
  await assert.rejects(run({ perClause: 1, target: "postgres" }), /Refusing to write/);
});

await test("run: dry run makes no calls and plans the units", async () => {
  resetCalls();
  const r = await run({ clauses: undefined, dryRun: true });
  assert.equal(calls.generation + calls.deepseek + calls.geminiCheck, 0);
  assert.deepEqual(r.plan.units.map((u) => u.clauseNo), ["1", "3.1", "4.1"]);
  assert.ok(r.estimate.totalUsdPeak > 0);
});

// ---------------------------------------------------------------- export / import
await test("export + import: valid entries imported; tampered, stale and unverified ones skipped with reasons", async () => {
  clearQuestions();
  resetCalls();
  generated = [Q.interval, Q.failed, Q.approver];
  plan = {};
  await run({ perClause: 3 });
  const file = await exportQuestions(USER, CODE);
  assert.equal(file.version, 1);
  assert.equal(file.questions.length, 3);
  assert.ok(file.questions.every((q) => !("id" in q) && !("standardId" in q)));
  const [a, b, c] = file.questions;

  const tamperedQuote = { ...clone(a), stem: `${a.stem} (tampered quote)`, proofQuote: a.proofQuote.replace("15", "51").replace("shall", "should") };
  const keyIdx = b.options.findIndex((o) => o.id === b.answer);
  const tamperedKey = { ...clone(b), stem: `${b.stem} (tampered key)`, answer: b.options[(keyIdx + 1) % 4].id };
  const letterRef = { ...clone(c), stem: `${c.stem} (letter)`, explanation: `The answer is ${c.answer} per 4.1.3.` };
  const review = { ...clone(a), stem: `${a.stem} (review)`, proofQuote: "unless a customer agrees to a shorter period", proofClauseNo: "4.1.2", status: "needs_review", checkIndependence: "same_vendor" };
  const fakeVerified = { ...clone(a), stem: `${a.stem} (fake verified)`, checkIndependence: "same_model" };
  const stale = { ...clone(a), stem: `${a.stem} (stale)`, clauseFp: "0".repeat(32) };
  const unknown = { ...clone(a), clauseNo: "9.9" };
  const threeOptions = { ...clone(b), stem: `${b.stem} (three)`, options: b.options.slice(0, 3) };
  const tampered = { ...file, questions: [...file.questions, tamperedQuote, tamperedKey, letterRef, review, fakeVerified, stale, unknown, threeOptions] };

  clearQuestions();
  const r = await importQuestionFile(USER, tampered, { target: "sqlite" });
  assert.equal(r.imported, 3);
  assert.deepEqual(r.skippedByReason, { quote_not_verbatim: 1, notes_incomplete: 1, letter_reference: 1, status: 1, not_verified: 1, stale: 1, unknown_clause: 1, shape: 1 });
  const stems = (await QuizRepository.listVerified(STD, await clauses())).map((q) => q.stem).sort();
  assert.deepEqual(stems, [a.stem, b.stem, c.stem].sort());

  // Idempotent: the same file again gives the same ids and count.
  const ids = (await QuizRepository.listVerified(STD, await clauses())).map((q) => q.id).sort();
  await importQuestionFile(USER, file, { target: "sqlite" });
  assert.deepEqual((await QuizRepository.listVerified(STD, await clauses())).map((q) => q.id).sort(), ids);

  // --include-review takes needs_review entries (never shown in tests).
  const withReview = await importQuestionFile(USER, { ...file, questions: [...file.questions, review] }, { target: "sqlite", includeReview: true });
  assert.equal(withReview.imported, 4);
  assert.equal((await QuizRepository.listVerified(STD, await clauses())).length, 3);
  await assert.rejects(importQuestionFile(USER, file, { target: "postgres" }), /Refusing to write/);
  await assert.rejects(importQuestionFile(USER, { ...file, version: 2 }, { target: "sqlite" }), /version 1/);
});

await test("import: a changed clause makes the whole file stale; existing questions kept", async () => {
  const file = await exportQuestions(USER, CODE);
  const before = (await db.prepare("SELECT COUNT(*) AS n FROM standard_questions").get()).n;
  await StandardsRepository.importStandard({ ownerUserId: USER, code: CODE, title: "Invented widget standard", sourceName: "fixture", units: units(BODY_41.replace("15 days", "14 days")) });
  const r = await importQuestionFile(USER, file, { target: "sqlite" });
  assert.equal(r.imported, 0);
  assert.equal(r.skippedByReason.stale, file.questions.length);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM standard_questions").get()).n, before, "nothing deleted");
  assert.equal((await QuizRepository.listVerified(STD, await clauses())).length, 0, "old questions are hidden by their fingerprint");
  await StandardsRepository.importStandard({ ownerUserId: USER, code: CODE, title: "Invented widget standard", sourceName: "fixture", units: units() });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
fs.rmSync(temp, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
