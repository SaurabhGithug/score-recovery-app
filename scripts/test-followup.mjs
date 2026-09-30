// Follow-up questions, study packs and Made Easy access. Isolated fixtures only: never opens the
// real database, never calls a model (Gemini and DeepSeek are replaced by fakes).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "followup-test-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(temp, "data");

const { BankRepository: B } = await import("../src/lib/server/repositories/bank-repo.ts");
const { UserRepository: U } = await import("../src/lib/server/repositories/user-repo.ts");
const { SpendRepository } = await import("../src/lib/server/repositories/spend-repo.ts");
const { SyllabusRepository: S } = await import("../src/lib/server/repositories/syllabus-repo.ts");
const { buildSyllabusSeed } = await import("../src/lib/syllabus/seed-builder.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");
const { canReadMadeEasy, madeEasyOverview, madeEasyTest, madeEasyOwner } = await import("../src/lib/server/made-easy.ts");
const { askFollowUp, studyPack, waitForStudyPacks, geminiCostUsd, geminiWorstUsd } = await import("../src/lib/server/followup/followup.ts");
const { GeminiError } = await import("../src/lib/server/followup/gemini.ts");
const { syllabusContext, resetSyllabusIndex } = await import("../src/lib/server/followup/syllabus-context.ts");
const { sanitizeSourceHtml, sourceHtmlToText } = await import("../src/lib/server/source-html.ts");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}
async function rejectsWith(promise, status, pattern) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected HTTP ${status}, got ${err.status}: ${err.message}`);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

// ---------------------------------------------------------------- fixtures
const db = getDatabase();
S.applySeed(buildSyllabusSeed());
const VALUATION = db.prepare("SELECT id FROM syllabus_nodes WHERE kind = 'topic' AND name = 'Valuation' AND id LIKE 'SSC_JE:2026:%'").get().id;
const PRECIP = db.prepare("SELECT id FROM syllabus_nodes WHERE kind = 'topic' AND name = 'precipitation' AND id LIKE 'SSC_JE:2026:%'").get().id;
const paper = (id, kind, extra = {}) => B.upsertPaper({ id, kind, paper: "P1", cycleYear: 2023, examDate: "2023-11-14", shift: "1", title: `FIXTURE ${id}`, questionCount: 5, durationMinutes: 120, fidelity: "test", publisher: "fixture", sourceUrl: "https://example.org", sourceFile: null, sourceSha256: null, capturedOn: "2026-09-30", rightsNote: "test fixture", metadata: {}, ...extra });
let position = 0;
const question = (id, paperId, stem, options, extra = {}) => B.upsertQuestion({ id, paperId, position: ++position, section: "Civil", stem, options: options.map((text, i) => ({ id: "ABCD"[i], text })), hasVisual: false, visualPath: null, sourcePage: 1, sourceSolution: null, topic: null, topicEvidence: "pending", metadata: { text_quality: "text_layer" }, ...extra });
const tag = (qid, node) => db.prepare("INSERT INTO question_concepts (question_id, node_id, node_kind, role, origin, method, review_status) VALUES (?, ?, 'topic', 'primary', 'ai_suggested', 'fixture', 'needs_review')").run(qid, node);

paper("pyp-2023", "pyp");
question("pyp-v1", "pyp-2023", "A building has been purchased at a cost of Rs. 25,000. Find the depreciation and scrap value by the straight line method.", ["Rs 500", "Rs 1000", "Rs 1500", "Rs 2000"]);
question("pyp-v2", "pyp-2023", "The sinking fund for depreciation of a building: the valuation of the building after its useful life gives the salvage value.", ["Salvage", "Scrap", "Book", "Market"]);
question("pyp-r1", "pyp-2023", "The precipitation is collected and measured in a rain gauge. Which rain gauge is a recording type?", ["Symons", "Tipping bucket", "Ordinary", "Non-recording"]);
tag("pyp-v1", VALUATION);
tag("pyp-v2", VALUATION);
tag("pyp-r1", PRECIP);
resetSyllabusIndex();

const OWNER = madeEasyOwner();
const other = U.register("followup-other", "test-password-123").user.id;
const learner = U.register("followup-learner", "test-password-456").user.id;

const GOOD_PACK = (topicId) => JSON.stringify({
  topicId,
  scope: "Valuation covers depreciation methods, sinking fund and salvage value; SSC asks short numericals.",
  examPoints: ["Straight line method: equal depreciation every year.", "Salvage value is the value at the end of useful life."],
  practice: [
    { question: "Depreciation by straight line method is", options: ["equal every year", "decreasing", "increasing", "zero"], answer: "A", explanation: "Equal instalments each year." },
    { question: "Scrap value of a building is its value", options: ["when new", "when dismantled", "after repair", "at mid-life"], answer: "B", explanation: "Value of materials when dismantled." },
    { question: "Sinking fund is used to", options: ["pay tax", "replace the asset", "pay rent", "insure"], answer: "B", explanation: "To accumulate money to replace the asset." },
  ],
});

function fakeGemini(reply = {}) {
  const calls = [];
  const fn = async (_key, request) => {
    calls.push(request);
    const error = reply.throwError?.(request);
    if (error) throw error;
    if (reply.failGrounded && request.grounded) throw new GeminiError("Search Grounding is not supported for this API key tier", 400);
    if (request.json) {
      if (reply.packDelay) await reply.packDelay;
      return { text: reply.packText ?? GOOD_PACK(reply.topicId ?? null), finishReason: "STOP", usage: { promptTokens: 2000, outputTokens: 900, searchQueries: 0 }, grounded: false, sources: [], searchEntryPointHtml: null, usageKnown: true };
    }
    return {
      text: reply.text ?? "Because the lysimeter measures evapotranspiration.",
      finishReason: "STOP",
      usage: { promptTokens: 1000, outputTokens: 500, searchQueries: request.grounded ? 2 : 0 },
      grounded: request.grounded,
      sources: request.grounded ? [{ title: "Example", uri: "https://example.org/a" }] : [],
      searchEntryPointHtml: request.grounded ? "<div>chips</div>" : null,
      usageKnown: reply.usageKnown ?? true,
    };
  };
  fn.calls = calls;
  return fn;
}

function fakeDeepSeek(answers) {
  const calls = [];
  return {
    calls,
    name: "fake-deepseek",
    async completeJson(request) {
      calls.push(request);
      return { json: { answers }, usage: { promptCacheHitTokens: 0, promptCacheMissTokens: 500, completionTokens: 200, reasoningTokens: 0 }, model: "deepseek-v4-pro", finishReason: "stop" };
    },
  };
}

const fakeImage = async (url) => (url.startsWith("https://cdnstatic.madeeasyprime.com/") ? { mimeType: "image/png", data: Buffer.from(url).toString("base64") } : null);

function deps(overrides = {}) {
  return { provider: "google", googleKey: "test-key-not-real", geminiModel: "gemini-3.8-flash", deepseek: null, deepseekModel: "deepseek-v4-pro", capUsd: 5, gemini: fakeGemini(), fetchImage: fakeImage, ...overrides };
}

const spentSince = (since) => SpendRepository.totalSince(since);

// ---------------------------------------------------------------- Made Easy access
await test("Made Easy: only the recorded owner account can read it", () => {
  assert.equal(OWNER, "usr_709c4be274f64011");
  assert.equal(canReadMadeEasy(OWNER), true);
  assert.equal(canReadMadeEasy(other), false);
  assert.equal(canReadMadeEasy(""), false);
});

await test("Made Easy: each test's counts add up and questions are decoded and ordered", () => {
  const overview = madeEasyOverview();
  assert.equal(overview.tests.length, 4);
  for (const card of overview.tests) {
    assert.equal(card.counts.ready + card.counts.needsSource, card.counts.attention);
    assert.equal(card.counts.incorrect + card.counts.unattempted, card.counts.attention);
    const detail = madeEasyTest(card.code);
    assert.equal(detail.questions.length, card.counts.attention);
    assert.ok(detail.questions.every((q) => !/&#x?[0-9a-f]+;/i.test(q.question)), "portal entities decoded");
  }
  assert.equal(madeEasyTest("test-99"), null);
});

await test("source HTML: only simple formatting and the portal's images survive", () => {
  const dirty = `<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src="https://evil.example/x.png" onerror="alert(1)"><img src="https://cdnstatic.madeeasyprime.com/resources/image/a-1.png" onerror="y()"><a href="javascript:z()">link</a> 5 < 6 &amp; &rsquo; &bogus</p><style>p{}</style><iframe src="https://evil.example"></iframe>`;
  const clean = sanitizeSourceHtml(dirty);
  assert.equal(clean, `<p>Hi <b>there</b><img src="https://cdnstatic.madeeasyprime.com/resources/image/a-1.png" alt="" loading="lazy" referrerpolicy="no-referrer">link 5 &lt; 6 &amp; &rsquo; &amp;bogus</p>`);
  assert.doesNotMatch(clean, /on\w+=|script|javascript|evil|iframe|<a /i);
  assert.equal(sourceHtmlToText("<p>Na<sup>+</sup> &amp; H<sub>2</sub>O &rsquo;s<br>next</p><p><img src=\"x\"></p>"), "Na^+ & H_2O ’s\nnext\n[image]");
});

await test("Made Easy: every recaptured question is ready and served with sanitized HTML", () => {
  for (const card of madeEasyOverview().tests) {
    assert.equal(card.counts.needsSource, 0, `${card.code} still has questions needing the source`);
    for (const q of madeEasyTest(card.code).questions) {
      assert.ok(q.questionHtml, `${q.id} has its source HTML`);
      for (const html of [q.questionHtml, q.explanationHtml ?? "", ...(q.optionsHtml ?? [])]) {
        assert.doesNotMatch(html, /<(script|style|iframe|a )|on\w+=|style=/i);
        for (const m of html.matchAll(/<img src="([^"]+)"/g)) assert.match(m[1], /^https:\/\/cdnstatic\.madeeasyprime\.com\//);
      }
    }
  }
});

await test("follow-up: when a source image can't be fetched, none are attached and the model is told it can't see them", async () => {
  const gemini = fakeGemini();
  await askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Explain the table", history: [] }, deps({ gemini, fetchImage: async () => null }));
  const sent = gemini.calls.find((c) => !c.json);
  assert.equal(sent.turns[0].images, undefined);
  assert.match(sent.turns[0].text, /parts of this question are images you cannot see/);
});

// ---------------------------------------------------------------- syllabus context
await test("syllabus: a question's topic comes from similar past SSC questions, with how often SSC asked it", () => {
  const ctx = syllabusContext("An old building purchased for Rs 30,000; depreciation and scrap value by the straight line method");
  assert.equal(ctx.candidates[0].nodeId, VALUATION);
  assert.equal(ctx.candidates[0].pypCount, 2);
  assert.deepEqual(ctx.candidates[0].years, [2023]);
  assert.ok(ctx.similar.some((s) => s.questionId === "pyp-v1"));
  assert.equal(ctx.fromOwnTags, false);
});

await test("syllabus: a tagged bank question uses its own tag and never lists itself as similar", () => {
  const ctx = syllabusContext("The precipitation is collected and measured in a rain gauge.", "pyp-r1");
  assert.equal(ctx.fromOwnTags, true);
  assert.equal(ctx.candidates[0].nodeId, PRECIP);
  assert.ok(!ctx.similar.some((s) => s.questionId === "pyp-r1"));
});

// ---------------------------------------------------------------- follow-up answers
await test("follow-up: another account cannot ask about the owner's Made Easy questions", async () => {
  await rejectsWith(askFollowUp(other, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps()), 403);
});

await test("follow-up: the server sends the source key, the syllabus topic and the question's images; asks for exam-scoring extras", async () => {
  const gemini = fakeGemini();
  const answer = await askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Which instrument measures infiltration?" }, deps({ gemini }));
  const sent = gemini.calls.find((c) => !c.json);
  assert.equal(sent.grounded, true);
  assert.match(sent.turns[0].text, /ANSWER KEY: A/);
  assert.match(sent.turns[0].text, /IMAGES: 1 source image\(s\) are attached, in order: 1 = in the question/);
  assert.equal(sent.turns[0].images.length, 1, "the List-I/List-II table goes to Gemini");
  assert.match(sent.turns[0].text, /Tipping bucket gauge/, "the recaptured explanation is complete");
  assert.match(sent.turns[0].text, /SSC JE SYLLABUS \(2026 notice\)/);
  assert.match(sent.turns[0].text, /LEARNER'S QUESTION: Which instrument measures infiltration\?/);
  assert.match(sent.system, /Do not replace it/);
  assert.match(sent.system, /Also asked in the exam:/);
  assert.equal(answer.aiGenerated, true);
  assert.equal(answer.grounded, true);
  assert.equal(answer.searchEntryPointHtml, "<div>chips</div>");
});

await test("follow-up: history must alternate and stay short; long messages are refused", async () => {
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "x".repeat(1501) }, deps()), 400);
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Next?", history: [{ role: "model", text: "hi" }] }, deps()), 400);
  const gemini = fakeGemini();
  await askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "And evaporation?", history: [{ role: "user", text: "First?" }, { role: "model", text: "First answer." }] }, deps({ gemini }));
  const turns = gemini.calls.find((c) => !c.json).turns;
  assert.deepEqual(turns.map((t) => t.role), ["user", "model", "user"]);
  assert.match(turns[0].text, /ANSWER KEY/, "facts ride on the first learner turn");
  assert.equal(turns[2].text, "And evaporation?");
});

await test("follow-up: no Google key means a clear 503, and no money is reserved", async () => {
  const before = spentSince(new Date(0));
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ googleKey: null })), 503, /GOOGLE_GENERATIVE_AI_API_KEY/);
  assert.equal(spentSince(new Date(0)), before);
});

await test("follow-up: a key Google rejects is a 503 setup message, sent once, not retried without search", async () => {
  const gemini = fakeGemini({ throwError: () => new GeminiError("API key not valid. Please pass a valid API key.", 400) });
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ gemini })), 503, /rejected the API key/);
  assert.equal(gemini.calls.filter((c) => !c.json).length, 1);
});

await test("follow-up: only a Search-tool refusal is retried without search, labelled not web-checked", async () => {
  const gemini = fakeGemini({ failGrounded: true });
  const answer = await askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ gemini }));
  assert.deepEqual(gemini.calls.filter((c) => !c.json).map((c) => c.grounded), [true, false]);
  assert.equal(answer.grounded, false);
  assert.equal(answer.searchEntryPointHtml, null);
  const other400 = fakeGemini({ throwError: (r) => (r.json ? null : new GeminiError("Request payload size exceeds the limit", 400)) });
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ gemini: other400 })), 502);
  assert.equal(other400.calls.filter((c) => !c.json).length, 1);
});

await test("follow-up: spend is reserved first and settled to the billed cost; the daily limit refuses", async () => {
  // Pack cached from earlier tests, so this ask makes one billed call.
  await waitForStudyPacks();
  const before = spentSince(new Date(0));
  await askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps());
  const expected = geminiCostUsd("gemini-3.8-flash", { promptTokens: 1000, outputTokens: 500, searchQueries: 2 });
  const spent = spentSince(new Date(0)) - before;
  assert.ok(Math.abs(spent - expected) < 1e-9, `spent ${spent} vs ${expected}`);
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ capUsd: 0.0001 })), 429);
});

await test("follow-up: a timeout keeps the worst case reserved (Google may have billed it)", async () => {
  await waitForStudyPacks();
  const before = spentSince(new Date(0));
  const gemini = fakeGemini({ throwError: (r) => (r.json ? null : new GeminiError("Could not reach Google: The operation was aborted due to timeout", 0, null, true)) });
  await rejectsWith(askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ gemini })), 502);
  const worst = geminiWorstUsd("gemini-3.8-flash", { system: "", turns: [], grounded: true, maxOutputTokens: 8192 }) + geminiWorstUsd("gemini-3.8-flash", { system: "", turns: [], grounded: false, maxOutputTokens: 8192 });
  const kept = spentSince(new Date(0)) - before;
  assert.ok(kept >= worst, `kept ${kept} >= ${worst}`);
});

await test("follow-up: the worst-case reservation covers thinking plus answer (inside maxOutputTokens) and searches", () => {
  const request = { system: "x".repeat(3000), turns: [{ role: "user", text: "y".repeat(3000) }], grounded: true, maxOutputTokens: 8192 };
  const maximal = geminiCostUsd("gemini-3.8-flash", { promptTokens: 2000, outputTokens: 8192, searchQueries: 10 }, new Date("2027-06-01"));
  assert.ok(geminiWorstUsd("gemini-3.8-flash", request) >= maximal);
});

// ---------------------------------------------------------------- study packs
await test("study pack: topic must be one the past papers suggested; a second AI's disagreement drops that question", async () => {
  const gemini = fakeGemini({ topicId: VALUATION });
  const deepseek = fakeDeepSeek(["A", "C", "B"]); // disagrees with Q2 (B)
  paper("fu-mock-v", "mock", { ownerUserId: learner });
  question("fu-v", "fu-mock-v", "An old building was purchased for Rs 30,000. Depreciation and scrap value by the straight line method?", ["Rs 600", "Rs 900", "Rs 1200", "Rs 1500"], { metadata: { text_quality: "text_layer", testbook_question_id: "tb-v" } });
  B.upsertGlobalEvidence({ questionId: "fu-v", authority: "testbook_portal", sourceGroup: "testbook", sourceLabel: "Testbook solution", answer: "A", detail: {} });
  const { pack } = await studyPack(learner, { kind: "bank", id: "fu-v", generate: true }, deps({ gemini, deepseek }), { wait: true });
  assert.equal(pack.topic.nodeId, VALUATION);
  assert.equal(pack.topic.pypCount, 2);
  assert.equal(pack.topicBasis, "similar_past_questions");
  assert.deepEqual(pack.practice.map((p) => p.question), ["Depreciation by straight line method is", "Sinking fund is used to"]);
  assert.ok(pack.practice.every((p) => p.crossChecked));
  assert.equal(pack.checkedBy, "deepseek-v4-pro");
  assert.doesNotMatch(deepseek.calls[0].user, /answer/i, "the checker never sees the answers");
  // Stored: asking again costs nothing and returns the same pack.
  const again = await studyPack(learner, { kind: "bank", id: "fu-v" }, deps({ gemini: fakeGemini({ throwError: () => new Error("must not call") }) }));
  assert.equal(again.pack.createdAt, pack.createdAt);
});

await test("study pack: an invented topic id is dropped; without a second AI the questions are marked not cross-checked", async () => {
  const gemini = fakeGemini({ topicId: "SSC_JE:2026:made-up-topic" });
  paper("fu-mock-w", "mock", { ownerUserId: learner });
  question("fu-w", "fu-mock-w", "Scrap value of a building purchased for Rs 40,000 by straight line depreciation?", ["A1", "B1", "C1", "D1"], { metadata: { text_quality: "text_layer", testbook_question_id: "tb-w" } });
  B.upsertGlobalEvidence({ questionId: "fu-w", authority: "testbook_portal", sourceGroup: "testbook", sourceLabel: "Testbook solution", answer: "B", detail: {} });
  const { pack } = await studyPack(learner, { kind: "bank", id: "fu-w", generate: true }, deps({ gemini }), { wait: true });
  assert.equal(pack.topic, null);
  assert.equal(pack.practice.length, 3);
  assert.ok(pack.practice.every((p) => !p.crossChecked));
  assert.equal(pack.checkedBy, null);
});

await test("study pack: nothing is generated without asking, and another learner can't see a private question's pack", async () => {
  const status = await studyPack(OWNER, { kind: "made_easy", id: "test-09-q30" }, deps({ gemini: fakeGemini({ throwError: () => new Error("must not call") }) }));
  assert.deepEqual(status, { pack: null, pending: false, error: null });
  await rejectsWith(studyPack(other, { kind: "bank", id: "fu-v" }, deps()), 404);
});

await test("study pack: the answer never waits for it; concurrent requests make it once; polling picks it up", async () => {
  let release;
  const packDelay = new Promise((r) => { release = r; });
  const gemini = fakeGemini({ packDelay });
  const answer = await askFollowUp(OWNER, { kind: "made_easy", id: "test-09-q30", message: "Why?" }, deps({ gemini }));
  assert.equal(answer.pack, null);
  assert.equal(answer.packPending, true, "answer returned while the pack is still being made");
  const joined = await studyPack(OWNER, { kind: "made_easy", id: "test-09-q30", generate: true }, deps({ gemini }));
  assert.deepEqual(joined, { pack: null, pending: true, error: null });
  release();
  await waitForStudyPacks();
  assert.equal(gemini.calls.filter((c) => c.json).length, 1, "made once");
  const polled = await studyPack(OWNER, { kind: "made_easy", id: "test-09-q30" }, deps({ gemini }));
  assert.ok(polled.pack && polled.pack.practice.length === 3);
});

await test("study pack: internal errors are not shown to the learner; an empty pack is not kept", async () => {
  const broken = fakeGemini({ packText: '{"scope": "x", "practice": "not a list"' });
  paper("fu-mock-e", "mock", { ownerUserId: learner });
  question("fu-e", "fu-mock-e", "Fixture: empty pack question", ["One", "Two", "Three", "Four"], { metadata: { text_quality: "text_layer", testbook_question_id: "tb-e" } });
  B.upsertGlobalEvidence({ questionId: "fu-e", authority: "testbook_portal", sourceGroup: "testbook", sourceLabel: "Testbook solution", answer: "A", detail: {} });
  const failed = await studyPack(learner, { kind: "bank", id: "fu-e", generate: true }, deps({ gemini: broken }), { wait: true });
  assert.equal(failed.pack, null);
  assert.match(failed.error, /not valid JSON/);
  const thrower = fakeGemini({ throwError: (r) => (r.json ? new TypeError("secret internal detail") : null) });
  const hidden = await studyPack(learner, { kind: "bank", id: "fu-e", generate: true }, deps({ gemini: thrower }), { wait: true });
  assert.doesNotMatch(hidden.error, /secret internal detail/);
  const empty = fakeGemini({ packText: JSON.stringify({ topicId: null, scope: "Some scope.", examPoints: [], practice: [] }) });
  const made = await studyPack(learner, { kind: "bank", id: "fu-e", generate: true }, deps({ gemini: empty }), { wait: true });
  assert.equal(made.pack.practice.length, 0);
  assert.equal((await studyPack(learner, { kind: "bank", id: "fu-e" }, deps())).pack, null, "not stored, so it can be made again");
});

await test("follow-up: a reply without usage figures keeps the worst case reserved", async () => {
  await waitForStudyPacks();
  const before = spentSince(new Date(0));
  await askFollowUp(OWNER, { kind: "made_easy", id: "test-12-q26", message: "Why?" }, deps({ gemini: fakeGemini({ usageKnown: false }) }));
  const kept = spentSince(new Date(0)) - before;
  assert.ok(kept >= geminiWorstUsd("gemini-3.8-flash", { system: "", turns: [], grounded: true, maxOutputTokens: 8192 }));
});

// ---------------------------------------------------------------- bank commitment and key wording
await test("follow-up (bank): unknown ids 404; a question the learner has not answered is refused", async () => {
  await rejectsWith(askFollowUp(learner, { kind: "bank", id: "no-such-question", message: "Why?" }, deps()), 404);
  paper("fu-paper", "pyp");
  question("fu-q1", "fu-paper", "Fixture: which is a non-destructive test?", ["Rebound hammer", "Cube test"]);
  B.upsertGlobalEvidence({ questionId: "fu-q1", authority: "publisher_key", sourceGroup: "fixture", sourceLabel: "Fixture key", answer: "A", detail: {} });
  await rejectsWith(askFollowUp(learner, { kind: "bank", id: "fu-q1", message: "Why?" }, deps()), 403, /Answer this question first/);
});

await test("follow-up (bank): after commitment the key is sent with the learner's labels", async () => {
  paper("fu-mock", "mock", { ownerUserId: learner });
  question("fu-q2", "fu-mock", "Fixture: slump test measures?", ["Workability", "Strength"], { sourceSolution: "Workability of fresh concrete.", metadata: { text_quality: "text_layer", testbook_question_id: "tb-1" } });
  B.upsertGlobalEvidence({ questionId: "fu-q2", authority: "testbook_portal", sourceGroup: "testbook", sourceLabel: "Testbook solution", answer: "A", detail: {} });
  const gemini = fakeGemini();
  await askFollowUp(learner, { kind: "bank", id: "fu-q2", message: "Why not strength?" }, deps({ gemini }));
  const sent = gemini.calls.find((c) => !c.json).turns[0].text;
  assert.match(sent, /ANSWER KEY: A \(Workability\), from the source key/);
  assert.match(sent, /SOURCE EXPLANATION: Workability of fresh concrete\./);
  await rejectsWith(askFollowUp(other, { kind: "bank", id: "fu-q2", message: "Why?" }, deps()), 404);
});

await test("follow-up (bank): a learner's own dispute resolution is not presented as a source key", async () => {
  paper("fu-mock-r", "mock", { ownerUserId: learner });
  question("fu-r", "fu-mock-r", "Fixture: disputed question", ["One", "Two"], { metadata: { text_quality: "text_layer", testbook_question_id: "tb-r" } });
  B.upsertGlobalEvidence({ questionId: "fu-r", authority: "testbook_portal", sourceGroup: "testbook", sourceLabel: "Testbook solution", answer: "A", detail: {} });
  B.upsertGlobalEvidence({ questionId: "fu-r", authority: "publisher_key", sourceGroup: "other", sourceLabel: "Other publisher", answer: "B", detail: {} });
  B.upsertHumanReview(B.getQuestion("fu-r"), learner, "B", "fixture");
  const gemini = fakeGemini();
  await askFollowUp(learner, { kind: "bank", id: "fu-r", message: "Why?" }, deps({ gemini }));
  assert.match(gemini.calls.find((c) => !c.json).turns[0].text, /learner's own resolution of a dispute/);
});

db.close?.();
fs.rmSync(temp, { recursive: true, force: true });
console.log(`\n${passed} tests passed`);
