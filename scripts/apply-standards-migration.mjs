#!/usr/bin/env node
// Applies migrations/0010_standards.sql (four new tables with row level security, nothing else) to the Postgres database in
// DATABASE_URL, in one transaction. Additive only: CREATE TABLE IF NOT EXISTS and ENABLE ROW LEVEL
// SECURITY on those new tables, so re-running it changes nothing and no existing table or row is touched.
//
//   node --env-file=.env.production.local scripts/apply-standards-migration.mjs --dry-run
//   node --env-file=.env.production.local scripts/apply-standards-migration.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!connection) throw new Error("Set DATABASE_URL to the production Postgres connection string.");
const dryRun = process.argv.includes("--dry-run");

const ddl = fs.readFileSync(path.join(repoRoot, "migrations", "0010_standards.sql"), "utf8");
const statements = ddl
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
for (const s of statements) {
  const allowed =
    /^CREATE TABLE IF NOT EXISTS standard(s|_clauses|_lessons|_answer_checks) \(/.test(s) ||
    /^ALTER TABLE standard(s|_clauses|_lessons|_answer_checks) ENABLE ROW LEVEL SECURITY$/.test(s);
  if (!allowed) {
    throw new Error(`Refusing: unexpected statement in 0010_standards.sql:\n${s.slice(0, 200)}`);
  }
}

const NEW_TABLES = ["standards", "standard_clauses", "standard_lessons", "standard_answer_checks"];
const sql = postgres(connection, { max: 1, prepare: false, ssl: "require" });
try {
  const host = new URL(connection).host.replace(/^[^@]*@/, "");
  const tables = async () =>
    (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`).map((r) => r.table_name);
  const before = await tables();
  const users = await sql`SELECT id, name FROM users WHERE normalized_name IN ('saurabh', 'reema') ORDER BY name`;
  console.log(`Database host: ${host}`);
  console.log(`Tables before: ${before.length}. Already present: ${NEW_TABLES.filter((t) => before.includes(t)).join(", ") || "none"}.`);
  console.log(`Real accounts: ${users.map((u) => `${u.name}=${u.id}`).join(", ") || "none found"}`);
  if (!before.includes("users")) throw new Error("No users table: this is not the app's database.");
  if (dryRun) {
    console.log(`Dry run: would run ${statements.length} statements (CREATE TABLE IF NOT EXISTS + ENABLE ROW LEVEL SECURITY) for ${NEW_TABLES.join(", ")}.`);
  } else {
    await sql.begin(async (tx) => {
      for (const s of statements) await tx.unsafe(s);
    });
    const after = await tables();
    const added = after.filter((t) => !before.includes(t));
    const removed = before.filter((t) => !after.includes(t));
    console.log(`Applied. Added: ${added.join(", ") || "none"}. Removed: ${removed.join(", ") || "none"}. Tables now: ${after.length}.`);
    const rls = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ${sql(NEW_TABLES)} AND relkind = 'r'`;
    console.log(`Row level security: ${rls.map((r) => `${r.relname}=${r.relrowsecurity ? "on" : "OFF"}`).join(", ")}`);
    if (removed.length || rls.length !== NEW_TABLES.length || rls.some((r) => !r.relrowsecurity)) process.exitCode = 1;
  }
} finally {
  await sql.end();
}
