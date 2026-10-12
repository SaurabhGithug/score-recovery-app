/**
 * Read a column value the same way from either database the app runs on.
 *
 * SQLite (local) returns numbers (or bigint), 0/1 for booleans, and dates as the text that was
 * stored. postgres.js (Neon, production) parses only int2/int4/oid/float types into numbers:
 * int8 and numeric — including every COUNT(*) and SUM() — arrive as strings; BOOLEAN arrives as
 * true/false; DATE and TIMESTAMP(TZ) arrive as Date objects (node_modules/postgres/src/types.js).
 * A reader that only accepts what SQLite returns silently gets 0, false or null on Postgres.
 */

/** A number from number, bigint or numeric text; null for anything else (including "" and NaN). */
export function dbNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** true for Postgres true and SQLite 1; false for everything else (including null). */
export function dbBool(v: unknown): boolean {
  return v === true || v === 1 || v === BigInt(1) || v === "1" || v === "t" || v === "true";
}

const isValidDate = (d: Date) => !Number.isNaN(d.getTime());

/**
 * A DATE column as "YYYY-MM-DD". postgres.js builds DATE values with new Date("YYYY-MM-DD"), which
 * is UTC midnight, so the UTC calendar day is the stored day. Text is returned as stored.
 */
export function dbDate(v: unknown): string | null {
  if (v instanceof Date) return isValidDate(v) ? v.toISOString().slice(0, 10) : null;
  return typeof v === "string" ? v : null;
}

/** A TIMESTAMP column as ISO 8601 text (sortable as a string). Text is returned as stored. */
export function dbTimestamp(v: unknown): string | null {
  if (v instanceof Date) return isValidDate(v) ? v.toISOString() : null;
  return typeof v === "string" ? v : null;
}
