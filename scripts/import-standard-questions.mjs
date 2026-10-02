// Imports a question file written by scripts/generate-standard-questions.mjs --export into a
// database (for example the local bank into production), re-validating every question against the
// standard's CURRENT text there: shape, four distinct options, key among them, no letter
// references, proof quote verbatim in the clause, clause fingerprint unchanged, status verified
// (needs_review only with --include-review). Bad entries are skipped with their reason; a unit with
// no valid entries keeps the questions it has. (src/lib/server/standards/questions/import.ts)
//
//   node --import tsx scripts/import-standard-questions.mjs --target sqlite --user <userId> --file <export.json> [--include-review]
//
// --target must match the database DATABASE_URL selects, so a missing URL can't silently write to
// the local file.
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
const target = flag("--target");
const userId = flag("--user");
const file = flag("--file") && path.resolve(callerDir, flag("--file"));
if ((target !== "sqlite" && target !== "postgres") || !userId || !file) {
  console.error("Usage: node --import tsx scripts/import-standard-questions.mjs --target sqlite|postgres --user <userId> --file <export.json> [--include-review]");
  process.exit(1);
}

const { getDatabase } = await import("../src/lib/server/db.ts");
const { importQuestionFile } = await import("../src/lib/server/standards/questions/import.ts");

const db = getDatabase();
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
console.log(`Target: ${db.dialect}${url ? ` (${new URL(url).host.replace(/^[^@]*@/, "")})` : " (local SQLite)"}`);
if (db.dialect !== target) {
  console.error(`Refusing: --target ${target} but DATABASE_URL selects ${db.dialect}.`);
  process.exit(1);
}
const user = await db.prepare("SELECT id, name FROM users WHERE id = ?").get(userId);
if (!user) {
  console.error(`No account ${userId}.`);
  process.exit(1);
}

let json;
try {
  json = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (err) {
  console.error(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

try {
  const r = await importQuestionFile(userId, json, { target, includeReview: args.includes("--include-review") });
  for (const w of r.warnings) console.log(`Warning: ${w}`);
  console.log(`${r.code} (${r.standardId}): ${r.imported} of ${r.entries} imported.`);
  for (const [clauseNo, u] of Object.entries(r.units)) {
    console.log(`  ${clauseNo.padEnd(7)} imported ${u.imported}, skipped ${u.skipped}${u.replaced ? "" : " (existing questions kept)"}`);
  }
  if (r.skipped.length) {
    console.log(`Skipped ${r.skipped.length}: ${JSON.stringify(r.skippedByReason)}`);
    for (const s of r.skipped) console.log(`  #${s.index} [${s.clauseNo || "?"}] ${s.reason}: ${s.detail}`);
  }
  process.exit(0);
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
