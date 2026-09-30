// GeminiProvider (the LlmProvider used by AI explanations, question generation and the tutor when
// DeepSeek isn't set up), Gemini pricing and provider selection. Fakes only: no network.
import assert from "node:assert/strict";

const { GeminiProvider } = await import("../src/lib/server/llm/gemini-provider.ts");
const { GeminiError } = await import("../src/lib/server/followup/gemini.ts");
const { LlmError } = await import("../src/lib/server/llm/types.ts");
const { costUsd } = await import("../src/lib/server/generation/pricing.ts");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

const ok = (text, usage = { promptTokens: 1000, outputTokens: 400, searchQueries: 0 }, usageKnown = true) => ({ text, finishReason: "STOP", usage, grounded: false, sources: [], searchEntryPointHtml: null, usageKnown });
const request = { model: "gemini-3.8-flash", system: "S".repeat(300), user: "U".repeat(600), thinking: true, maxTokens: 4000 };

await test("a JSON reply comes back parsed, with usage as billed (thinking counted as output)", async () => {
  let sent;
  const provider = new GeminiProvider("k", async (_key, req) => { sent = req; return ok('{"answer":"B"}'); });
  const result = await provider.completeJson(request);
  assert.deepEqual(result.json, { answer: "B" });
  assert.deepEqual(result.usage, { promptCacheHitTokens: 0, promptCacheMissTokens: 1000, completionTokens: 400, reasoningTokens: 0 });
  assert.equal(sent.json, true);
  assert.equal(sent.grounded, false);
  assert.equal(sent.thinkingLevel, "HIGH");
  assert.ok(sent.maxOutputTokens <= 3 * request.maxTokens, "stays inside the caller's 3 × maxTokens reservation");
  assert.ok(sent.maxOutputTokens > request.maxTokens, "thinking gets headroom (Gemini counts it inside the limit)");
});

await test("non-thinking calls use MEDIUM (LOW when the reply is tiny); low effort uses LOW; limits stay inside Gemini's 65,536", async () => {
  const sent = [];
  const provider = new GeminiProvider("k", async (_key, req) => { sent.push(req); return ok("{}"); });
  await provider.completeJson({ ...request, thinking: false });
  await provider.completeJson({ ...request, reasoningEffort: "low" });
  await provider.completeJson({ ...request, thinking: false, maxTokens: 200 });
  await provider.completeJson({ ...request, thinking: true, maxTokens: 64000 });
  assert.deepEqual(sent.map((r) => r.thinkingLevel), ["MEDIUM", "LOW", "LOW", "HIGH"]);
  assert.equal(sent[2].maxOutputTokens, 600, "tutor-sized request: 3 × 200");
  assert.equal(sent[3].maxOutputTokens, 65536, "question generation's 64,000 is capped at the model limit");
});

await test("a timeout or unreadable reply is charged at the worst case; so is a reply without usage figures", async () => {
  const timeout = new GeminiProvider("k", async () => { throw new GeminiError("Could not reach Google: timeout", 0, null, true); });
  await assert.rejects(timeout.completeJson(request), (err) => err instanceof LlmError && err.usage.completionTokens > request.maxTokens && err.usage.promptCacheMissTokens === 300);
  const noUsage = new GeminiProvider("k", async () => ok('{"a":1}', { promptTokens: 0, outputTokens: 0, searchQueries: 0 }, false));
  const result = await noUsage.completeJson(request);
  assert.ok(result.usage.completionTokens > request.maxTokens);
});

await test("a rejected key is fatal; a quota refusal isn't retried; a reply that isn't JSON is billed and refused", async () => {
  const badKey = new GeminiProvider("k", async () => { throw new GeminiError("API key not valid. Please pass a valid API key.", 400); });
  await assert.rejects(badKey.completeJson(request), (err) => err instanceof LlmError && err.fatal);
  const quota = new GeminiProvider("k", async () => { throw new GeminiError("You exceeded your current quota", 429); });
  await assert.rejects(quota.completeJson(request), (err) => err instanceof LlmError && err.fatal && /quota/.test(err.message), "a quota refusal stops the run instead of failing every question");
  const prose = new GeminiProvider("k", async () => ok("Sure! The answer is B."));
  await assert.rejects(prose.completeJson(request), (err) => err instanceof LlmError && err.usage.promptCacheMissTokens === 1000);
});

await test("Gemini calls are priced at Google's rates (no DeepSeek off-peak discount)", () => {
  const usage = { promptCacheHitTokens: 0, promptCacheMissTokens: 1_000_000, completionTokens: 1_000_000, reasoningTokens: 0 };
  assert.equal(costUsd("gemini-3.8-flash", usage, new Date("2026-10-01T02:00:00Z")), 0.75 + 3.75);
  assert.equal(costUsd("gemini-3.8-flash", usage, new Date("2027-02-01T02:00:00Z")), 1.5 + 7.5);
  assert.equal(costUsd("gemini-3.1-pro-preview", usage), 2 + 12);
  assert.equal(costUsd("gemini-unknown-model", usage), 4 + 18, "unknown Gemini models at the dearest rate");
  assert.equal(costUsd("gemini-3.8-flash", usage, new Date("2026-01-05T07:00:00Z"), true), 1.5 + 7.5, "reservations ignore the introductory price");
});

await test("without a DeepSeek key the app picks Gemini; with one it keeps DeepSeek; LLM_PROVIDER overrides", async () => {
  const saved = { ...process.env };
  const { getLlmSetup } = await import("../src/lib/server/llm/index.ts");
  try {
    delete process.env.LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = "";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-test";
    let setup = getLlmSetup();
    assert.equal(setup.provider.name, "google");
    assert.equal(setup.generationModel, "gemini-3.8-flash");
    assert.equal(setup.checkModel, "gemini-3.8-flash");
    process.env.DEEPSEEK_API_KEY = "d-test";
    setup = getLlmSetup();
    assert.equal(setup.provider.name, "google+deepseek", "both keys: Gemini writes, DeepSeek re-solves");
    assert.equal(setup.generationModel, "gemini-3.8-flash");
    assert.equal(setup.checkModel, "deepseek-v4-pro", "AI-generated questions (no source key) are re-solved by the other vendor");
    assert.equal(setup.explainCheckModel, "gemini-3.8-flash", "past-paper explanations are anchored to the source key: the more accurate model solves");
    process.env.LLM_PROVIDER = "deepseek";
    assert.equal(getLlmSetup().provider.name, "deepseek");
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
    delete process.env.LLM_PROVIDER;
    assert.equal(getLlmSetup().provider.name, "deepseek", "only DeepSeek set");
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-test";
    process.env.LLM_PROVIDER = "google";
    assert.equal(getLlmSetup().provider.name, "google");
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
    assert.equal(getLlmSetup().configured, false);
  } finally {
    process.env = saved;
  }
});

await test("the mixed provider sends gemini-* models to Google and the rest to DeepSeek", async () => {
  const { MixedProvider } = await import("../src/lib/server/llm/mixed-provider.ts");
  const seen = [];
  const fake = (name) => ({ name, async completeJson(req) { seen.push(`${name}:${req.model}`); return { json: {}, usage: { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0, reasoningTokens: 0 }, model: req.model, finishReason: "stop" }; } });
  const mixed = new MixedProvider(fake("google"), fake("deepseek"));
  await mixed.completeJson({ ...request, model: "gemini-3.8-flash" });
  await mixed.completeJson({ ...request, model: "deepseek-v4-pro" });
  assert.deepEqual(seen, ["google:gemini-3.8-flash", "deepseek:deepseek-v4-pro"]);
});

console.log(`\n${passed} tests passed`);
