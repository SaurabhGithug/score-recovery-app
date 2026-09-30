// Run with: npx tsx scripts/import-pyp.mjs [--dir <parsed-json-dir>] [--json]
// Imports data/pyp-sources/parsed/*.json (services/pyp-extract output) into the shared question
// bank in data/score_recovery.db. Idempotent: safe to re-run whenever new parsed files appear.
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot); // getDatabase() and crop paths resolve from cwd

const args = process.argv.slice(2);
const dirFlag = args.indexOf("--dir");
const dir = dirFlag >= 0 ? path.resolve(args[dirFlag + 1]) : undefined;
const asJson = args.includes("--json");

const { importPypDirectory } = await import("../src/lib/server/bank/import-pyp.ts");
const report = importPypDirectory({ dir });

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const STATUSES = ["official", "corroborated", "ai_checked", "single_source", "reviewed", "disputed", "dropped", "no_key"];
console.log(`Imported ${report.papers.length} paper(s).\n`);
for (const p of report.papers) {
  const keys = STATUSES.filter((s) => p.keyStatus[s]).map((s) => `${s}=${p.keyStatus[s]}`).join(" ");
  console.log(`${p.paperId}  ${p.questions} q  [${p.languages.join("+")}]  ${keys}  evidence=${p.evidenceRows}${p.deletedQuestions ? `  removed=${p.deletedQuestions}` : ""}`);
  for (const f of p.files) {
    console.log(`    ${f.role.padEnd(7)} ${f.file}  (${f.language ?? "?"}${f.method ? `, ${f.method}` : ""}, ${f.matched}/${f.total})`);
  }
  if (p.unmatched.length) {
    const byReason = new Map();
    for (const u of p.unmatched) byReason.set(`${u.file}: ${u.reason}`, (byReason.get(`${u.file}: ${u.reason}`) ?? 0) + 1);
    for (const [reason, n] of byReason) console.log(`    unmatched ×${n}  ${reason}`);
  }
}
if (report.skippedFiles.length) {
  console.log("\nFiles not imported / not merged:");
  for (const s of report.skippedFiles) console.log(`  ${s.file}: ${s.reason}`);
}
