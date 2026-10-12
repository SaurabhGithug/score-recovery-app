// Proves the app can use ChatGPT through Codex on THIS computer: Codex installed, signed in with a
// ChatGPT account, and one tiny real answer comes back as JSON. Uses a few seconds of the plan's Codex usage.
// Run: npx tsx scripts/check-codex.mjs
const { codexStatus, CodexProvider } = await import("../src/lib/server/llm/codex-provider.ts");

const status = await codexStatus(true);
console.log(status.message);
if (!status.installed) { console.log("RESULT: NEEDS_CODEX_INSTALL"); process.exit(2); }
if (!status.signedIn) { console.log("RESULT: NEEDS_LOGIN"); process.exit(3); }

try {
  const r = await new CodexProvider().completeJson({
    model: "codex", system: 'Reply with exactly this JSON and nothing else: {"sum": 4}', user: "What is 2 + 2?", thinking: false, maxTokens: 50,
  });
  if (r.json?.sum !== 4) throw new Error(`unexpected reply ${JSON.stringify(r.json)}`);
  console.log("RESULT: OK — the app can answer through your ChatGPT plan.");
} catch (err) {
  console.log(`RESULT: FAILED — ${err.message}`);
  process.exit(4);
}
