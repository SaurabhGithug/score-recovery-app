// Writes the MCQ bank for a standard: Gemini writes questions from each clause's verbatim text,
// deterministic gates check them (proof quote verbatim in the clause, style, duplicates), DeepSeek
// re-solves each one blind, and only agreed questions are stored as "verified".
// (src/lib/server/standards/questions/generate.ts)
//
//   node --env-file=.env.local --import tsx scripts/generate-standard-questions.mjs \
//     --target sqlite --user <userId> --code "IS/ISO/IEC 17025:2017" [options]
//
//   --clauses 4.1,6.4   only these units            --per-clause N   override the quota per unit
//   --max-usd N         this run's cap (default 3)  --dry-run        no model calls: units, quotas, estimate
//   --force             regenerate units that already have their quota of verified questions
//   --thinking LOW|MEDIUM|HIGH   Gemini thinking for writing (default MEDIUM)
//   --export <file>     write the verified bank (QuestionExportFile); --include-review adds needs_review
//   --export-only       just write --export / --report from what is stored (no model calls)
//   --report <file>     JSON QA report (per unit: generated, rejected by reason, disagreed, verified)
//
// --target must match the database DATABASE_URL selects, so a missing URL can't silently write to
// the local file (and a set one can't be written by accident). The export file holds verbatim text
// of the standard in its proof quotes: keep it out of git.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const callerDir = process.cwd();
process.chdir(repoRoot);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);
const usage = () => {
  console.error('Usage: node --env-file=.env.local --import tsx scripts/generate-standard-questions.mjs --target sqlite|postgres --user <userId> --code "<code>" [--clauses 4.1,6.4] [--per-clause N] [--max-usd 3] [--dry-run] [--force] [--thinking MEDIUM] [--export <file> [--include-review]] [--export-only] [--report <file>]');
  process.exit(1);
};

const target = flag("--target");
const userId = flag("--user");
const code = flag("--code");
if ((target !== "sqlite" && target !== "postgres") || !userId || !code) usage();
const clauses = flag("--clauses")?.split(",").map((s) => s.trim()).filter(Boolean);
const perClause = flag("--per-clause") === undefined ? undefined : Number(flag("--per-clause"));
if (perClause !== undefined && !(Number.isInteger(perClause) && perClause >= 1 && perClause <= 20)) usage();
const maxUsd = flag("--max-usd") === undefined ? 3 : Number(flag("--max-usd"));
if (!(Number.isFinite(maxUsd) && maxUsd > 0)) usage();
const thinking = flag("--thinking")?.toUpperCase();
if (thinking !== undefined && !["LOW", "MEDIUM", "HIGH"].includes(thinking)) usage();
// Output paths are relative to where the command was run, not the repository.
const exportFile = flag("--export") && path.resolve(callerDir, flag("--export"));
const reportFile = flag("--report") && path.resolve(callerDir, flag("--report"));
const exportOnly = has("--export-only");
if (exportOnly && !exportFile && !reportFile) usage();

const { getDatabase } = await import("../src/lib/server/db.ts");
const { followUpDeps } = await import("../src/lib/server/followup/followup.ts");
const { geminiGenerate } = await import("../src/lib/server/followup/gemini.ts");
const { generateStandardQuestions, exportQuestions } = await import("../src/lib/server/standards/questions/generate.ts");

const db = getDatabase();
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
console.log(`Target: ${db.dialect}${url ? ` (${new URL(url).host.replace(/^[^@]*@/, "")})` : ` (${path.join(process.env.SCORE_RECOVERY_DATA_DIR ? path.resolve(process.env.SCORE_RECOVERY_DATA_DIR) : "data", "score_recovery.db")})`}`);
if (db.dialect !== target) {
  console.error(`Refusing: --target ${target} but DATABASE_URL selects ${db.dialect}.`);
  process.exit(1);
}
const user = await db.prepare("SELECT id, name FROM users WHERE id = ?").get(userId);
if (!user) {
  console.error(`No account ${userId}.`);
  process.exit(1);
}

// Writing ten questions with HIGH thinking can take longer than the adapter's 90 s default.
const deps = { ...followUpDeps(), gemini: (key, request) => geminiGenerate(key, request, AbortSignal.timeout(300_000)) };
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

let report = null;
try {
  report = await generateStandardQuestions(
    { userId, code, target, clauses, perClause, maxUsd, dryRun: has("--dry-run") || exportOnly, force: has("--force"), thinkingLevel: thinking, log: (line) => console.log(line) },
    deps
  );
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

if (report.dryRun && !exportOnly) {
  console.log(`\n${report.standard.code}: ${report.plan.units.length} units, quota ${report.plan.units.reduce((n, u) => n + u.quota, 0)} questions (asking for ${report.plan.units.reduce((n, u) => n + u.requested, 0)})`);
  for (const u of report.plan.units) console.log(`  ${u.clauseNo.padEnd(7)} ${String(u.chars).padStart(5)} chars  quota ${u.quota}  ask ${u.requested}  ${u.title}`);
  for (const s of report.plan.skipped) console.log(`  skip ${s.clauseNo.padEnd(6)} ${s.title}: ${s.reason}`);
  const e = report.estimate;
  console.log(`Estimate: generation ~$${e.generationUsd.toFixed(2)} + checks ~$${e.checkUsdOffPeak.toFixed(2)} (DeepSeek off-peak) to ~$${e.checkUsdPeak.toFixed(2)} (peak) = ~$${e.totalUsdOffPeak.toFixed(2)}-${e.totalUsdPeak.toFixed(2)}. Budget for a run now: $${report.budgetUsd.toFixed(2)}.`);
  console.log(e.note);
}
if (!report.dryRun) {
  const t = report.totals;
  console.log(`\nRun: requested ${t.requested}, generated ${t.generated}, rejected ${t.rejectedTotal} ${JSON.stringify(t.rejected)}, checked ${t.checked}, disagreed ${t.disagreed}, NONE ${t.none}, check failed ${t.checkFailed}, verified ${t.verified}, needs_review ${t.needsReview}; spend $${report.spendUsd.toFixed(4)}${report.stopReason ? `; STOPPED (${report.stopReason}): ${report.stopDetail}` : ""}`);
  console.log(`Checkers: ${JSON.stringify(report.checkers)}`);
}
const b = report.bank;
console.log(`Bank now: ${b.verified} verified (${b.needsReview} needs_review); key letters ${JSON.stringify(b.letters)} = ${JSON.stringify(b.letterShare)} %; correct option longest in ${b.correctLongestShare}%; levels ${JSON.stringify(b.levels)}`);

if (reportFile) {
  writeJson(reportFile, report);
  console.log(`Report: ${reportFile}`);
}
if (exportFile) {
  const file = await exportQuestions(userId, code, has("--include-review"));
  writeJson(exportFile, file);
  console.log(`Export: ${file.questions.length} questions -> ${exportFile} (contains verbatim clause text: keep it out of git)`);
}
process.exit(0);
