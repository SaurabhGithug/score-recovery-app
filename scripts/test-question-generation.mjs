// Run with: npx tsx scripts/test-question-generation.mjs
// Uses a throwaway SQLite database in a temp directory — never touches data/score_recovery.db.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "qgen-test-"));
process.chdir(workDir); // getDatabase() resolves data/ from cwd on first use

const { checkGrounding, normalizeForMatch } = await import("../src/lib/server/generation/grounding.ts");
const { parseCandidates, parseVerdicts } = await import("../src/lib/server/generation/candidates.ts");
const { chunkPages, TARGET_CHUNK_CHARS } = await import("../src/lib/server/generation/chunker.ts");
const { isPeak, costUsd } = await import("../src/lib/server/generation/pricing.ts");
const { runGeneration } = await import("../src/lib/server/generation/question-generator.ts");
const { MockProvider } = await import("../src/lib/server/llm/mock.ts");
const { DeepSeekProvider } = await import("../src/lib/server/llm/deepseek.ts");
const { LlmError } = await import("../src/lib/server/llm/types.ts");
const { UserRepository } = await import("../src/lib/server/repositories/user-repo.ts");
const { SpendRepository } = await import("../src/lib/server/repositories/spend-repo.ts");
const { GenerationQueue } = await import("../src/lib/server/jobs/generation-queue.ts");
const { DocumentRepository } = await import("../src/lib/server/repositories/document-repo.ts");
const { QuestionRepository } = await import("../src/lib/server/repositories/question-repo.ts");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

// ---------------------------------------------------------------- grounding
const page12 = `The Preamble of the Indian Constitution was amended only once, by the 42nd Amendment Act of 1976.
It added the words socialist, secular and integ-
rity to the Preamble. Fundamental Duties were added in Part IVA.`;
const pages = [
  { pageNumber: 12, text: page12 },
  { pageNumber: 13, text: "Article 21 guarantees protection of life and personal liberty. It has been interpreted widely by the Supreme Court over the decades." },
];

await test("grounding: exact quote on the cited page", () => {
  const r = checkGrounding("The Preamble of the Indian Constitution was amended only once, by the 42nd Amendment Act of 1976.", 12, pages);
  assert.equal(r.grounded, true);
  assert.equal(r.method, "exact");
  assert.equal(r.page, 12);
});

await test("grounding: tolerates case, punctuation, line breaks and hyphenation", () => {
  const r = checkGrounding("it added the words SOCIALIST secular and integrity to the preamble", 12, pages);
  assert.equal(r.grounded, true);
  assert.equal(r.method, "exact");
});

await test("grounding: corrects a wrong page citation", () => {
  const r = checkGrounding("Article 21 guarantees protection of life and personal liberty.", 12, pages);
  assert.equal(r.grounded, true);
  assert.equal(r.page, 13);
});

await test("grounding: quote across a page break", () => {
  const r = checkGrounding("Fundamental Duties were added in Part IVA. Article 21 guarantees protection of life", 12, pages);
  assert.equal(r.grounded, true);
  assert.equal(r.page, 12);
  assert.equal(r.excerpt, "Fundamental Duties were added in Part IVA … Article 21 guarantees protection of life");
});

await test("grounding: fuzzy match survives one OCR slip, and the proof shown is the page's text", () => {
  const r = checkGrounding("The Preamble of the Indian Constitutlon was amended only once, by the 42nd Amendment Act of 1976.", 12, pages);
  assert.equal(r.grounded, true);
  assert.equal(r.method, "fuzzy");
  assert.ok(r.score >= 0.9);
  assert.match(r.excerpt, /Indian Constitution was amended/);
  assert.doesNotMatch(r.excerpt, /Constitutlon/);
});

await test("grounding: a changed number is a different fact, not a slip (audit finding)", () => {
  const r = checkGrounding("The Preamble of the Indian Constitution was amended only once by the 44th Amendment Act of 1976", 12, pages);
  assert.equal(r.grounded, false);
  assert.match(r.reason, /number "44th"/);
});

await test("grounding: a changed word is rejected", () => {
  const r = checkGrounding("The Preamble of the Indian Constitution was amended only twice by the 42nd Amendment Act of 1976", 12, pages);
  assert.equal(r.grounded, false);
});

const history = [{ pageNumber: 40, text: "In the Third Anglo-Maratha War of 1817, the British defeated the Marathas decisively near Pune after a long campaign across the Deccan plateau. The standard kilogram mass of the prototype weighs 1.4 kg in this simplified classroom example. Mount Everest is the fifty highest peak listed in this invented table for testing purposes only. Jawaharlal Nehru became the first Prime Minister of independent India in the year 1947. Neither the Governor nor the President may dissolve the council without advice from the ministers." }];

await test("grounding: swapped subject and object is rejected (re-audit probe)", () => {
  const r = checkGrounding("the Marathas defeated the British decisively near Pune after a long campaign across the Deccan plateau", 40, history);
  assert.equal(r.grounded, false);
});

await test("grounding: unit change kg to g is rejected (re-audit probe)", () => {
  const r = checkGrounding("The standard kilogram mass of the prototype weighs 1.4 g in this simplified classroom example", 40, history);
  assert.equal(r.grounded, false);
});

await test("grounding: spelled-out number change is rejected (re-audit probe)", () => {
  const r = checkGrounding("Mount Everest is the fifth highest peak listed in this invented table for testing purposes only", 40, history);
  assert.equal(r.grounded, false);
  assert.match(r.reason, /number/);
});

await test("grounding: nor changed to not is rejected (re-audit probe)", () => {
  const r = checkGrounding("Neither the Governor not the President may dissolve the council without advice from the ministers", 40, history);
  assert.equal(r.grounded, false);
});

await test("grounding: an inserted word shifts positions and is rejected", () => {
  const r = checkGrounding("Jawaharlal Nehru never became the first Prime Minister of independent India in the year 1947", 40, history);
  assert.equal(r.grounded, false);
});

await test("grounding: documented residual — proper-noun near-spelling passes, but the proof shown is the page's text", () => {
  const r = checkGrounding("Jawaharlal Nehra became the first Prime Minister of independent India in the year 1947", 40, history);
  assert.equal(r.grounded, true);
  assert.match(r.excerpt, /Jawaharlal Nehru became/);
});

await test("grounding: exact match returns the page's own wording and punctuation", () => {
  const r = checkGrounding("it added the words SOCIALIST secular and integrity to the preamble", 12, pages);
  assert.equal(r.excerpt, "It added the words socialist, secular and integrity to the Preamble");
});

await test("grounding: invented fact is rejected", () => {
  const r = checkGrounding("The Preamble was amended three times, most recently by the 86th Amendment in 2002.", 12, pages);
  assert.equal(r.grounded, false);
});

await test("grounding: scattered words are not a match", () => {
  // every word exists somewhere on the page, but not together
  const r = checkGrounding("secular Preamble amended words Constitution added once integrity socialist Part", 12, pages);
  assert.equal(r.grounded, false);
});

await test("grounding: too-short quote is rejected", () => {
  const r = checkGrounding("42nd Amendment", 12, pages);
  assert.equal(r.grounded, false);
  assert.match(r.reason, /too short/);
});

await test("grounding: Hindi (Devanagari) text matches", () => {
  const hindi = [{ pageNumber: 4, text: "भारत का संविधान 26 जनवरी 1950 को लागू हुआ। इसे डॉ. भीमराव अंबेडकर की अध्यक्षता वाली प्रारूप समिति ने तैयार किया।" }];
  const r = checkGrounding("भारत का संविधान 26 जनवरी 1950 को लागू हुआ", 4, hindi);
  assert.equal(r.grounded, true);
  assert.notEqual(normalizeForMatch("लागू हुआ"), "");
});

// ---------------------------------------------------------------- candidate checks
const good = {
  stem: "Which amendment added the word 'secular' to the Preamble?",
  options: { A: "42nd Amendment", B: "44th Amendment", C: "73rd Amendment", D: "86th Amendment" },
  answer: "A",
  explanation: "The 42nd Amendment (1976) added socialist, secular and integrity.",
  sourceQuote: "It added the words socialist, secular and integrity to the Preamble.",
  sourcePage: 12,
  subject: "Polity",
  topic: "Preamble",
  difficulty: 2,
  level: "recall",
};

await test("candidates: a well-formed question passes", () => {
  const { candidates, rejections } = parseCandidates({ questions: [good] });
  assert.equal(candidates.length, 1);
  assert.equal(rejections.length, 0);
  assert.deepEqual(candidates[0].options.map((o) => o.id), ["A", "B", "C", "D"]);
});

await test("candidates: lower-case option keys and answer are accepted", () => {
  const { candidates } = parseCandidates({ questions: [{ ...good, options: { a: "w1 x", b: "w2 x", c: "w3 x", d: "w4 x" }, answer: "c" }] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].answer, "C");
});

await test("candidates: style and shape problems are rejected with reasons", () => {
  const bad = [
    { ...good, options: { ...good.options, D: "All of the above" } },
    { ...good, stem: "According to the passage, which amendment changed the Preamble?" },
    { ...good, options: { A: "same", B: "Same", C: "other", D: "third" } },
    { ...good, answer: "E" },
    { ...good, options: { A: "1", B: "2", C: "3" } },
    { ...good, sourceQuote: "" },
    { ...good, sourcePage: 0 },
    "not an object",
  ];
  const { candidates, rejections } = parseCandidates({ questions: bad });
  assert.equal(candidates.length, 0);
  assert.equal(rejections.length, bad.length);
});

await test("candidates: missing list is handled", () => {
  const { candidates, rejections } = parseCandidates({ nope: true });
  assert.equal(candidates.length, 0);
  assert.equal(rejections.length, 1);
});

await test("verdicts: unknown letters become NONE", () => {
  const v = parseVerdicts({ results: [{ id: "q1", answer: "b", reason: "x" }, { id: "q2", answer: "maybe" }] });
  assert.equal(v.get("q1").answer, "B");
  assert.equal(v.get("q2").answer, "NONE");
});

// ---------------------------------------------------------------- chunker
await test("chunker: skips unreadable pages and keeps page numbers", () => {
  const body = "A sentence about the topic that is long enough to count. ".repeat(10);
  const chunks = chunkPages([
    { pageNumber: 1, text: "Cover", confidence: 1 },
    { pageNumber: 2, text: body, confidence: 0.3 },
    { pageNumber: 3, text: body, confidence: 0.95 },
    { pageNumber: 4, text: body, confidence: 0.95 },
  ]);
  const used = chunks.flatMap((c) => c.pages.map((p) => p.pageNumber));
  assert.deepEqual(used, [3, 4]);
});

await test("chunker: splits a very long page without losing text", () => {
  const long = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} explains one idea clearly.`).join(" ");
  const chunks = chunkPages([{ pageNumber: 7, text: long, confidence: 1 }]);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.charCount <= TARGET_CHUNK_CHARS));
  assert.ok(chunks.every((c) => c.pages.every((p) => p.pageNumber === 7)));
  const joined = chunks.flatMap((c) => c.pages.map((p) => p.text)).join(" ");
  assert.equal(normalizeForMatch(joined), normalizeForMatch(long));
});

// ---------------------------------------------------------------- pricing
await test("pricing: peak windows follow DeepSeek's UTC schedule", () => {
  assert.equal(isPeak(new Date(Date.UTC(2026, 8, 28, 7))), true); // Monday 07:00 UTC
  assert.equal(isPeak(new Date(Date.UTC(2026, 8, 28, 5))), false); // Monday 05:00 UTC
  assert.equal(isPeak(new Date(Date.UTC(2026, 8, 28, 2))), true); // Monday 02:00 UTC
  assert.equal(isPeak(new Date(Date.UTC(2026, 9, 3, 7))), false); // Saturday
});

await test("pricing: flash cost matches the published rates", () => {
  const usage = { promptCacheHitTokens: 1_000_000, promptCacheMissTokens: 1_000_000, completionTokens: 1_000_000, reasoningTokens: 0 };
  const peak = costUsd("deepseek-flash", usage, new Date(Date.UTC(2026, 8, 28, 7)));
  const off = costUsd("deepseek-flash", usage, new Date(Date.UTC(2026, 9, 3, 7)));
  assert.ok(Math.abs(peak - (0.006 + 0.3 + 1.2)) < 1e-9);
  assert.ok(Math.abs(off - peak / 2) < 1e-9);
  assert.ok(costUsd("some-future-model", usage) > 0, "unknown models are never free");
});

// ---------------------------------------------------------------- DeepSeek adapter (fetch stubbed)
const realFetch = globalThis.fetch;
function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const next = responses.shift();
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return calls;
}
const okBody = (content, finish = "stop") => ({
  model: "deepseek-flash",
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 90, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 20 } },
});

await test("deepseek: request shape (JSON mode, thinking toggle, bearer key)", async () => {
  const calls = stubFetch([{ body: okBody('{"questions":[]}') }]);
  const p = new DeepSeekProvider("sk-test");
  const r = await p.completeJson({ model: "deepseek-flash", system: "sys json", user: "usr", thinking: false, maxTokens: 100 });
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].headers.Authorization, "Bearer sk-test");
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  assert.deepEqual(calls[0].body.thinking, { type: "disabled" });
  assert.equal(calls[0].body.reasoning_effort, undefined);
  assert.deepEqual(r.usage, { promptCacheHitTokens: 10, promptCacheMissTokens: 90, completionTokens: 50, reasoningTokens: 20 });

  const calls2 = stubFetch([{ body: okBody('{"results":[]}') }]);
  await p.completeJson({ model: "deepseek-v4-pro", system: "s", user: "u", thinking: true, maxTokens: 100 });
  assert.deepEqual(calls2[0].body.thinking, { type: "enabled" });
  assert.equal(calls2[0].body.reasoning_effort, undefined, "provider default unless configured");
  assert.equal(calls2[0].body.temperature, undefined, "temperature is ignored in thinking mode, so not sent");

  const calls3 = stubFetch([{ body: okBody('{"results":[]}') }]);
  await p.completeJson({ model: "deepseek-v4-pro", system: "s", user: "u", thinking: true, reasoningEffort: "low", maxTokens: 100 });
  assert.equal(calls3[0].body.reasoning_effort, "low");
});

const fast = () => new DeepSeekProvider("k", { backoffMs: 1 });
const call = (p, extra = {}) => p.completeJson({ model: "deepseek-v4-pro", system: "s", user: "u", thinking: false, maxTokens: 1000, ...extra });

await test("deepseek: bad key and no balance fail fast without retrying", async () => {
  for (const status of [401, 402]) {
    const calls = stubFetch([{ status, body: "nope" }]);
    await assert.rejects(call(fast()), (e) => e instanceof LlmError && e.fatal && !e.retryable);
    assert.equal(calls.length, 1);
  }
});

await test("deepseek: billed-but-unusable replies are counted, truncation is not retried (audit blocker)", async () => {
  const calls = stubFetch([
    { status: 429, body: "slow down" },
    { body: okBody("") },
    { body: okBody('{"questions":[', "length") },
    { body: okBody('{"never":"reached"}') },
  ]);
  await assert.rejects(call(fast()), (e) => {
    assert.ok(e instanceof LlmError && !e.retryable && /cut off/.test(e.message));
    // two billed 200 replies (empty + truncated), none for the 429
    assert.deepEqual(e.usage, { promptCacheHitTokens: 20, promptCacheMissTokens: 180, completionTokens: 100, reasoningTokens: 40 });
    return true;
  });
  assert.equal(calls.length, 3, "stops at the truncated reply instead of retrying it");
});

await test("deepseek: success after a billed failure reports both attempts' usage", async () => {
  stubFetch([{ body: okBody("not json at all") }, { body: okBody('{"ok":true}') }]);
  const r = await call(fast());
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.usage.completionTokens, 100);
});

await test("deepseek: content-filtered output is not retried", async () => {
  const calls = stubFetch([{ body: okBody("", "content_filter") }, { body: okBody('{"ok":true}') }]);
  await assert.rejects(call(fast()), (e) => e instanceof LlmError && !e.retryable && e.usage.completionTokens === 50);
  assert.equal(calls.length, 1);
});

await test("deepseek: JSON wrapped in a code fence and keep-alive blank lines are accepted", async () => {
  stubFetch([{ body: "\n\n\n" + JSON.stringify(okBody('```json\n{"ok":true}\n```')) }]);
  const r = await call(fast());
  assert.deepEqual(r.json, { ok: true });
});

await test("deepseek: a timeout is not retried and is charged at max_tokens so the cap still binds", async () => {
  let n = 0;
  globalThis.fetch = (_url, init) => {
    n++;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  };
  const p = new DeepSeekProvider("k", { backoffMs: 1, timeoutMs: { thinking: 30, plain: 30 } });
  // AbortSignal.timeout's timer is unref'd; a running server keeps the loop alive, a script doesn't.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(call(p, { thinking: true, maxTokens: 64000 }), (e) => {
      assert.ok(e instanceof LlmError && !e.retryable && /did not answer/.test(e.message));
      assert.equal(e.usage.completionTokens, 64000);
      return true;
    });
  } finally {
    clearInterval(keepAlive);
  }
  assert.equal(n, 1);
});

await test("deepseek: a connection that breaks after DeepSeek accepted the request is charged (re-audit)", async () => {
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("\n\n"));
        controller.error(new TypeError("terminated"));
      },
    });
    return new Response(stream, { status: 200 });
  };
  await assert.rejects(call(fast(), { maxTokens: 64000 }), (e) => {
    assert.ok(e instanceof LlmError && /broke while it was answering/.test(e.message));
    assert.equal(e.usage.completionTokens, 3 * 64000, "each billed attempt is charged at worst case");
    return true;
  });
  assert.equal(n, 3);
});

await test("deepseek: an unreadable 200 envelope is charged; a network failure before any reply is not", async () => {
  stubFetch([{ body: "<html>gateway</html>" }, { body: "<html>gateway</html>" }, { body: "<html>gateway</html>" }]);
  await assert.rejects(call(fast(), { maxTokens: 1000 }), (e) => e.usage.completionTokens === 3000);

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(call(fast()), (e) => e instanceof LlmError && e.retryable && e.usage.completionTokens === 0);
});

await test("deepseek: 503 is retried and then succeeds", async () => {
  stubFetch([{ status: 503, body: "busy" }, { body: okBody('{"ok":true}') }]);
  const r = await call(fast());
  assert.deepEqual(r.json, { ok: true });
});
globalThis.fetch = realFetch;

// ---------------------------------------------------------------- full run on a temp database
const owner = UserRepository.findOrCreateByName(`GenOwner_${Date.now()}`);
const outsider = UserRepository.findOrCreateByName(`GenOutsider_${Date.now()}`);
const doc = DocumentRepository.create({
  userId: owner.id,
  originalName: "Secret_Personal_Notes_Filename.pdf",
  mimeType: "application/pdf",
  storagePath: null,
  fileSizeBytes: 1,
});
const bookPages = Array.from({ length: 6 }, (_, i) => ({
  documentId: doc.id,
  pageNumber: i + 1,
  rawText: [
    `Photosynthesis happens inside chloroplasts where chlorophyll absorbs sunlight during chapter ${i + 1}.`,
    `The mitochondria release energy through cellular respiration in every living organism studied here.`,
    `Nitrogen fixation converts atmospheric nitrogen into ammonia with help from specialised bacteria.`,
    `Transpiration moves water upward through xylem vessels and cools the leaves of large plants.`,
    `Enzymes accelerate biochemical reactions by lowering activation energy inside the cytoplasm region.`,
    `Hormones such as auxin regulate growth by promoting elongation of cells near the shoot tips.`,
  ].join(" "),
  markdown: null,
  parser: "test",
  confidence: 0.99,
}));
DocumentRepository.insertPages(bookPages);

// Spy on everything that would leave the server.
const sentPayloads = [];
const mock = new MockProvider();
const spy = {
  name: "mock",
  async completeJson(req) {
    sentPayloads.push(req.system + "\n" + req.user);
    return mock.completeJson(req);
  },
};
const baseReq = {
  documentId: doc.id,
  userId: owner.id,
  preparationContextId: null,
  examName: "ISRO JPA",
  pageFrom: 1,
  pageTo: 6,
  questionsPerPage: 3,
};
const deps = { provider: spy, generationModel: "mock", checkModel: "mock", budgetUsd: 2 };

let firstRun;
await test("run: writes, checks, sorts and stores questions", async () => {
  const updates = [];
  firstRun = await runGeneration(baseReq, { ...deps, onUpdate: (s) => updates.push(s.status) });
  assert.equal(firstRun.status, "DONE");
  assert.ok(firstRun.ready > 0, "some questions pass both checks");
  assert.ok(firstRun.needsReview > 0, "checker disagreements go to review");
  assert.ok((firstRun.rejectionReasons["Proof quote not found in the material"] ?? 0) > 0, "invented quotes are rejected");
  assert.equal(updates.at(-1), "DONE");

  const stored = QuestionRepository.listByDocumentId(doc.id, owner.id);
  assert.equal(stored.length, firstRun.ready + firstRun.needsReview);
  const text = bookPages.map((p) => p.rawText).join(" ");
  for (const q of stored) {
    assert.equal(q.source_type, "GENERATED");
    assert.equal(q.user_id, owner.id);
    const meta = JSON.parse(q.metadata).generation;
    assert.ok(normalizeForMatch(text).includes(normalizeForMatch(meta.sourceQuote)), "every stored proof quote is real");
    assert.ok(meta.modelQuote, "the model's own wording is kept for auditing");
    assert.equal(meta.promptVersion, "gen-v1");
    if (q.verification_status === "NEEDS_REVIEW") assert.match(q.review_reason, /Independent check/);
  }
  const numbers = stored.map((q) => q.question_number).sort((a, b) => a - b);
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));

  const refreshed = DocumentRepository.findById(doc.id);
  assert.equal(refreshed.ready_questions_count, firstRun.ready);
  assert.equal(refreshed.review_questions_count, firstRun.needsReview);
});

await test("run: blind checks go out in batches of at most 5 questions, without answers", () => {
  const checks = sentPayloads.filter((p) => p.includes("QUESTIONS_JSON:"));
  assert.ok(checks.length > 1);
  for (const c of checks) {
    const qs = JSON.parse(c.split("QUESTIONS_JSON:\n")[1].split("\n\nReturn json.")[0]);
    assert.ok(qs.length >= 1 && qs.length <= 5);
    assert.ok(qs.every((q) => !("answer" in q) && !("explanation" in q) && !("sourceQuote" in q)));
  }
});

await test("run: only study material and the exam name leave the server", () => {
  const all = sentPayloads.join("\n");
  assert.ok(all.includes("ISRO JPA"));
  for (const secret of [owner.id, owner.name, doc.id, "Secret_Personal_Notes_Filename"]) {
    assert.ok(!all.includes(secret), `must not send ${secret}`);
  }
});

await test("run: questions are private to the document owner", () => {
  assert.equal(QuestionRepository.listByDocumentId(doc.id, outsider.id).length, 0);
});

await test("run: a second run skips repeated questions", async () => {
  const before = QuestionRepository.listByDocumentId(doc.id, owner.id).length;
  const second = await runGeneration(baseReq, deps);
  assert.ok(second.duplicates > 0);
  const after = QuestionRepository.listByDocumentId(doc.id, owner.id);
  const stems = after.map((q) => normalizeForMatch(q.question_text));
  assert.equal(new Set(stems).size, stems.length, "no duplicate stems stored");
  assert.equal(after.length, before + second.ready + second.needsReview);
});

await test("run: stops at the spending limit and keeps what it made", async () => {
  const pricey = {
    name: "stub",
    async completeJson(req) {
      const r = await mock.completeJson(req);
      return { ...r, usage: { ...r.usage, completionTokens: 1_000_000 } }; // ~$1-4 per call on v4-pro
    },
  };
  // A fresh, longer document so the run spans several sections.
  const bigDoc = DocumentRepository.create({ userId: owner.id, originalName: "big.pdf", mimeType: "application/pdf", storagePath: null, fileSizeBytes: 1 });
  DocumentRepository.insertPages(
    Array.from({ length: 30 }, (_, i) => ({
      documentId: bigDoc.id,
      pageNumber: i + 1,
      rawText: Array.from({ length: 20 }, (_, j) => `Paragraph ${i}-${j} describes irrigation, sediment, monsoon and plateau geography.`).join(" "),
      markdown: null,
      parser: "test",
      confidence: 1,
    }))
  );
  const s = await runGeneration(
    { ...baseReq, documentId: bigDoc.id, pageTo: 30 },
    { provider: pricey, generationModel: "deepseek-v4-pro", checkModel: "deepseek-v4-pro", budgetUsd: 0.5 }
  );
  assert.ok(s.sectionsTotal > 3, `expected several sections, got ${s.sectionsTotal}`);
  assert.equal(s.status, "BUDGET_REACHED");
  assert.ok(s.sectionsDone < s.sectionsTotal, "later sections were never started");
  assert.ok(s.sectionsDone <= 3, "at most the sections already in flight finish");
  assert.equal(QuestionRepository.listByDocumentId(bigDoc.id, owner.id).length, s.ready + s.needsReview);
});

await test("run: calls that fail after being billed still count toward the limit (audit blocker)", async () => {
  const bigDoc2 = DocumentRepository.create({ userId: owner.id, originalName: "big2.pdf", mimeType: "application/pdf", storagePath: null, fileSizeBytes: 1 });
  DocumentRepository.insertPages(
    Array.from({ length: 30 }, (_, i) => ({
      documentId: bigDoc2.id,
      pageNumber: i + 1,
      rawText: Array.from({ length: 20 }, (_, j) => `Line ${i}-${j} covers rivers, deltas, estuaries and coastal plains of India.`).join(" "),
      markdown: null,
      parser: "test",
      confidence: 1,
    }))
  );
  let calls = 0;
  const truncating = {
    name: "stub",
    async completeJson() {
      calls++;
      throw new LlmError("DeepSeek output was cut off at max_tokens; the JSON is incomplete.", {
        retryable: false,
        usage: { promptCacheHitTokens: 0, promptCacheMissTokens: 3000, completionTokens: 200_000, reasoningTokens: 0 },
      });
    },
  };
  const spent = [];
  const s = await runGeneration(
    { ...baseReq, documentId: bigDoc2.id, pageTo: 30 },
    { provider: truncating, generationModel: "deepseek-v4-pro", checkModel: "deepseek-v4-pro", budgetUsd: 0.5, onSpend: (_m, usd) => spent.push(usd) }
  );
  assert.equal(s.status, "BUDGET_REACHED");
  assert.ok(s.costUsd >= 0.5, `recorded ${s.costUsd}`);
  assert.ok(calls < s.sectionsTotal, "stopped starting new sections once the limit was hit");
  assert.ok(Math.abs(spent.reduce((a, b) => a + b, 0) - s.costUsd) < 1e-9, "every dollar reaches the spend ledger");
});

await test("run: a fatal provider error (no balance) stops the run with a clear message", async () => {
  let calls = 0;
  const broke = {
    name: "stub",
    async completeJson() {
      calls++;
      throw new LlmError("DeepSeek account has insufficient balance (402). Top up and retry.", { fatal: true });
    },
  };
  const s = await runGeneration(baseReq, { ...deps, provider: broke });
  assert.equal(s.status, "FAILED");
  assert.match(s.message, /insufficient balance/);
  assert.ok(calls <= 3, "does not keep calling after a fatal error");
});

await test("run: empty page range fails cleanly", async () => {
  const s = await runGeneration({ ...baseReq, pageFrom: 50, pageTo: 60 }, deps);
  assert.equal(s.status, "FAILED");
  assert.match(s.message, /No readable text/);
});

// ---------------------------------------------------------------- queue limits
process.env.LLM_PROVIDER = "mock";
process.env.GENERATION_MAX_USD_PER_DAY = "5";

await test("queue: one run at a time across the whole server (audit finding)", async () => {
  const docB = DocumentRepository.create({ userId: owner.id, originalName: "b.pdf", mimeType: "application/pdf", storagePath: null, fileSizeBytes: 1 });
  assert.equal(GenerationQueue.start({ ...baseReq, questionsPerPage: 1 }), null);
  const block = GenerationQueue.checkCanStart(docB.id);
  assert.equal(block.status, 409);
  assert.match(block.error, /Another document/);
  const refused = GenerationQueue.start({ ...baseReq, documentId: docB.id });
  assert.equal(refused.status, 409, "a racing second start is refused with 409, not a 500");
  for (let i = 0; i < 100 && GenerationQueue.isRunning(doc.id); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(GenerationQueue.isRunning(doc.id), false);
  assert.equal(GenerationQueue.checkCanStart(docB.id), null);
});

await test("queue: the rolling daily limit blocks new runs once used up (audit finding)", () => {
  const before = GenerationQueue.dailyRemainingUsd();
  SpendRepository.add({ userId: owner.id, documentId: null, model: "deepseek-v4-pro", costUsd: before });
  assert.ok(GenerationQueue.dailyRemainingUsd() < 0.01);
  const block = GenerationQueue.checkCanStart(doc.id);
  assert.equal(block.status, 429);
  assert.match(block.error, /limit is used up/);
});

console.log(`\nAll ${passed} tests passed (temp DB: ${workDir}).`);
fs.rmSync(workDir, { recursive: true, force: true });
