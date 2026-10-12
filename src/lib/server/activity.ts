/**
 * The activity log (table activity_events, migrations/0014_activity_events.sql): what each learner does,
 * one row per meaningful action. Server routes log their own actions with logActivity, which never
 * throws, so a logging failure can never break the action. Browsers may only send the UI-only types in
 * CLIENT_EVENT_TYPES. Each row carries a short client label; Claude's own testing browser is labelled
 * "claude-app" and left out of what the learner sees and of the coverage counts.
 */
import crypto from "node:crypto";
import { getDatabase } from "./db";
import { HttpError, isRecord } from "./bank/http";
import { allMadeEasyQuestions, canReadMadeEasy } from "./made-easy";
import {
  CLAUDE_CLIENT, CLIENT_EVENT_TYPES, TARGET_KINDS,
  type ActivityDetail, type ActivityEvent, type ActivityOverview, type ActivityTargetKind, type ActivityType,
  type CoverageState, type MadeEasyCoverage,
} from "@/lib/activity";

const MAX_BATCH = 50;
const MAX_PER_MINUTE = 300;
const MAX_AGE_MS = 10 * 60 * 1000;
const LIST_LIMIT = 300;

/** A short browser/device label from the User-Agent; Claude's own browser is marked so reports can leave it out. */
export function clientLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/\bClaude\/\d/.test(ua)) return CLAUDE_CLIENT;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return device ? `${browser} · ${device}` : browser;
}

function cleanDetail(value: unknown): ActivityDetail {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new HttpError(400, "Event detail must be an object.");
  const entries = Object.entries(value);
  if (entries.length > 12) throw new HttpError(400, "Event detail has too many fields.");
  const detail: ActivityDetail = {};
  for (const [key, v] of entries) {
    if (!/^[A-Za-z]{1,30}$/.test(key)) throw new HttpError(400, "Event detail has an invalid field name.");
    if (typeof v === "string") detail[key] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) detail[key] = v;
    else if (typeof v === "boolean" || v === null) detail[key] = v;
    else throw new HttpError(400, "Event detail values must be text, numbers or true/false.");
  }
  return detail;
}

function cleanTarget(kind: unknown, id: unknown): { kind: ActivityTargetKind | null; id: string | null } {
  if (kind === undefined || kind === null) return { kind: null, id: null };
  if (!TARGET_KINDS.includes(kind as ActivityTargetKind)) throw new HttpError(400, "Unknown event target.");
  if (typeof id !== "string") throw new HttpError(400, "Event target id required.");
  const ok = kind === "page"
    ? id.length <= 300 && id.startsWith("/") && !id.startsWith("//") && !/[\s<>"]/.test(id)
    : /^[A-Za-z0-9_.:-]{1,200}$/.test(id);
  if (!ok) throw new HttpError(400, "Invalid event target id.");
  return { kind: kind as ActivityTargetKind, id };
}

async function insert(userId: string, at: string, type: ActivityType, target: { kind: ActivityTargetKind | null; id: string | null }, detail: ActivityDetail, client: string) {
  await getDatabase().prepare("INSERT INTO activity_events (id, user_id, at, type, target_kind, target_id, detail, client) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(`act_${crypto.randomUUID().replaceAll("-", "")}`, userId, at, type, target.kind, target.id, JSON.stringify(detail), client);
}

/** Logs an action a server route has just completed. Never throws: the action matters more than its log. */
export async function logActivity(
  req: Request | null,
  userId: string,
  type: Exclude<ActivityType, (typeof CLIENT_EVENT_TYPES)[number]>,
  target?: { kind: ActivityTargetKind; id: string },
  detail: ActivityDetail = {},
): Promise<void> {
  try {
    await insert(userId, new Date().toISOString(), type, target ?? { kind: null, id: null }, cleanDetail(detail), clientLabel(req?.headers.get("user-agent") ?? null));
  } catch (err) {
    console.error("[activity] could not log", type, err instanceof Error ? err.message : err);
  }
}

/** POST /api/activity { events: [{ type, targetKind?, targetId?, detail?, ageMs? }] } from the browser. */
export async function recordClientEvents(req: Request, userId: string, body: unknown): Promise<number> {
  if (!isRecord(body) || !Array.isArray(body.events)) throw new HttpError(400, "events must be a list.");
  const events = body.events;
  if (events.length === 0) return 0;
  if (events.length > MAX_BATCH) throw new HttpError(400, `At most ${MAX_BATCH} events at a time.`);
  const now = Date.now();
  const rows = events.map((event) => {
    if (!isRecord(event)) throw new HttpError(400, "Each event must be an object.");
    if (!(CLIENT_EVENT_TYPES as readonly string[]).includes(event.type as string)) throw new HttpError(400, "This event type cannot be sent from the browser.");
    const age = typeof event.ageMs === "number" && Number.isFinite(event.ageMs) ? Math.min(MAX_AGE_MS, Math.max(0, Math.round(event.ageMs))) : 0;
    return { type: event.type as ActivityType, target: cleanTarget(event.targetKind, event.targetId), detail: cleanDetail(event.detail), at: new Date(now - age).toISOString() };
  });

  const db = getDatabase();
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE user_id = ? AND at > ?")
    .get<{ n: number | string }>(userId, new Date(now - 60_000).toISOString());
  if (Number(recent?.n ?? 0) + rows.length > MAX_PER_MINUTE) throw new HttpError(429, "Too many events; slow down.");

  const client = clientLabel(req.headers.get("user-agent"));
  await db.transaction(async () => {
    for (const row of rows) await insert(userId, row.at, row.type, row.target, row.detail, client);
  });
  return rows.length;
}

interface EventRow {
  id: string;
  at: string;
  type: ActivityType;
  target_kind: ActivityTargetKind | null;
  target_id: string | null;
  detail: string;
  client: string;
}

function toEvent(row: EventRow): ActivityEvent {
  let detail: ActivityDetail = {};
  try { detail = JSON.parse(row.detail) as ActivityDetail; } catch { /* keep {} */ }
  return { id: row.id, at: row.at, type: row.type, targetKind: row.target_kind, targetId: row.target_id, detail, client: row.client };
}

/** Actions on a question that count as having looked at it, short of practising it. */
const LOOKED_AT = ["me.answer.view", "me.teach.open", "ai.followup.ask", "ai.studypack.open", "chatgpt.send", "mark.set"];

/**
 * For each Made Easy test: which saved questions were practised (last result right or wrong), only looked
 * at, or never touched. Practice comes from recovery_practice, which predates the activity log.
 */
export async function madeEasyCoverage(userId: string): Promise<MadeEasyCoverage[] | null> {
  if (!canReadMadeEasy(userId)) return null;
  const db = getDatabase();
  const practice = await db.prepare("SELECT question_id, correct, created_at FROM recovery_practice WHERE user_id = ? ORDER BY created_at")
    .all<{ question_id: string; correct: number; created_at: string }>(userId);
  const practised = new Map<string, { attempts: number; lastCorrect: boolean; lastAt: string }>();
  for (const row of practice) {
    const before = practised.get(row.question_id);
    practised.set(row.question_id, { attempts: (before?.attempts ?? 0) + 1, lastCorrect: Boolean(Number(row.correct)), lastAt: row.created_at });
  }
  const looked = await db.prepare(`SELECT target_id, MAX(at) AS last_at FROM activity_events
    WHERE user_id = ? AND target_kind = 'made_easy' AND client <> ? AND type IN (${LOOKED_AT.map(() => "?").join(", ")})
    GROUP BY target_id`).all<{ target_id: string; last_at: string }>(userId, CLAUDE_CLIENT, ...LOOKED_AT);
  const lookedAt = new Map(looked.map((row) => [row.target_id, row.last_at]));

  const tests = new Map<string, MadeEasyCoverage>();
  for (const q of allMadeEasyQuestions()) {
    let test = tests.get(q.testCode);
    if (!test) {
      test = { code: q.testCode, title: q.testTitle, questions: [], counts: { correct: 0, wrong: 0, viewed: 0, untouched: 0 } };
      tests.set(q.testCode, test);
    }
    const p = practised.get(q.id);
    const state: CoverageState = p ? (p.lastCorrect ? "correct" : "wrong") : lookedAt.has(q.id) ? "viewed" : "untouched";
    test.questions.push({ id: q.id, number: q.number, state, attempts: p?.attempts ?? 0, lastAt: p?.lastAt ?? lookedAt.get(q.id) ?? null });
    test.counts[state]++;
  }
  return [...tests.values()]
    .map((t) => ({ ...t, questions: t.questions.sort((a, b) => a.number - b.number) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** The learner's own log (newest first, Claude's testing left out) and their Made Easy coverage. */
export async function activityOverview(userId: string): Promise<ActivityOverview> {
  const db = getDatabase();
  const rows = await db.prepare(`SELECT id, at, type, target_kind, target_id, detail, client FROM activity_events
    WHERE user_id = ? AND client <> ? ORDER BY at DESC LIMIT ${LIST_LIMIT}`).all<EventRow>(userId, CLAUDE_CLIENT);
  const first = await db.prepare("SELECT MIN(at) AS first_at FROM activity_events WHERE user_id = ? AND client <> ?")
    .get<{ first_at: string | null }>(userId, CLAUDE_CLIENT);
  const hidden = await db.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE user_id = ? AND client = ?")
    .get<{ n: number | string }>(userId, CLAUDE_CLIENT);
  return {
    events: rows.map(toEvent),
    coverage: await madeEasyCoverage(userId),
    trackingSince: first?.first_at ?? null,
    hiddenTestEvents: Number(hidden?.n ?? 0),
  };
}
