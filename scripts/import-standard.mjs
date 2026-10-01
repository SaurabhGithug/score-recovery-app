// Local:      npx tsx scripts/import-standard.mjs --target sqlite --user <userId> --pdf <file.pdf> --code "IS/ISO/IEC 17025:2017" --title "<title>"
// Production: node --env-file=.env.production.local --import tsx scripts/import-standard.mjs --target postgres --user ... (same flags)
// --target must match the database DATABASE_URL selects, so a missing URL can't silently write to the local file.
// Extracts the standard's text with pdftotext (poppler), splits it into clauses
// (src/lib/server/standards/parse.ts) and stores it for that one account. Idempotent: the same
// PDF again changes nothing and keeps the cached AI lessons.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const userId = flag("--user");
const pdf = flag("--pdf");
const code = flag("--code");
const title = flag("--title");
const target = flag("--target");
if (!userId || !pdf || !code || !title || (target !== "sqlite" && target !== "postgres")) {
  console.error('Usage: npx tsx scripts/import-standard.mjs --target sqlite|postgres --user <userId> --pdf <file.pdf> --code "<code>" --title "<title>"');
  process.exit(1);
}

const text = execFileSync("pdftotext", ["-layout", path.resolve(pdf), "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const { parseStandard } = await import("../src/lib/server/standards/parse.ts");
const { StandardsRepository } = await import("../src/lib/server/standards/repo.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");

const db = getDatabase();
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
console.log(`Target: ${db.dialect}${url ? ` (${new URL(url).host.replace(/^[^@]*@/, "")})` : " (data/score_recovery.db)"}`);
if (db.dialect !== target) {
  console.error(`Refusing: --target ${target} but DATABASE_URL selects ${db.dialect}.`);
  process.exit(1);
}
const user = await db.prepare("SELECT id, name FROM users WHERE id = ?").get(userId);
if (!user) {
  console.error(`No account ${userId}.`);
  process.exit(1);
}
const units = parseStandard(text);
const result = await StandardsRepository.importStandard({ ownerUserId: userId, code, title, sourceName: path.basename(pdf), units });
console.log(`${result.changed ? "Imported" : "Unchanged"}: ${code} for ${user.name} (${userId}) → ${result.id}, ${units.length} clauses.`);
process.exit(0);
