#!/usr/bin/env node
// Stand-in for the Codex CLI in tests. FAKE_CODEX_MODE picks the behaviour; FAKE_CODEX_LOG records what it was given.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const mode = process.env.FAKE_CODEX_MODE || "ok";
if (args[0] === "login" && args[1] === "status") {
  if (mode === "signed-out") { console.error("Not logged in"); process.exit(1); }
  console.log(mode === "api-key" ? "Logged in using an API key - sk-***" : "Logged in using ChatGPT");
  process.exit(0);
}
const stdin = readFileSync(0, "utf8");
if (process.env.FAKE_CODEX_LOG) appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args, stdin, cwd: process.cwd(), openai: process.env.OPENAI_API_KEY ?? null, codexKey: process.env.CODEX_API_KEY ?? null }) + "\n");
if (mode === "not-logged-in") { console.error("ERROR: Not logged in. Please run codex login"); process.exit(1); }
if (mode === "limit") { console.error("You've hit your usage limit. Try again in 3 hours."); process.exit(1); }
const out = args[args.indexOf("--output-last-message") + 1];
const demo = stdin.includes("You check a tutor's answer")
  ? '{"verdict":"consistent","issues":[],"keyConcern":false}'
  : stdin.includes('{"answer"') ? JSON.stringify({ answer: "[Demo reply from the stand-in Codex — the real one answers here.]\n\nThis is where ChatGPT's explanation of your question will appear, using your Codex plan." }) : null;
const reply = demo ?? stdin.includes('"sum": 4') ? '{"sum": 4}' : mode === "fenced" ? 'Sure!\n```json\n{"answer":"B"}\n```' : mode === "prose" ? "I think the answer is B." : '{"answer":"B"}';
writeFileSync(out, reply);
