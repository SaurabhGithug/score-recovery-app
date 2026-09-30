// Run with: npx tsx scripts/test-answer-key.mjs
// Pure-function tests for the question-bank answer-key resolver (DECISION-002).
import assert from "node:assert/strict";

const { resolveAnswerKey, isScored } = await import("../src/lib/bank/answer-key.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

const OPTIONS = ["A", "B", "C", "D"];
let clock = 0;
function ev(authority, answer, extra = {}) {
  clock++;
  return {
    authority,
    sourceGroup: extra.sourceGroup ?? authority,
    sourceLabel: extra.sourceLabel ?? `${authority}-${clock}`,
    answer,
    dropped: extra.dropped ?? false,
    observedAt: extra.observedAt ?? `2026-09-29T00:00:${String(clock).padStart(2, "0")}Z`,
  };
}

test("no evidence → no_key, unscored", () => {
  const r = resolveAnswerKey([], OPTIONS);
  assert.equal(r.status, "no_key");
  assert.equal(r.answer, null);
  assert.equal(isScored(r.status), false);
});

test("AI alone never supplies a key", () => {
  const r = resolveAnswerKey([ev("ai_blind_solve", "B")], OPTIONS);
  assert.equal(r.status, "no_key");
  assert.equal(r.answer, null);
});

test("one publisher key → single_source, scored", () => {
  const r = resolveAnswerKey([ev("publisher_key", "C", { sourceGroup: "adda247" })], OPTIONS);
  assert.equal(r.status, "single_source");
  assert.equal(r.answer, "C");
  assert.equal(isScored(r.status), true);
});

test("publisher + agreeing AI → ai_checked", () => {
  const r = resolveAnswerKey([ev("publisher_key", "C", { sourceGroup: "adda247" }), ev("ai_blind_solve", "C")], OPTIONS);
  assert.equal(r.status, "ai_checked");
  assert.equal(r.answer, "C");
});

test("publisher + disagreeing AI → disputed, unscored, AI shown as dissent", () => {
  const r = resolveAnswerKey([ev("publisher_key", "C", { sourceGroup: "adda247" }), ev("ai_blind_solve", "A")], OPTIONS);
  assert.equal(r.status, "disputed");
  assert.equal(r.answer, null);
  assert.equal(r.dissent.length, 1);
  assert.equal(r.dissent[0].answer, "A");
});

test("two publishers in the same group are not independent", () => {
  const r = resolveAnswerKey([
    ev("publisher_key", "B", { sourceGroup: "adda247-group", sourceLabel: "Adda247" }),
    ev("publisher_key", "B", { sourceGroup: "adda247-group", sourceLabel: "Career Power" }),
  ], OPTIONS);
  assert.equal(r.status, "single_source");
});

test("publisher + Testbook in different groups agreeing → corroborated", () => {
  const r = resolveAnswerKey([ev("publisher_key", "B", { sourceGroup: "adda247-group" }), ev("testbook_portal", "B", { sourceGroup: "testbook" })], OPTIONS);
  assert.equal(r.status, "corroborated");
  assert.equal(r.answer, "B");
});

test("human sources disagreeing → disputed", () => {
  const r = resolveAnswerKey([ev("publisher_key", "B", { sourceGroup: "adda247-group" }), ev("testbook_portal", "D", { sourceGroup: "testbook" })], OPTIONS);
  assert.equal(r.status, "disputed");
  assert.equal(r.answer, null);
});

test("SSC final key wins over disagreeing publisher and AI; they become dissent", () => {
  const r = resolveAnswerKey([ev("ssc_final", "A"), ev("publisher_key", "B", { sourceGroup: "adda247-group" }), ev("ai_blind_solve", "C")], OPTIONS);
  assert.equal(r.status, "official");
  assert.equal(r.answer, "A");
  assert.deepEqual(r.dissent.map((row) => row.answer).sort(), ["B", "C"]);
});

test("SSC final beats SSC response-sheet ticks", () => {
  const r = resolveAnswerKey([ev("ssc_response_sheet", "B"), ev("ssc_final", "C")], OPTIONS);
  assert.equal(r.status, "official");
  assert.equal(r.answer, "C");
});

test("SSC dropped the question → dropped, unscored", () => {
  const r = resolveAnswerKey([ev("ssc_final", null, { dropped: true }), ev("publisher_key", "B")], OPTIONS);
  assert.equal(r.status, "dropped");
  assert.equal(r.answer, null);
  assert.equal(isScored(r.status), false);
});

test("two SSC final rows disagreeing → disputed (data error surfaced)", () => {
  const r = resolveAnswerKey([ev("ssc_final", "A", { sourceLabel: "x" }), ev("ssc_final", "B", { sourceLabel: "y" })], OPTIONS);
  assert.equal(r.status, "disputed");
});

test("learner review resolves a dispute; latest review wins", () => {
  const r = resolveAnswerKey([
    ev("publisher_key", "B", { sourceGroup: "adda247-group" }),
    ev("ai_blind_solve", "C"),
    ev("human_review", "B", { observedAt: "2026-09-29T01:00:00Z" }),
    ev("human_review", "C", { observedAt: "2026-09-29T02:00:00Z" }),
  ], OPTIONS);
  assert.equal(r.status, "reviewed");
  assert.equal(r.answer, "C");
});

test("SSC key still beats a learner review", () => {
  const r = resolveAnswerKey([ev("ssc_final", "A"), ev("human_review", "B")], OPTIONS);
  assert.equal(r.status, "official");
  assert.equal(r.answer, "A");
});

test("evidence naming a non-existent option → disputed, never silently ignored", () => {
  const r = resolveAnswerKey([ev("publisher_key", "E")], OPTIONS);
  assert.equal(r.status, "disputed");
  assert.equal(r.answer, null);
});

test("non-dropped evidence with a null answer is malformed → disputed", () => {
  const r = resolveAnswerKey([ev("publisher_key", null)], OPTIONS);
  assert.equal(r.status, "disputed");
});

test("publisher says dropped, another gives an answer → disputed", () => {
  const r = resolveAnswerKey([ev("publisher_key", null, { dropped: true, sourceGroup: "a" }), ev("testbook_portal", "B", { sourceGroup: "testbook" })], OPTIONS);
  assert.equal(r.status, "disputed");
});

console.log(`\n${passed} answer-key tests passed`);
