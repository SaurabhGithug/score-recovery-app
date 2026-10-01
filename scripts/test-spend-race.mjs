// Run with: npx tsx scripts/test-spend-race.mjs
// Optional Postgres run (use a THROWAWAY database or Neon branch, never production):
//   TEST_DATABASE_URL=postgres://... npx tsx scripts/test-spend-race.mjs
//
// Checks that SpendRepository.reserve() holds the daily AI cap when many server processes reserve
// at the same moment. Each worker is a separate Node process with its own connection, released
// together at one start time. The cap fits exactly CAP_SLOTS reservations, so at most that many may
// succeed. On Postgres a control run repeats the race with the same SQL but no advisory lock, to
// show the race the lock prevents (a control that happens not to overspend is reported, not failed).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKERS = 12;
const CAP_SLOTS = 3;
const USD = 1;

const WORKER = `
const { SpendRepository } = await import(${JSON.stringify(path.join(repoRoot, "src/lib/server/repositories/spend-repo.ts"))});
const { getDatabase } = await import(${JSON.stringify(path.join(repoRoot, "src/lib/server/db.ts"))});
const [startAt, since, cap, usd, userId, mode] = process.argv.slice(1);
const db = getDatabase();
await db.prepare("SELECT 1").get(); // connect before the start line
while (Date.now() < Number(startAt)) await new Promise((r) => setTimeout(r, 1));
let id = null;
if (mode === "nolock") {
  // Control: the same check-then-insert in a transaction, without the advisory lock.
  id = await db.transaction(async () => {
    const row = await db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_spend WHERE created_at >= ?").get(since);
    if (Number(row.total) + Number(usd) > Number(cap)) return null;
    const rid = "spend_" + Math.random().toString(16).slice(2, 18);
    await db.prepare("INSERT INTO llm_spend (id, user_id, document_id, model, cost_usd, created_at) VALUES (?, ?, NULL, ?, ?, ?)").run(rid, userId, "race-test", Number(usd), new Date().toISOString());
    return rid;
  });
} else {
  id = await SpendRepository.reserve({ userId, model: "race-test", usd: Number(usd), capUsd: Number(cap), since: new Date(since) });
}
process.stdout.write(id ? "OK" : "REFUSED");
process.exit(0);
`;

function runWorker(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", WORKER, ...args], { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`worker exited ${code}: ${err.split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim()}`))));
  });
}

async function race(env, userId, mode) {
  const since = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 5)); // rows from earlier runs fall before `since`
  const startAt = Date.now() + 4000; // time for every worker to boot and connect
  const results = await Promise.all(Array.from({ length: WORKERS }, () => runWorker(env, [String(startAt), since, String(CAP_SLOTS * USD), String(USD), userId, mode])));
  return results.filter((r) => r === "OK").length;
}

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n  ${err.message}`);
  }
}

// ---------------------------------------------------------------- SQLite (always)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spend-race-"));
const sqliteEnv = { ...process.env, SCORE_RECOVERY_DATA_DIR: dataDir };
delete sqliteEnv.DATABASE_URL;
delete sqliteEnv.POSTGRES_URL;
delete sqliteEnv.POSTGRES_PRISMA_URL;
process.env.SCORE_RECOVERY_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
const { getDatabase } = await import("../src/lib/server/db.ts");
await getDatabase().prepare("SELECT 1").get(); // creates the schema once, before the workers race

await test(`sqlite: ${WORKERS} processes racing a ${CAP_SLOTS}-slot cap get exactly ${CAP_SLOTS}`, async () => {
  const ok = await race(sqliteEnv, "race_sqlite", "lock");
  assert.equal(ok, CAP_SLOTS, `${ok} reservations succeeded`);
});
fs.rmSync(dataDir, { recursive: true, force: true });

// ---------------------------------------------------------------- Postgres (opt-in)
const pgUrl = process.env.TEST_DATABASE_URL;
if (!pgUrl) {
  console.log("- postgres: skipped (set TEST_DATABASE_URL to a throwaway database or Neon branch)");
} else {
  const host = new URL(pgUrl).host.replace(/^[^@]*@/, "");
  console.log(`  postgres target: ${host}`);
  const pgEnv = { ...process.env, DATABASE_URL: pgUrl };
  delete pgEnv.SCORE_RECOVERY_DATA_DIR;
  const postgres = (await import("postgres")).default;
  const sql = postgres(pgUrl, { max: 1, prepare: false, ssl: "require" });
  const tag = `race_${crypto.randomBytes(4).toString("hex")}`;
  try {
    // llm_spend rows reference no other table, so test rows need no fixture user.
    await test(`postgres: ${WORKERS} instances racing a ${CAP_SLOTS}-slot cap never exceed it (advisory lock)`, async () => {
      const ok = await race(pgEnv, `${tag}_lock`, "lock");
      assert.ok(ok <= CAP_SLOTS, `${ok} reservations succeeded against a cap of ${CAP_SLOTS}`);
      assert.equal(ok, CAP_SLOTS, `only ${ok} of ${CAP_SLOTS} slots were used`);
    });
    const controlOk = await race(pgEnv, `${tag}_nolock`, "nolock");
    console.log(`  control without the lock: ${controlOk} of ${WORKERS} succeeded against a cap of ${CAP_SLOTS}${controlOk > CAP_SLOTS ? " → the race is real" : " (race not reproduced this run)"}`);
  } finally {
    const removed = await sql`DELETE FROM llm_spend WHERE user_id LIKE ${tag + "%"}`;
    console.log(`  cleaned up ${removed.count} test rows`);
    await sql.end();
  }
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
