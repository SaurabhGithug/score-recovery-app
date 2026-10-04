/**
 * The learner's day-by-day test plan: which test to take on which day, a link to open it,
 * and whether it was attempted. Pure functions only (no React, no browser APIs) so they can be tested
 * with `node scripts/test-test-plan.mjs`. Storage is per account in this browser (see TestPlanPanel).
 */

export type PlanSeries = "ies" | "madeeasy" | "app" | "other";
export type PlanStatus = "planned" | "attempted" | "skipped";

export interface PlanItem {
  id: string;
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  title: string;
  /** The exact test name on the series' own website, so the learner can find it there. May be empty. */
  portalName: string;
  series: PlanSeries;
  /** Optional link to the exact test; empty means "use the series link". */
  url: string;
  /** The link the built-in plan gave this item ("" for the learner's own items). A url equal to it is not a learner action. */
  presetUrl: string;
  minutes: number;
  note: string;
  status: PlanStatus;
  /** When the learner last pressed "Open test" and has not answered "did you attempt it?" yet. */
  openedAt: string | null;
  /** When the learner marked it attempted or skipped. */
  doneAt: string | null;
  /** Free text the learner types after attempting, e.g. "32/50, 28 min". */
  result: string;
}

export interface PlanInput {
  date: string;
  title: string;
  portalName?: string;
  series: PlanSeries;
  url?: string;
  minutes?: number;
  note?: string;
}

export const SERIES_LABEL: Record<PlanSeries, string> = {
  ies: "IES Master",
  madeeasy: "Made Easy",
  app: "This app",
  other: "Other",
};

/**
 * Where "Open test" goes when an item has no link of its own. IES Master does not publish a link for each test
 * (the portal's "Attempt Now" is a button), so IES items open the portal's "My Tests" list, where the test is found by name.
 */
export const SERIES_LINK: Record<PlanSeries, string> = {
  ies: "https://ehub.iesmaster.org/student/testment/test",
  madeeasy: "https://www.madeeasy.in/prep/mock-test-details/ce-ssc-je-2026-cbt-1-online-test-series",
  app: "/papers",
  other: "",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SERIES: readonly PlanSeries[] = ["ies", "madeeasy", "app", "other"];
const STATUSES: readonly PlanStatus[] = ["planned", "attempted", "skipped"];
const MAX_TITLE = 200;
const MAX_NOTE = 300;
const MAX_RESULT = 120;
const MAX_ITEMS = 2000;

export const planStorageKey = (userId: string | number): string => `test-plan:v1:${userId}`;

export function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * A link is safe to put in an anchor only if it is an http(s) address or a path inside this app.
 * Anything else (javascript:, data:, file:, protocol-relative //host) becomes "".
 */
export function safeUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const value = url.trim();
  if (!value) return "";
  if (value.startsWith("/")) return value.startsWith("//") || value.includes("\\") ? "" : value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

/** The address "Open test" should use for an item. */
export const linkFor = (item: PlanItem): string => safeUrl(item.url) || SERIES_LINK[item.series];

export const isInternalLink = (href: string): boolean => href.startsWith("/");

// Trim again after the cut, so a value cut just after a space is stored exactly as it reloads (titles are matched on reload).
const clean = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");
const clampMinutes = (value: unknown): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(600, Math.max(0, n));
};

let counter = 0;
/** A unique id that also works on plain-http pages, where crypto.randomUUID is unavailable. */
export function makeId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** A stable id for a built-in plan item, so loading the same plan twice never duplicates it. */
export function presetId(date: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `preset:${date}:${slug}`;
}

const byDate = (a: PlanItem, b: PlanItem): number => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1);

/** Turn whatever was in storage (or imported) into valid items; drop anything malformed. */
export function parsePlan(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: PlanItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = clean(e.title, MAX_TITLE);
    if (!isValidDate(e.date) || !title) continue;
    const id = typeof e.id === "string" && e.id && e.id.length <= 120 ? e.id : makeId();
    if (seen.has(id)) continue;
    seen.add(id);
    const status = STATUSES.includes(e.status as PlanStatus) ? (e.status as PlanStatus) : "planned";
    items.push({
      id,
      date: e.date,
      title,
      portalName: clean(e.portalName, MAX_TITLE),
      series: SERIES.includes(e.series as PlanSeries) ? (e.series as PlanSeries) : "other",
      url: safeUrl(e.url),
      presetUrl: safeUrl(e.presetUrl),
      minutes: clampMinutes(e.minutes),
      note: clean(e.note, MAX_NOTE),
      status,
      openedAt: status === "planned" && typeof e.openedAt === "string" ? e.openedAt : null,
      doneAt: status !== "planned" && typeof e.doneAt === "string" ? e.doneAt : null,
      result: clean(e.result, MAX_RESULT),
    });
  }
  return items.sort(byDate);
}

export function addItem(items: PlanItem[], input: PlanInput, id: string = makeId(), fromPreset = false): PlanItem[] {
  const title = clean(input.title, MAX_TITLE);
  if (!title) throw new Error("Give the test a name.");
  if (!isValidDate(input.date)) throw new Error("Pick a valid date.");
  if (items.length >= MAX_ITEMS) throw new Error("The plan is full.");
  const item: PlanItem = {
    id,
    date: input.date,
    title,
    portalName: clean(input.portalName, MAX_TITLE),
    series: SERIES.includes(input.series) ? input.series : "other",
    url: safeUrl(input.url),
    presetUrl: fromPreset ? safeUrl(input.url) : "",
    minutes: clampMinutes(input.minutes),
    note: clean(input.note, MAX_NOTE),
    status: "planned",
    openedAt: null,
    doneAt: null,
    result: "",
  };
  if (input.url && input.url.trim() && !item.url) throw new Error("The link must start with https:// (or be a path in this app).");
  return [...items, item].sort(byDate);
}

/** Add built-in plan items that are not already in the plan (matched by day and title). Returns the new list and how many were added. */
export function mergePreset(items: PlanItem[], preset: PlanInput[]): { items: PlanItem[]; added: number } {
  const have = new Set(items.map((item) => `${item.date}|${item.title}`));
  const ids = new Set(items.map((item) => item.id));
  let next = items;
  let added = 0;
  for (const input of preset) {
    const title = clean(input.title, MAX_TITLE);
    const key = `${input.date}|${title}`;
    const id = presetId(input.date, title);
    if (have.has(key) || ids.has(id)) continue;
    try {
      next = addItem(next, input, id, true);
      have.add(key);
      ids.add(id);
      added += 1;
    } catch {
      /* skip an invalid preset row */
    }
  }
  return { items: next, added };
}

/**
 * Plans loaded before the exact test names existed get them filled in: only built-in items that have no name yet,
 * and only the name. Nothing is added, removed or changed otherwise. Returns the same array when nothing changes.
 */
export function fillPortalNames(items: PlanItem[], preset: PlanInput[]): PlanItem[] {
  const names = new Map<string, string>();
  for (const input of preset) {
    const title = clean(input.title, MAX_TITLE);
    const name = clean(input.portalName, MAX_TITLE);
    if (name) names.set(presetId(input.date, title), name);
  }
  let changed = false;
  const next = items.map((item) => {
    const name = !item.portalName && item.id.startsWith("preset:") ? names.get(item.id) : undefined;
    if (!name) return item;
    changed = true;
    return { ...item, portalName: name };
  });
  return changed ? next : items;
}

/** A built-in item the learner has never acted on: not opened, attempted or skipped, and no score or link of their own. */
const untouched = (item: PlanItem): boolean =>
  item.status === "planned" && item.openedAt === null && item.doneAt === null && item.result === "" && item.url === item.presetUrl;

/** Items that stand for one specific test (an IES topic test, one of its passes, a full mock, a Made Easy subject test). */
const TEST_IDENTITY = /^(IES T\d+ |Pass [23] of 3: IES T\d+ |Full mock \(|(GK\/CA: )?Made Easy subject test \d+:)/;

/**
 * Bring a saved plan up to date with the current built-in plan:
 * (a) drop built-in items the current plan no longer has, but only if the learner never touched them;
 * (b) add the built-in items that are missing; (c) fill in exact portal names.
 * The learner's own items, and built-in items they opened, attempted, skipped, scored or linked, are never removed.
 * Running it again changes nothing (added 0, removed 0, the same array back).
 */
export function syncPreset(items: PlanItem[], preset: PlanInput[]): { items: PlanItem[]; added: number; removed: number; skipped: number } {
  const current = new Set(preset.map((input) => presetId(input.date, clean(input.title, MAX_TITLE))));
  const kept = items.filter((item) => !item.id.startsWith("preset:") || current.has(item.id) || !untouched(item));
  const removed = items.length - kept.length;
  // A test the learner already acted on, kept on an older date, is not added again on its new date.
  const actedOn = new Set(kept.filter((item) => !untouched(item) && TEST_IDENTITY.test(item.title)).map((item) => item.title));
  const ids = new Set(kept.map((item) => item.id));
  const wanted = preset.filter((input) => {
    const title = clean(input.title, MAX_TITLE);
    return !(actedOn.has(title) && !ids.has(presetId(input.date, title)));
  });
  const skipped = preset.length - wanted.length;
  const merged = mergePreset(removed > 0 ? kept : items, wanted);
  return { items: fillPortalNames(merged.items, preset), added: merged.added, removed, skipped };
}

const update =(items: PlanItem[], id: string, change: (item: PlanItem) => PlanItem): PlanItem[] => items.map((item) => (item.id === id ? change(item) : item));

/** Save a direct link for one test. An empty link goes back to the series page. Throws on a link that is not safe to open. */
export function setUrl(items: PlanItem[], id: string, url: string): PlanItem[] {
  const safe = safeUrl(url);
  if (url.trim() && !safe) throw new Error("The link must start with https:// (or be a path in this app).");
  return update(items, id, (item) => ({ ...item, url: safe }));
}

export const removeItem = (items: PlanItem[], id: string): PlanItem[] => items.filter((item) => item.id !== id);

/** The learner pressed "Open test": remember it so the app can ask "did you attempt it?" when they come back. */
export const markOpened = (items: PlanItem[], id: string, nowIso: string): PlanItem[] =>
  update(items, id, (item) => (item.status === "planned" ? { ...item, openedAt: nowIso } : item));

/** "Not yet": stop asking until the learner opens the test again. */
export const clearOpened = (items: PlanItem[], id: string): PlanItem[] => update(items, id, (item) => ({ ...item, openedAt: null }));

export function setStatus(items: PlanItem[], id: string, status: PlanStatus, nowIso: string, result?: string): PlanItem[] {
  return update(items, id, (item) => ({
    ...item,
    status,
    openedAt: null,
    doneAt: status === "planned" ? null : nowIso,
    result: status === "attempted" && result !== undefined ? clean(result, MAX_RESULT) : item.result,
  }));
}

export const setResult = (items: PlanItem[], id: string, result: string): PlanItem[] => update(items, id, (item) => ({ ...item, result: clean(result, MAX_RESULT) }));

export const itemsOn = (items: PlanItem[], date: string): PlanItem[] => items.filter((item) => item.date === date);

/** Tests the learner opened but has not yet said whether they attempted, newest first. */
export const askPending = (items: PlanItem[]): PlanItem[] =>
  items.filter((item) => item.status === "planned" && item.openedAt).sort((a, b) => (a.openedAt! < b.openedAt! ? 1 : -1));

export interface DayMark { total: number; done: number; skipped: number }
export function dayMarks(items: PlanItem[]): Record<string, DayMark> {
  const marks: Record<string, DayMark> = {};
  for (const item of items) {
    const mark = (marks[item.date] ??= { total: 0, done: 0, skipped: 0 });
    mark.total += 1;
    if (item.status === "attempted") mark.done += 1;
    if (item.status === "skipped") mark.skipped += 1;
  }
  return marks;
}

export interface PlanSummary {
  todayTotal: number;
  todayDone: number;
  todayMinutesLeft: number;
  overallTotal: number;
  overallDone: number;
  /** Planned days before today that still have an unattempted, unskipped test. */
  overdue: number;
}
export function summarize(items: PlanItem[], today: string): PlanSummary {
  const todays = itemsOn(items, today);
  return {
    todayTotal: todays.length,
    todayDone: todays.filter((item) => item.status === "attempted").length,
    todayMinutesLeft: todays.filter((item) => item.status === "planned").reduce((sum, item) => sum + item.minutes, 0),
    overallTotal: items.length,
    overallDone: items.filter((item) => item.status === "attempted").length,
    overdue: items.filter((item) => item.status === "planned" && item.date < today).length,
  };
}
