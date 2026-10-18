// CodexProvider: the ChatGPT-subscription LlmProvider. Uses a fake `codex` executable: no network, no account.
import assert from "node:assert/strict";
import { readFileSync, rmSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const fake = path.resolve("scripts/fixtures/fake-codex.mjs");
chmodSync(fake, 0o755);
const log = path.join(tmpdir(), `fake-codex-${process.pid}.log`);
process.env.CODEX_BIN = fake;
process.env.FAKE_CODEX_LOG = log;

const { CodexProvider, codexStatus, parseJsonObject, quoteForWindows } = await import("../src/lib/server/llm/codex-provider.ts");
const { costUsd } = await import("../src/lib/server/generation/pricing.ts");
const { LlmError } = await import("../src/lib/server/llm/types.ts");

let passed = 0;
async function test(name, fn) { rmSync(log, { force: true }); delete process.env.FAKE_CODEX_MODE; await fn(); passed++; console.log(`✓ ${name}`); }
const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const request = { model: "codex", system: "SYSTEM-TEXT", user: "USER-TEXT", thinking: true, maxTokens: 1000 };

await test("a JSON reply comes back parsed, with zero billed usage", async () => {
  const r = await new CodexProvider().completeJson(request);
  assert.deepEqual(r.json, { answer: "B" });
  assert.deepEqual(r.usage, { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0, reasoningTokens: 0 });
  assert.equal(costUsd("codex", { promptCacheHitTokens: 9e6, promptCacheMissTokens: 9e6, completionTokens: 9e6, reasoningTokens: 0 }), 0);
});

await test("runs read-only in an empty temp folder, prompt on stdin, API keys removed", async () => {
  process.env.OPENAI_API_KEY = "sk-should-not-leak";
  process.env.CODEX_API_KEY = "also-not";
  await new CodexProvider().completeJson(request);
  delete process.env.OPENAI_API_KEY; delete process.env.CODEX_API_KEY;
  const [c] = calls();
  assert.deepEqual(c.args.slice(0, 5), ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ignore-user-config"]);
  assert.equal(c.args.at(-1), "-");
  assert.ok(!c.args.some((a) => a.includes("SYSTEM-TEXT") || a.includes("USER-TEXT")), "prompt is never an argument");
  assert.ok(c.stdin.includes("SYSTEM-TEXT") && c.stdin.includes("USER-TEXT"));
  assert.ok(c.cwd.includes("codex-run-") && !c.cwd.startsWith(process.cwd()), "empty temp folder, not the repo");
  assert.equal(c.openai, null); assert.equal(c.codexKey, null);
  assert.ok(!c.args.includes("-m"), "no model forced unless CODEX_MODEL is set");
});

await test("effort follows thinking; CODEX_MODEL is passed on as -m", async () => {
  process.env.CODEX_MODEL = "gpt-test";
  await new CodexProvider().completeJson({ ...request, thinking: false });
  delete process.env.CODEX_MODEL;
  const [c] = calls();
  assert.equal(c.args[c.args.indexOf("-m") + 1], "gpt-test");
  assert.ok(c.args.includes('model_reasoning_effort="low"'));
});

await test("a reply wrapped in prose and fences is still read", async () => {
  process.env.FAKE_CODEX_MODE = "fenced";
  assert.deepEqual((await new CodexProvider().completeJson(request)).json, { answer: "B" });
});

await test("a reply with no JSON is retried once, then refused", async () => {
  process.env.FAKE_CODEX_MODE = "prose";
  await assert.rejects(new CodexProvider().completeJson(request), (e) => e instanceof LlmError && !e.fatal && /not in the JSON form/.test(e.message));
  assert.equal(calls().length, 2);
});

await test("signed out → fatal, tells the user to sign in; no retry", async () => {
  process.env.FAKE_CODEX_MODE = "not-logged-in";
  await assert.rejects(new CodexProvider().completeJson(request), (e) => e instanceof LlmError && e.fatal && /codex login/.test(e.message));
  assert.equal(calls().length, 1);
});

await test("usage limit → fatal with a plain message", async () => {
  process.env.FAKE_CODEX_MODE = "limit";
  await assert.rejects(new CodexProvider().completeJson(request), (e) => e instanceof LlmError && e.fatal && /usage limit/i.test(e.message));
});

await test("Codex not installed → fatal 'not installed'", async () => {
  process.env.CODEX_BIN = "/nonexistent/codex";
  await assert.rejects(new CodexProvider().completeJson(request), (e) => e instanceof LlmError && e.fatal && /not installed/i.test(e.message));
  process.env.CODEX_BIN = fake;
});

await test("at most CODEX_MAX_PARALLEL runs at once", async () => {
  process.env.CODEX_MAX_PARALLEL = "1";
  const p = new CodexProvider();
  const rs = await Promise.all([1, 2, 3].map(() => p.completeJson(request)));
  delete process.env.CODEX_MAX_PARALLEL;
  assert.equal(rs.length, 3);
});

await test("status: signed in with ChatGPT / signed out / API key counts as not subscription", async () => {
  assert.equal((await codexStatus(true)).signedIn, true);
  process.env.FAKE_CODEX_MODE = "signed-out";
  assert.equal((await codexStatus(true)).signedIn, false);
  process.env.FAKE_CODEX_MODE = "api-key";
  const s = await codexStatus(true);
  assert.equal(s.signedIn, false); assert.match(s.message, /API key/);
  process.env.CODEX_BIN = "/nonexistent/codex";
  assert.equal((await codexStatus(true)).installed, false);
  process.env.CODEX_BIN = fake;
  delete process.env.FAKE_CODEX_MODE;
  await codexStatus(true);
});

await test("parseJsonObject: plain, fenced, surrounded, braces inside strings, none", () => {
  assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonObject('text {"a":"}{"} tail'), { a: "}{" });
  assert.equal(parseJsonObject("no json"), undefined);
  assert.equal(parseJsonObject('{"a":'), undefined);
});

await test("Windows quoting: spaces and quotes are protected, plain args untouched", () => {
  assert.equal(quoteForWindows("exec"), "exec");
  assert.equal(quoteForWindows("C:\\Users\\Some Name\\Temp\\reply.txt"), '"C:\\Users\\Some Name\\Temp\\reply.txt"');
  assert.equal(quoteForWindows('model_reasoning_effort="low"'), '"model_reasoning_effort=\\"low\\""');
});

rmSync(log, { force: true });
console.log(`\n${passed} passed`);
