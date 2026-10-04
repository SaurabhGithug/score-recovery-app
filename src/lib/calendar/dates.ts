/** Date-only arithmetic for the calendar. A calendar day is a YYYY-MM-DD string, never a time, so time zones cannot shift it. */

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function utcMs(iso: string): number {
  if (!DATE_PATTERN.test(iso)) throw new Error(`Not a YYYY-MM-DD date: ${iso}`);
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export const daysBetween = (from: string, to: string): number => Math.round((utcMs(to) - utcMs(from)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (iso: string): number => new Date(utcMs(iso)).getUTCDay();

/** Today's date on the learner's own clock, as YYYY-MM-DD. */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The month `delta` months after `monthKey` (YYYY-MM). */
export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * The first month the calendar shows: this month, or an earlier month that still holds a planned day (so a plan's early days
 * stay reachable after the month turns), never more than six months back, and never after `lastMonth`.
 */
export function firstCalendarMonth(today: string, planDates: Iterable<string>, lastMonth: string): string {
  const floor = shiftMonth(today.slice(0, 7), -6);
  let first = today.slice(0, 7);
  for (const date of planDates) {
    const month = date.slice(0, 7);
    if (month < first && month >= floor) first = month;
  }
  return first < lastMonth ? first : lastMonth;
}

/** Every month from `first` to `last` inclusive (YYYY-MM). Empty if `last` is before `first`. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let month = first; month <= last; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

/** A month laid out in whole weeks, Sunday first: a date for each day, null for the blanks around them. */
export function monthCells(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekdayOf(`${monthKey}-01`)).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
