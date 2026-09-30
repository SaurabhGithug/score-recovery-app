#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import postgres from "postgres";

const source = path.resolve(process.argv[2] || "data/score_recovery.db");
const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!connection) throw new Error("Set DATABASE_URL to the Supabase Postgres connection string.");

const sqlite = new DatabaseSync(source, { readOnly: true });
const sql = postgres(connection, { max: 1, prepare: false, ssl: "require" });
const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;
const mapType = (raw) => {
  const type = String(raw || "TEXT").toUpperCase();
  if (type.includes("INT")) return "BIGINT";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "DOUBLE PRECISION";
  if (type.includes("BLOB")) return "BYTEA";
  return "TEXT";
};
const mapDefault = (value) => {
  if (value == null) return "";
  const text = String(value).replace(/^\((CURRENT_TIMESTAMP)\)$/i, "$1");
  return ` DEFAULT ${text}`;
};

const tableNames = sqlite.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all().map((row) => row.name);
const tables = new Map();
for (const name of tableNames) {
  const columns = sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all();
  const foreignKeys = sqlite.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all();
  const indexes = sqlite.prepare(`PRAGMA index_list(${quote(name)})`).all();
  const unique = indexes.filter((index) => index.unique && index.origin === "u").map((index) =>
    sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all().sort((a, b) => a.seqno - b.seqno).map((row) => row.name)
  );
  tables.set(name, { columns, foreignKeys, unique });
}

const ordered = [];
const pending = new Set(tableNames);
while (pending.size) {
  let progressed = false;
  for (const name of [...pending]) {
    const deps = new Set(tables.get(name).foreignKeys.map((fk) => fk.table).filter((dep) => dep !== name));
    if ([...deps].every((dep) => !pending.has(dep))) {
      ordered.push(name);
      pending.delete(name);
      progressed = true;
    }
  }
  if (!progressed) {
    ordered.push(...pending);
    pending.clear();
  }
}

await sql.begin(async (tx) => {
  for (const name of ordered) {
    const { columns, foreignKeys, unique } = tables.get(name);
    const primary = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name);
    const definitions = columns.map((column) => {
      const inlinePrimary = primary.length === 1 && primary[0] === column.name ? " PRIMARY KEY" : "";
      return `${quote(column.name)} ${mapType(column.type)}${column.notnull ? " NOT NULL" : ""}${mapDefault(column.dflt_value)}${inlinePrimary}`;
    });
    if (primary.length > 1) definitions.push(`PRIMARY KEY (${primary.map(quote).join(", ")})`);
    for (const cols of unique) definitions.push(`UNIQUE (${cols.map(quote).join(", ")})`);
    const grouped = new Map();
    for (const fk of foreignKeys) {
      const group = grouped.get(fk.id) || { table: fk.table, from: [], to: [], onDelete: fk.on_delete };
      group.from[fk.seq] = fk.from;
      group.to[fk.seq] = fk.to;
      grouped.set(fk.id, group);
    }
    for (const fk of grouped.values()) {
      definitions.push(`FOREIGN KEY (${fk.from.map(quote).join(", ")}) REFERENCES ${quote(fk.table)} (${fk.to.map(quote).join(", ")}) ON DELETE ${fk.onDelete || "NO ACTION"}`);
    }
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS ${quote(name)} (\n  ${definitions.join(",\n  ")}\n)`);
  }

  const indexes = sqlite.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name"
  ).all();
  for (const index of indexes) {
    const ddl = String(index.sql).replace(/^CREATE (UNIQUE )?INDEX /i, "CREATE $1INDEX IF NOT EXISTS ");
    await tx.unsafe(ddl);
  }
  await tx.unsafe(`CREATE OR REPLACE VIEW formula_links AS
    SELECT id, from_id AS formula_id, 'out' AS direction, relation, to_type AS other_type, to_id AS other_id, origin, evidence, review_status
      FROM syllabus_relations WHERE from_type = 'formula'
    UNION ALL
    SELECT id, to_id AS formula_id, 'in' AS direction, relation, from_type AS other_type, from_id AS other_id, origin, evidence, review_status
      FROM syllabus_relations WHERE to_type = 'formula'`);

  for (const name of ordered) {
    const columns = tables.get(name).columns.map((column) => column.name);
    const rows = sqlite.prepare(`SELECT * FROM ${quote(name)}`).all();
    for (let start = 0; start < rows.length; start += 250) {
      const chunk = rows.slice(start, start + 250);
      const params = [];
      const tuples = chunk.map((row) => `(${columns.map((column) => {
        params.push(row[column]);
        return `$${params.length}`;
      }).join(", ")})`);
      await tx.unsafe(
        `INSERT INTO ${quote(name)} (${columns.map(quote).join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING`,
        params
      );
    }
    await tx.unsafe(`ALTER TABLE ${quote(name)} ENABLE ROW LEVEL SECURITY`);
    process.stdout.write(`${name}: ${rows.length}\n`);
  }
});

await sql.unsafe(`CREATE TABLE IF NOT EXISTS revision_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  model TEXT,
  evidence TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, source_kind, source_id, body_hash)
)`);
await sql.unsafe("CREATE INDEX IF NOT EXISTS idx_revision_notes_user ON revision_notes(user_id, updated_at)");
await sql.unsafe("ALTER TABLE revision_notes ENABLE ROW LEVEL SECURITY");
await sql.unsafe("CREATE TABLE IF NOT EXISTS auth_rate_limits (bucket TEXT PRIMARY KEY, count BIGINT NOT NULL, reset_at BIGINT NOT NULL)");
await sql.unsafe("ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY");

await sql.unsafe(`CREATE OR REPLACE FUNCTION enforce_question_concept_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.node_kind IS DISTINCT FROM (SELECT kind FROM syllabus_nodes WHERE id = NEW.node_id) THEN
    RAISE EXCEPTION 'question_concepts.node_kind must match the node kind';
  END IF;
  RETURN NEW;
END $$`);
await sql.unsafe("DROP TRIGGER IF EXISTS trg_question_concepts_kind ON question_concepts");
await sql.unsafe("CREATE TRIGGER trg_question_concepts_kind BEFORE INSERT OR UPDATE ON question_concepts FOR EACH ROW EXECUTE FUNCTION enforce_question_concept_kind()");
await sql.unsafe(`CREATE OR REPLACE FUNCTION protect_theory_source_extract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind = 'source_extract' AND (NEW.kind, NEW.body, NEW.source_title, NEW.source_locator, NEW.source_edition, NEW.node_id)
     IS DISTINCT FROM (OLD.kind, OLD.body, OLD.source_title, OLD.source_locator, OLD.source_edition, OLD.node_id) THEN
    RAISE EXCEPTION 'source extracts are immutable; add a new extract instead';
  END IF;
  RETURN NEW;
END $$`);
await sql.unsafe("DROP TRIGGER IF EXISTS trg_theory_source_extract_immutable ON theory_notes");
await sql.unsafe("CREATE TRIGGER trg_theory_source_extract_immutable BEFORE UPDATE ON theory_notes FOR EACH ROW EXECUTE FUNCTION protect_theory_source_extract()");

await sql.end();
sqlite.close();
process.stdout.write(`Migrated ${ordered.length} tables from ${source}.\n`);
