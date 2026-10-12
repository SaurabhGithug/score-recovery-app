// One-time setup for a second computer. Safe to run again. Run from the app folder:
//   node scripts/setup-second-laptop.mjs
// Steps: Node version, npm install, .env.local, Codex sign-in + live test, a double-click launcher.
// Prints one line "SETUP: READY" or "SETUP: NEEDS <thing>" at the end, with the plain-words next step.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
process.chdir(root);
const win = process.platform === "win32";
const say = (m) => console.log(m);
const stop = (needs, words) => { say(`\nSETUP: NEEDS ${needs}\n${words}`); process.exit(1); };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: win, ...opts });

// 1. Node
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  stop("NODE", `Node.js ${process.versions.node} is too old. Install the current LTS from https://nodejs.org (Windows: winget install OpenJS.NodeJS.LTS), close and reopen the terminal, run this again.`);
}
say(`Node ${process.versions.node} OK`);

// 2. Packages
if (!fs.existsSync("node_modules/next")) {
  say("Installing the app's packages (a few minutes the first time)...");
  if (sh("npm", ["install", "--no-audit", "--no-fund"]).status !== 0) stop("NETWORK", "npm install failed. Check the internet connection and run this again.");
}

// 3. .env.local: private settings come from the file Saurabh sends (.env.civil-laptop). Never printed.
if (!fs.existsSync(".env.local")) {
  if (!fs.existsSync(".env.civil-laptop")) {
    stop("ENV_FILE", "The private settings file is missing. Ask Saurabh to send the file named .env.civil-laptop, put it in this folder (next to package.json), then run this again.");
  }
  fs.copyFileSync(".env.civil-laptop", ".env.local");
  say("Created .env.local from .env.civil-laptop");
}
let env = fs.readFileSync(".env.local", "utf8");
const want = { LLM_PROVIDER: "codex", FOLLOWUP_PROVIDER: "codex" };
for (const [k, v] of Object.entries(want)) {
  const line = new RegExp(`^${k}=.*$`, "m");
  env = line.test(env) ? env.replace(line, `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`;
}
// An API key in the environment would bill that key instead of the ChatGPT plan.
env = env.replace(/^(OPENAI_API_KEY|CODEX_API_KEY)=.*\n?/gm, "");
fs.writeFileSync(".env.local", env);
say("AI is set to ChatGPT (Codex) in .env.local");
if (!/^DATABASE_URL=\S+/m.test(env)) say("NOTE: no DATABASE_URL in .env.local, so the app will start with an EMPTY local database (no questions). Ask Saurabh for the right .env.civil-laptop.");

// 4. Codex sign-in and a real test
const check = spawnSync("npx", ["tsx", "scripts/check-codex.mjs"], { stdio: "inherit", shell: win });
if (check.status === 2) stop("CODEX_INSTALL", "Codex is not installed. Install it (npm install -g @openai/codex), then run this again.");
if (check.status === 3) stop("CODEX_LOGIN", "Sign in to Codex with the ChatGPT account: run  codex login  , finish in the browser window that opens, then run this again.");
if (check.status !== 0) stop("CODEX_FIX", "Codex answered with an error (see above). Fix it, then run this again.");

// 5. Double-click launcher
if (win) {
  fs.writeFileSync("Start Score Recovery.bat", '@echo off\r\ncd /d "%~dp0"\r\nstart "" cmd /c "timeout /t 10 >nul & start http://localhost:3000"\r\necho Score Recovery is running. Keep this window open while you study. Close it to stop.\r\nnpm run dev\r\n');
} else {
  fs.writeFileSync("Start Score Recovery.command", '#!/bin/bash\ncd "$(dirname "$0")"\n(sleep 8; open http://localhost:3000) &\necho "Score Recovery is running. Keep this window open while you study. Close it to stop."\nnpm run dev\n');
  fs.chmodSync("Start Score Recovery.command", 0o755);
}
say(`\nSETUP: READY\nDouble-click "${win ? "Start Score Recovery.bat" : "Start Score Recovery.command"}" in this folder, wait a few seconds, and the app opens at http://localhost:3000 — pick the Civil profile.`);
