#!/usr/bin/env node
// Applies one of the standards migrations to the Postgres database in DATABASE_URL, in one
// transaction. Additive only: it refuses any statement that is not CREATE TABLE IF NOT EXISTS,
// CREATE INDEX IF NOT EXISTS or ENABLE ROW LEVEL SECURITY on a table named standard*, so re-running
// it changes nothing and no existing table or row is touched.
//
//   node --env-file=.env.production.local scripts/apply-standards-migration.mjs --file migrations/0011_standard_quiz.sql --dry-run
//   node --env-file=.env.production.local scripts/apply-standards-migration.mjs --file migrations/0011_standard_quiz.sql
// (--file defaults to migrations/0010_standards.sql)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!connection) throw new Error("Set DATABASE_URL to the production Postgres connection string.");
const dryRun = process.argv.includes("--dry-run");
const fileFlag = process.argv.indexOf("--file");
const file = path.resolve(repoRoot, fileFlag >= 0 ? process.argv[fileFlag + 1] : "migrations/0010_standards.sql");
if (!/^0\d{3}_standard[a-z_]*\.sql$/.test(path.basename(file)) || path.dirname(file) !== path.join(repoRoot, "migrations")) {
  throw new Error(`Refusing: ${file} is not a migrations/0NNN_standard*.sql file.`);
}

const statements = fs
  .readFileSync(file, "utf8")
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
const NEW_TABLES = [];
for (const s of statements) {
  const create = s.match(/^CREATE TABLE IF NOT EXISTS (standard[a-z_]*) \(/);
  if (create) {
    NEW_TABLES.push(create[1]);
    continue;
  }
  const allowed =
    /^CREATE INDEX IF NOT EXISTS idx_standard[a-z_]* ON standard[a-z_]*\([a-z_, ]+\)$/.test(s) ||
    /^ALTER TABLE standard[a-z_]* ENABLE ROW LEVEL SECURITY$/.test(s);
  if (!allowed) throw new Error(`Refusing: unexpected statement in ${path.basename(file)}:\n${s.slice(0, 200)}`);
}
if (!NEW_TABLES.length) throw new Error("No CREATE TABLE statements found.");

const sql = postgres(connection, { max: 1, prepare: false, ssl: "require" });
try {
  const host = new URL(connection).host.replace(/^[^@]*@/, "");
  const tables = async () =>
    (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`).map((r) => r.table_name);
  const before = await tables();
  const users = await sql`SELECT id, name FROM users WHERE normalized_name IN ('saurabh', 'reema') ORDER BY name`;
  console.log(`Migration: ${path.basename(file)}`);
  console.log(`Database host: ${host}`);
  console.log(`Tables before: ${before.length}. Already present: ${NEW_TABLES.filter((t) => before.includes(t)).join(", ") || "none"}.`);
  console.log(`Real accounts: ${users.map((u) => `${u.name}=${u.id}`).join(", ") || "none found"}`);
  if (!before.includes("users")) throw new Error("No users table: this is not the app's database.");
  if (dryRun) {
    console.log(`Dry run: would run ${statements.length} statements for ${NEW_TABLES.join(", ")}.`);
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
