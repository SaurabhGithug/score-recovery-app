import assert from "node:assert/strict";
import { dbBool, dbDate, dbNumber, dbTimestamp } from "../src/lib/server/db-values.ts";

// numbers: SQLite gives numbers/bigint; postgres.js gives COUNT(*)/SUM() (int8/numeric) as strings
assert.equal(dbNumber(12), 12);
assert.equal(dbNumber(0), 0);
assert.equal(dbNumber(12n), 12);
assert.equal(dbNumber("1186"), 1186);
assert.equal(dbNumber("0"), 0);
assert.equal(dbNumber(" 7 "), 7);
assert.equal(dbNumber("3.25"), 3.25);
for (const bad of ["", "   ", "abc", "12abc", null, undefined, NaN, Infinity, true, {}, new Date()]) {
  assert.equal(dbNumber(bad), null, `dbNumber(${String(bad)}) must be null`);
}

// booleans: Postgres BOOLEAN → true/false; SQLite INTEGER → 1/0
for (const yes of [true, 1, 1n, "1", "t", "true"]) assert.equal(dbBool(yes), true, `dbBool(${String(yes)})`);
for (const no of [false, 0, 0n, "0", "f", "false", "", null, undefined, 2, "yes"]) assert.equal(dbBool(no), false, `dbBool(${String(no)})`);

// DATE: postgres.js parses "2022-11-14" with new Date(...) = UTC midnight; the day must survive
assert.equal(dbDate(new Date("2022-11-14")), "2022-11-14");
assert.equal(dbDate(new Date("2024-06-07")), "2024-06-07");
assert.equal(dbDate("2022-11-14"), "2022-11-14"); // SQLite text passes through untouched
assert.equal(dbDate(new Date("nonsense")), null);
assert.equal(dbDate(null), null);
assert.equal(dbDate(20221114), null);

// TIMESTAMPTZ: Date → ISO text, which sorts correctly as a string (answer-key.ts picks the latest
// evidence with `b.observedAt > a.observedAt`)
assert.equal(dbTimestamp(new Date("2026-10-01T12:30:00.000Z")), "2026-10-01T12:30:00.000Z");
assert.equal(dbTimestamp(new Date("2026-10-01T18:00:00+05:30")), "2026-10-01T12:30:00.000Z");
assert.equal(dbTimestamp("2026-09-29T10:00:00.000Z"), "2026-09-29T10:00:00.000Z");
assert.equal(dbTimestamp(null), null);
assert.equal(dbTimestamp(new Date(NaN)), null);
const older = dbTimestamp(new Date("2026-09-30T23:00:00Z"));
const newer = dbTimestamp(new Date("2026-10-01T01:00:00Z"));
assert.ok(newer > older, "ISO text must order by time");
// (String(Date), what the old reader produced on Postgres, starts with the weekday name, so it does not.)

console.log("db-values: all assertions passed");
