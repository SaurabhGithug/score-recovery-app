import assert from "node:assert/strict";
import { daysBetween, firstCalendarMonth, localIsoDate, monthCells, monthsBetween, shiftMonth, weekdayOf } from "../src/lib/calendar/dates.ts";

assert.equal(daysBetween("2026-10-02", "2026-11-02"), 31);
assert.equal(daysBetween("2026-11-02", "2026-10-02"), -31);
assert.equal(daysBetween("2026-10-02", "2026-10-02"), 0);
assert.equal(weekdayOf("2026-10-02"), 5, "2 Oct 2026 is a Friday");
assert.equal(weekdayOf("2026-11-01"), 0, "1 Nov 2026 is a Sunday");
assert.equal(localIsoDate(new Date(2026, 9, 2, 23, 59)), "2026-10-02", "the learner's local date, not UTC");
assert.throws(() => daysBetween("2 Oct 2026", "2026-11-02"));

assert.equal(shiftMonth("2026-10", 1), "2026-11");
assert.equal(shiftMonth("2026-12", 1), "2027-01");
assert.equal(shiftMonth("2026-01", -1), "2025-12");
assert.deepEqual(monthsBetween("2026-10", "2026-11"), ["2026-10", "2026-11"]);
assert.deepEqual(monthsBetween("2026-11", "2026-11"), ["2026-11"]);
assert.deepEqual(monthsBetween("2026-12", "2027-02"), ["2026-12", "2027-01", "2027-02"]);
assert.deepEqual(monthsBetween("2026-11", "2026-10"), []);

// From 1 Nov the October days of the plan are still on the calendar; with no plan only this month shows
assert.equal(firstCalendarMonth("2026-11-01", ["2026-10-03", "2026-11-01"], "2026-11"), "2026-10");
assert.equal(firstCalendarMonth("2026-11-01", [], "2026-11"), "2026-11");
assert.equal(firstCalendarMonth("2026-10-04", ["2026-10-03"], "2026-11"), "2026-10");
assert.equal(firstCalendarMonth("2026-11-01", ["2025-01-05"], "2026-11"), "2026-11", "a stray old date does not add a year of months");
assert.equal(firstCalendarMonth("2026-12-10", ["2026-12-01"], "2026-11"), "2026-11", "never after the exam month");

// October 2026 starts on a Thursday and has 31 days: 4 blanks, 31 dates, padded to 5 whole weeks
const october = monthCells("2026-10");
assert.equal(october.length, 35);
assert.deepEqual(october.slice(0, 4), [null, null, null, null]);
assert.equal(october[4], "2026-10-01");
assert.equal(october.filter(Boolean).length, 31);
assert.equal(october.filter(Boolean).at(-1), "2026-10-31");

// November 2026 starts on a Sunday and has 30 days: no leading blanks
const november = monthCells("2026-11");
assert.equal(november[0], "2026-11-01");
assert.equal(november.filter(Boolean).length, 30);
assert.equal(november.length % 7, 0);

// Leap February
assert.equal(monthCells("2028-02").filter(Boolean).length, 29);

console.log("Calendar dates: day counts, weekdays, months and week layout all hold.");
