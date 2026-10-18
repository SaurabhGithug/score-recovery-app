/**
 * ChatGPT / Codex subscription behind the provider-neutral LlmProvider contract.
 *
 * The app runs the Codex command line (`codex exec`) on the same computer as the server. The
 * learner signs in to Codex once with their ChatGPT account (`codex login`); every AI call then
 * uses that subscription's included usage, not a per-token API key. So:
 * - OPENAI_API_KEY / CODEX_API_KEY are removed from the child's environment: if either were set,
 *   Codex would bill that key instead of the subscription.
 * - Each call runs read-only in a fresh empty folder, so the model cannot see this repository,
 *   the database or .env.local, and it cannot change anything on disk.
 * - The prompt goes in on stdin (never in arguments), the reply is read from a file.
 * - Nothing is billed per call, so usage is reported as zero and no dollar spend is recorded.
 *   The subscription has its own usage limits; hitting one is reported as a plain message.
 *
 * Environment (all optional):
 *   CODEX_BIN              path to the codex executable (default: codex on PATH)
 *   CODEX_MODEL            model passed with -m; default is whatever the account's Codex defaults to
 *   CODEX_MAX_PARALLEL     simultaneous codex runs (default 2)
 *   CODEX_TIMEOUT_MS       per-call time limit (default 240000)
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LlmError, emptyUsage, type JsonCompletionRequest, type JsonCompletionResult, type LlmProvider } from "./types";

export const CODEX_MODEL_LABEL = "codex";

const NOT_INSTALLED =
  "Codex is not installed on this computer. Open the file START-HERE.md in the app folder and follow it, or ask the person who set this up.";
const NOT_SIGNED_IN =
  "Codex is not signed in to a ChatGPT account on this computer. Run the sign-in step in START-HERE.md (the command is: codex login), then try again.";

function codexBin(): string {
  return process.env.CODEX_BIN?.trim() || "codex";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
}

/** The environment Codex runs in: a subscription login must never be overridden by an API key. */
function codexEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  return env;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: NodeJS.ErrnoException | null;
}

/** cmd.exe splits on spaces, so on Windows any argument with a space (a user-name folder in temp, say) must be quoted. */
export function quoteForWindows(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function run(args: string[], input: string | null, cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const done = (r: Omit<RunResult, "stdout" | "stderr" | "timedOut">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...r, stdout, stderr, timedOut });
    };
    // On Windows the executable is codex.cmd, which only runs through a shell. Arguments here are
    // fixed flags and a model name read from our own environment, never learner input.
    const win = process.platform === "win32";
    const child = spawn(win ? quoteForWindows(codexBin()) : codexBin(), win ? args.map(quoteForWindows) : args, { cwd, env: codexEnv(), shell: win, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => { stdout = (stdout + d).slice(-20_000); });
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-20_000); });
    child.on("error", (err) => done({ code: null, spawnError: err as NodeJS.ErrnoException }));
    child.on("close", (code) => done({ code, spawnError: null }));
    child.stdin.on("error", () => { /* the process may exit before reading; its exit code tells the story */ });
    child.stdin.end(input ?? "");
  });
}

/** Turns a failed run into the message a learner should see. */
function describeFailure(r: RunResult): LlmError {
  if (r.spawnError) {
    return new LlmError(r.spawnError.code === "ENOENT" ? NOT_INSTALLED : `Could not start Codex: ${r.spawnError.message}`, { fatal: true });
  }
  if (r.timedOut) return new LlmError("Codex took too long to answer. Try again.", { retryable: false });
  const all = `${r.stderr}\n${r.stdout}`;
  const errors = all.split("\n").filter((l) => /^\s*(ERROR|error)\b/.test(l)).join("\n");
  const text = errors || all;
  if (/not logged in|log ?in required|please (log ?in|sign ?in)|unauthori[sz]ed|\b401\b|invalid (api )?key|token (has )?expired|refresh token/i.test(text)) {
    return new LlmError(NOT_SIGNED_IN, { fatal: true });
  }
  if (/usage limit|rate limit|quota|too many requests|\b429\b|try again (later|in)/i.test(text)) {
    return new LlmError("The ChatGPT plan's Codex usage limit was reached. Wait for it to reset (it says when in the ChatGPT app) and try again.", { fatal: true });
  }
  const quoted = errors.match(/"message":"([^"]+)"/)?.[1];
  const tail = quoted ?? text.trim().split("\n").slice(-3).join(" ").slice(0, 240);
  return new LlmError(`Codex stopped with an error${tail ? `: ${tail}` : "."}`, { retryable: false });
}

class Gate {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async use<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

const EFFORT = { off: "low", low: "low", high: "high", max: "high" } as const;

export class CodexProvider implements LlmProvider {
  readonly name = "codex";
  private readonly gate = new Gate(positiveInt(process.env.CODEX_MAX_PARALLEL, 2));

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const effort = request.thinking ? EFFORT[request.reasoningEffort ?? "high"] : EFFORT.off;
    const prompt = [
      "You are the writing engine inside a study app. Answer from your own knowledge and the text below.",
      "Do not run commands, open files or browse. Reply with ONE JSON object and nothing else: no markdown fences, no commentary.",
      "",
      "INSTRUCTIONS:",
      request.system,
      "",
      "INPUT:",
      request.user,
    ].join("\n");

    let lastText = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.gate.use(() => this.once(prompt, request.model, effort));
      lastText = text;
      const parsed = parseJsonObject(text);
      if (parsed !== undefined) return { json: parsed, usage: emptyUsage(), model: request.model || CODEX_MODEL_LABEL, finishReason: "stop" };
    }
    throw new LlmError(`Codex replied, but not in the JSON form the app needs (${lastText.slice(0, 80).replace(/\s+/g, " ")}…).`, { retryable: false });
  }

  private async once(prompt: string, model: string, effort: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "codex-run-"));
    const outFile = path.join(dir, "reply.txt");
    try {
      // "codex" is this app's label, not a model name Codex knows: only an explicit CODEX_MODEL is passed on.
      const chosen = process.env.CODEX_MODEL?.trim() || (model && model !== CODEX_MODEL_LABEL && !model.startsWith("gemini-") && !model.startsWith("deepseek") ? model : "");
      const args = [
        "exec",
        "--sandbox", "read-only",
        "--skip-git-repo-check",
        // The person's own ~/.codex/config.toml may pick a model their plan can't use (seen on
        // 2026-10-12: gpt-6-sol rejected for a ChatGPT account); the sign-in itself is kept.
        "--ignore-user-config",
        "--output-last-message", outFile,
        ...(chosen ? ["-m", chosen] : []),
        "-c", `model_reasoning_effort="${effort}"`,
        "-",
      ];
      const r = await run(args, prompt, dir, positiveInt(process.env.CODEX_TIMEOUT_MS, 240_000));
      if (r.code !== 0 || r.spawnError || r.timedOut) throw describeFailure(r);
      let reply = "";
      try {
        reply = (await readFile(outFile, "utf8")).trim();
      } catch {
        reply = r.stdout.trim();
      }
      if (!reply) throw new LlmError("Codex returned an empty reply.", { retryable: false });
      return reply;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** The first complete JSON object in a reply, tolerating fences or a sentence around it; undefined when there is none. */
export function parseJsonObject(text: string): unknown | undefined {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to scanning for a balanced object
  }
  const start = cleaned.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(cleaned.slice(start, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export interface CodexStatus {
  installed: boolean;
  signedIn: boolean;
  /** One plain sentence for the person using the app. */
  message: string;
}

let cached: { at: number; status: CodexStatus } | null = null;

/** Is Codex installed and signed in to ChatGPT? Cached for 20 seconds; never starts a model call. */
export async function codexStatus(force = false): Promise<CodexStatus> {
  if (!force && cached && Date.now() - cached.at < 20_000) return cached.status;
  const dir = await mkdtemp(path.join(tmpdir(), "codex-status-"));
  let status: CodexStatus;
  try {
    const r = await run(["login", "status"], null, dir, 15_000);
    if (r.spawnError) {
      status = { installed: false, signedIn: false, message: r.spawnError.code === "ENOENT" ? NOT_INSTALLED : `Could not start Codex: ${r.spawnError.message}` };
    } else {
      const text = `${r.stdout}\n${r.stderr}`;
      const signedIn = r.code === 0 && /logged in/i.test(text) && !/not logged in/i.test(text);
      status = signedIn
        ? { installed: true, signedIn: true, message: /chatgpt/i.test(text) ? "Signed in to ChatGPT." : "Signed in, but not with a ChatGPT account (an API key would be billed per use). Run: codex logout, then codex login." }
        : { installed: true, signedIn: false, message: NOT_SIGNED_IN };
      if (signedIn && !/chatgpt/i.test(text)) status.signedIn = false;
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  cached = { at: Date.now(), status };
  return status;
}
