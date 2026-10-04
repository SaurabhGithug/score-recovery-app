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
  // No Open button: a to-do such as the hot-topic drill or a mock analysis, which has no page of its own.
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

/** The note older plans gave every hot-topic drill, which pointed into the repository. */
const REPO_NOTE = /\bdocs\/\S+\.md\b/;
const DRILL_NOTE = "Re-test yourself on the facts you got wrong in your recent topic tests. Shuffle the options.";
/** Older plans split one IES reasoning test into two sprints; IES allows one attempt per test. */
const SPLIT_TEST = /^Reasoning [23]\/3 \(sprint Q/;
const WHOLE_TEST_NOTE = "IES gives one attempt per test, so this set cannot be split: take it whole, once, in one sitting (aim 25 min)";

/**
 * Built-in items take the current plan's details: series, minutes, note, portal name and built-in link. Nothing else changes:
 * not the day, title or progress, and not a link the learner saved themselves. Runs on every load, so a fix to the built-in plan
 * (for example a row that should have no Open button) reaches plans saved earlier without pressing Update.
 * Built-in items from an older plan that the current one no longer has (a renamed drill, say) keep their details, except that
 * a "This app" row with no page of its own gets no Open button and a note pointing into the repository is replaced.
 * Returns the same array when nothing changes.
 */
export function refreshFromPreset(items: PlanItem[], preset: PlanInput[]): PlanItem[] {
  const rows = new Map<string, PlanInput>();
  for (const input of preset) rows.set(presetId(input.date, clean(input.title, MAX_TITLE)), input);
  let changed = false;
  const next = items.map((item) => {
    if (!item.id.startsWith("preset:")) return item;
    const input = rows.get(item.id);
    if (!input) {
      const series = item.series === "app" && !safeUrl(item.url) ? "other" : item.series;
      const note = REPO_NOTE.test(item.note) ? DRILL_NOTE : SPLIT_TEST.test(item.title) ? WHOLE_TEST_NOTE : item.note;
      if (series === item.series && note === item.note) return item;
      changed = true;
      return { ...item, series, note };
    }
    const presetUrl = safeUrl(input.url);
    const fresh: PlanItem = {
      ...item,
      series: SERIES.includes(input.series) ? input.series : "other",
      minutes: clampMinutes(input.minutes),
      note: clean(input.note, MAX_NOTE),
      portalName: clean(input.portalName, MAX_TITLE) || item.portalName,
      presetUrl,
      url: item.url === item.presetUrl ? presetUrl : item.url,
    };
    const same = fresh.series === item.series && fresh.minutes === item.minutes && fresh.note === item.note
      && fresh.portalName === item.portalName && fresh.presetUrl === item.presetUrl && fresh.url === item.url;
    if (same) return item;
    changed = true;
    return fresh;
  });
  return changed ? next : items;
}

/** A built-in item the learner has never acted on: not opened, attempted or skipped, and no score or link of their own. */
const untouched = (item: PlanItem): boolean =>
  item.status === "planned" && item.openedAt === null && item.doneAt === null && item.result === "" && item.url === item.presetUrl;

/**
 * Items that stand for one specific test: an IES topic test, one of its passes, a full mock, a Made Easy subject test,
 * or a whole IES reasoning or GA set (full block or speed block; IES allows one attempt per test).
 */
export const TEST_IDENTITY = /^(IES T\d+ |Pass [23] of 3: IES T\d+ |Full mock \(|(GK\/CA: )?Made Easy subject test \d+:|Reasoning [12]\/3 \((full \d+ Q, 30 min|speed set, \d+ Q in 25 min)\): IES GIR |GK\/CA: IES GA )/;

/** Whole tests the learner still has to sit: kept even when an update places them on a day already past. */
const WHOLE_TEST = /^(IES T\d+ |Pass [23] of 3: IES T\d+ |Full mock \(|(GK\/CA: )?Made Easy subject test \d+:)/;

/** Rows that use up one IES reasoning or GA test (IES allows one attempt). Pass rows share their test's name on purpose. */
const USES_IES_SET = /^(Reasoning [123]\/3 |GK\/CA: IES GA )/;

/** Blocks the built-in plan has at most once a day: the hot-topic drill and each of the three reasoning blocks. */
const DAILY_SLOT = /^(Hot-topic drill test|Reasoning [123]\/3)\b/;

/**
 * Bring a saved plan up to date with the current built-in plan:
 * (a) drop built-in items the current plan no longer has, but only if the learner never touched them;
 * (b) add the built-in items that are missing; (c) refresh built-in details (see refreshFromPreset).
 * The learner's own items, and built-in items they opened, attempted, skipped, scored or linked, are never removed.
 * A test or daily block the learner already acted on is not added a second time (`skipped`), and neither is an IES reasoning or GA
 * set they already opened or took under another title. When a plan is already loaded, no new daily block is added to days before
 * `today` (`past`), so an update never back-fills practice the learner has finished; but whole tests (topic tests and their passes,
 * mocks, Made Easy subject tests) and anything the update moved or renamed are put back even on a past day, so a learner who is
 * behind still sees them as not done. Running it again changes nothing (added 0, removed 0, the same array back).
 */
export function syncPreset(items: PlanItem[], preset: PlanInput[], today?: string): { items: PlanItem[]; added: number; removed: number; skipped: number; past: number } {
  const current = new Set(preset.map((input) => presetId(input.date, clean(input.title, MAX_TITLE))));
  const slotKey = (date: string, title: string) => { const slot = DAILY_SLOT.exec(title); return slot ? `${date}|${slot[1]}` : ""; };
  // A built-in row the learner only opened (no answer, score or link of their own) moves with the plan when the plan moved or
  // renamed it; the new row keeps the "opened" mark, so "did you attempt it?" is still asked.
  const presetTitles = new Set(preset.map((input) => clean(input.title, MAX_TITLE)));
  const presetSlots = new Set(preset.map((input) => slotKey(input.date, clean(input.title, MAX_TITLE))).filter(Boolean));
  const openedOnly = (item: PlanItem) => item.status === "planned" && item.openedAt !== null && item.doneAt === null && item.result === "" && item.url === item.presetUrl;
  const movable = (item: PlanItem) => item.id.startsWith("preset:") && !current.has(item.id) && openedOnly(item)
    && (presetTitles.has(item.title) || presetSlots.has(slotKey(item.date, item.title)));
  const kept = items.filter((item) => !item.id.startsWith("preset:") || current.has(item.id) || (!untouched(item) && !movable(item)));
  const keptIds = new Set(kept.map((item) => item.id));
  const dropped = items.filter((item) => !keptIds.has(item.id));
  const removed = dropped.length;
  const touched = kept.filter((item) => item.id.startsWith("preset:") && !untouched(item));
  // A test the learner already acted on, kept on an older date, is not added again on its new date.
  const actedOn = new Set(touched.filter((item) => TEST_IDENTITY.test(item.title)).map((item) => item.title));
  // A day keeps the drill or reasoning block the learner already acted on, even if the built-in plan renamed it.
  const filledSlots = new Set(touched.map((item) => slotKey(item.date, item.title)).filter(Boolean));
  // An IES set already taken under an older title (say a half-test sprint) is used up: IES allows one attempt.
  // Only an attempt or a score says so; a set merely opened or skipped can still be taken.
  const usedSets = new Set(touched.filter((item) => item.portalName && USES_IES_SET.test(item.title) && (item.status === "attempted" || item.result !== "")).map((item) => item.portalName));
  const ids = new Set(kept.map((item) => item.id));
  const notActedOn = preset.filter((input) => {
    const title = clean(input.title, MAX_TITLE);
    if (ids.has(presetId(input.date, title))) return true;
    const usesUsedSet = USES_IES_SET.test(title) && usedSets.has(clean(input.portalName, MAX_TITLE));
    return !actedOn.has(title) && !filledSlots.has(slotKey(input.date, title)) && !usesUsedSet;
  });
  const skipped = preset.length - notActedOn.length;
  const loaded = items.some((item) => item.id.startsWith("preset:"));
  // What this update just took out: a row with the same title (a moved test) or the same day and block (a renamed drill) replaces it.
  const droppedTitles = new Set(dropped.map((item) => item.title));
  const droppedSlots = new Set(dropped.map((item) => slotKey(item.date, item.title)).filter(Boolean));
  const replaces = (input: PlanInput) => {
    const title = clean(input.title, MAX_TITLE);
    return droppedTitles.has(title) || droppedSlots.has(slotKey(input.date, title));
  };
  const wanted = loaded && today
    ? notActedOn.filter((input) => input.date >= today || ids.has(presetId(input.date, clean(input.title, MAX_TITLE))) || replaces(input) || WHOLE_TEST.test(clean(input.title, MAX_TITLE)))
    : notActedOn;
  const past = notActedOn.length - wanted.length;
  const merged = mergePreset(removed > 0 ? kept : items, wanted);
  // Carry "opened" over to the row that replaced an opened-only row (same test, or same day and block).
  const openedFrom = dropped.filter(openedOnly);
  const carried = openedFrom.length === 0 ? merged.items : merged.items.map((item) => {
    if (keptIds.has(item.id) || item.openedAt !== null || item.status !== "planned") return item;
    const from = openedFrom.find((old) => old.title === item.title) ?? openedFrom.find((old) => slotKey(old.date, old.title) !== "" && slotKey(old.date, old.title) === slotKey(item.date, item.title));
    return from ? { ...item, openedAt: from.openedAt } : item;
  });
  return { items: refreshFromPreset(carried, preset), added: merged.added, removed, skipped, past };
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
