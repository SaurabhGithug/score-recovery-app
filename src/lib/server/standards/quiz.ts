/**
 * Timed MCQ tests on a standard. No AI calls: questions come from standard_questions (verified only).
 * Secrecy rule: an AttemptView is built field by field from the question's id, clause, stem and option
 * texts, so the key, explanation, option notes and proof quote cannot reach the browser before submit.
 * The deadline is fixed when the attempt starts; the clock is injectable for tests.
 */
import { HttpError, isRecord, validId } from "../bank/http";
import { StandardsRepository, type ClauseRow, type StandardRow } from "./repo";
import { QuizRepository } from "./quiz-repo";
import { AttemptRepository, newAttemptId, type AttemptRow } from "./attempt-repo";
import {
  OPTION_IDS,
  type AnswerState,
  type AttemptQuestion,
  type AttemptSummary,
  type AttemptView,
  type ClauseBreakdown,
  type OptionId,
  type QuizOverview,
  type QuizScope,
  type ResultQuestion,
  type ResultView,
  type StandardQuestion,
} from "../../standards/quiz-types";

export const QUIZ_SECTIONS = ["4", "5", "6", "7", "8"] as const;
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 60;
export const MIN_LIMIT_SECONDS = 60;
export const MAX_LIMIT_SECONDS = 4 * 60 * 60;
export const DEFAULT_SECONDS_PER_QUESTION = 60;
/** Answers that arrive this long after the deadline still count (network latency, the auto-submit itself). */
export const GRACE_SECONDS = 10;
const RECENT_ATTEMPTS = 3;
const HISTORY_SIZE = 10;

/** 409 with the id of the attempt that is still running, so the browser can offer to resume it. */
export class ActiveAttemptError extends HttpError {
  readonly activeAttemptId: string;
  constructor(activeAttemptId: string) {
    super(409, "A timed test on this standard is still running. Resume it, or let its time run out, before starting another.");
    this.activeAttemptId = activeAttemptId;
  }
}

export interface QuizDeps {
  now: () => Date;
  /** Seeds the shuffle; tests may pin it. */
  random: () => number;
}

// ---------------------------------------------------------------- pure helpers

/** "4".."8" for clauses 4-8 and their sub-clauses; null for terms, annexes, foreword, introduction. */
export function sectionOf(clauseNo: string): (typeof QUIZ_SECTIONS)[number] | null {
  const head = clauseNo.split(".")[0];
  return (QUIZ_SECTIONS as readonly string[]).includes(head) ? (head as (typeof QUIZ_SECTIONS)[number]) : null;
}

/** The clause and every clause below it (by parent_no), e.g. 7.8 → 7.8, 7.8.1 … 7.8.8. */
export function clauseFamily(clauseNo: string, clauses: Pick<ClauseRow, "clause_no" | "parent_no">[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of clauses) if (c.parent_no) children.set(c.parent_no, [...(children.get(c.parent_no) ?? []), c.clause_no]);
  const out = new Set<string>([clauseNo]);
  const queue = [clauseNo];
  while (queue.length) for (const child of children.get(queue.shift()!) ?? []) if (!out.has(child)) { out.add(child); queue.push(child); }
  return out;
}

function unitsInScope(scope: QuizScope, clauses: ClauseRow[]): Set<string> | undefined {
  if (scope.kind === "all") return undefined;
  if (scope.kind === "section") return new Set(clauses.filter((c) => sectionOf(c.clause_no) === scope.section).map((c) => c.clause_no));
  return clauseFamily(scope.clauseNo, clauses);
}

function clauseName(clauseNo: string, clauses: ClauseRow[]): string {
  const title = clauses.find((c) => c.clause_no === clauseNo)?.title.trim() ?? "";
  if (/^\d/.test(clauseNo)) return `Clause ${clauseNo}${title ? ` ${title}` : ""}`;
  if (/^[A-Z](\.|$)/.test(clauseNo)) return /^Annex\b/i.test(title) ? title : `${clauseNo}${title ? ` ${title}` : ""}`;
  return title || clauseNo;
}

export function scopeLabel(scope: QuizScope, clauses: ClauseRow[]): string {
  if (scope.kind === "all") return "Whole standard";
  if (scope.kind === "section") {
    const title = clauses.find((c) => c.clause_no === scope.section)?.title.trim();
    return `Clause ${scope.section}${title ? ` – ${title}` : ""}`;
  }
  return clauseName(scope.clauseNo, clauses);
}

/** Validates a scope from a request body against the standard's clauses. */
export function parseScope(raw: unknown, clauses: ClauseRow[]): QuizScope {
  if (!isRecord(raw)) throw new HttpError(400, "Choose what the test covers (scope).");
  if (raw.kind === "all") return { kind: "all" };
  if (raw.kind === "section") {
    const section = typeof raw.section === "number" ? String(raw.section) : raw.section;
    if (typeof section !== "string" || !(QUIZ_SECTIONS as readonly string[]).includes(section)) throw new HttpError(400, "The section must be one of clauses 4 to 8.");
    return { kind: "section", section: section as (typeof QUIZ_SECTIONS)[number] };
  }
  if (raw.kind === "clause") {
    const clauseNo = raw.clauseNo;
    if (typeof clauseNo !== "string" || !clauses.some((c) => c.clause_no === clauseNo)) throw new HttpError(400, "No such clause in this standard.");
    return { kind: "clause", clauseNo };
  }
  throw new HttpError(400, 'The scope kind must be "all", "section" or "clause".');
}

/** Stored scopes were validated when written; a broken one falls back to the whole standard. */
function storedScope(raw: string): QuizScope {
  try {
    const v = JSON.parse(raw) as QuizScope;
    if (v && (v.kind === "all" || v.kind === "section" || v.kind === "clause")) return v;
  } catch {
    /* fall through */
  }
  return { kind: "all" };
}

function storedIds(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const isOption = (v: unknown): v is OptionId => typeof v === "string" && (OPTION_IDS as string[]).includes(v);

/**
 * Responses from a request body. Strict: every key must be one of the attempt's questions and every
 * answer A-D or null. Seconds are clamped to the attempt's limit.
 */
export function parseResponses(raw: unknown, ids: Set<string>, limitSeconds: number): Record<string, AnswerState> {
  if (!isRecord(raw)) throw new HttpError(400, "responses must be an object keyed by question id.");
  const out: Record<string, AnswerState> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!ids.has(id)) throw new HttpError(400, "responses contains a question that is not in this test.");
    if (!isRecord(value)) throw new HttpError(400, "Each response must be an object { answer, marked, seconds }.");
    const answer = value.answer ?? null;
    if (answer !== null && !isOption(answer)) throw new HttpError(400, "Answers must be A, B, C, D or null.");
    if (value.marked !== undefined && typeof value.marked !== "boolean") throw new HttpError(400, "marked must be true or false.");
    const seconds = value.seconds ?? 0;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) throw new HttpError(400, "seconds must be a number of seconds.");
    out[id] = { answer, marked: value.marked === true, seconds: Math.min(Math.round(seconds), limitSeconds) };
  }
  return out;
}

/** Saved responses, re-checked leniently (anything malformed is dropped). */
function storedResponses(raw: string, ids: Set<string>, limitSeconds: number): Record<string, AnswerState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const out: Record<string, AnswerState> = {};
  for (const [id, v] of Object.entries(parsed)) {
    if (!ids.has(id) || !isRecord(v)) continue;
    const seconds = typeof v.seconds === "number" && Number.isFinite(v.seconds) && v.seconds >= 0 ? Math.min(Math.round(v.seconds), limitSeconds) : 0;
    out[id] = { answer: isOption(v.answer) ? v.answer : null, marked: v.marked === true, seconds };
  }
  return out;
}

/** Small seeded PRNG (mulberry32): the shuffle is reproducible from its seed. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks `count` questions balanced across the units (clauses) in the pool: one per unit per round,
 * random within a unit, questions seen in the learner's recent attempts last. Returns the test order.
 */
export function selectQuestions(pool: StandardQuestion[], count: number, recent: Set<string>, rnd: () => number): string[] {
  const byUnit = new Map<string, StandardQuestion[]>();
  for (const q of pool) byUnit.set(q.clauseNo, [...(byUnit.get(q.clauseNo) ?? []), q]);
  const queues = new Map<string, StandardQuestion[]>();
  for (const [unit, qs] of byUnit) {
    queues.set(unit, [...shuffle(qs.filter((q) => !recent.has(q.id)), rnd), ...shuffle(qs.filter((q) => recent.has(q.id)), rnd)]);
  }
  // Units that still have unseen questions go first, so a short test favours fresh material.
  const units = shuffle([...queues.keys()], rnd).sort((a, b) => Number(recent.has(queues.get(a)![0].id)) - Number(recent.has(queues.get(b)![0].id)));
  const picked: string[] = [];
  while (picked.length < count) {
    let progressed = false;
    for (const unit of units) {
      const q = queues.get(unit)!.shift();
      if (!q) continue;
      picked.push(q.id);
      progressed = true;
      if (picked.length === count) break;
    }
    if (!progressed) break;
  }
  return shuffle(picked, rnd);
}

function percent(correct: number, total: number): number {
  return total > 0 ? Math.round((100 * correct) / total) : 0;
}

// ---------------------------------------------------------------- service

export function createQuizService(overrides: Partial<QuizDeps> = {}) {
  const deps: QuizDeps = { now: () => new Date(), random: Math.random, ...overrides };

  async function ownedStandard(userId: string, standardId: unknown): Promise<StandardRow> {
    const standard = validId(standardId) ? await StandardsRepository.find(standardId, userId) : undefined;
    if (!standard) throw new HttpError(404, "No such standard.");
    return standard;
  }

  /** The attempt and its standard, both owned by this user; 404 for anything else (never reveals another user's attempt). */
  async function ownedAttempt(userId: string, attemptId: unknown): Promise<{ row: AttemptRow; standard: StandardRow }> {
    const row = validId(attemptId) ? await AttemptRepository.find(attemptId, userId) : undefined;
    const standard = row ? await StandardsRepository.find(row.standard_id, userId) : undefined;
    if (!row || !standard) throw new HttpError(404, "No such test.");
    return { row, standard };
  }

  const deadlineMs = (row: AttemptRow) => new Date(row.deadline_at).getTime();
  const titleOf = (clauses: ClauseRow[]) => {
    const map = new Map(clauses.map((c) => [c.clause_no, c.title]));
    return (no: string) => map.get(no) ?? "";
  };

  function publicQuestion(q: StandardQuestion, title: (no: string) => string): AttemptQuestion {
    // Field by field on purpose: nothing else from the stored question may leave the server here.
    return { id: q.id, clauseNo: q.clauseNo, clauseTitle: title(q.clauseNo), stem: q.stem, options: q.options.map((o) => ({ id: o.id, text: o.text })) };
  }

  async function attemptView(row: AttemptRow, standard: StandardRow, clauses: ClauseRow[]): Promise<AttemptView> {
    const ids = storedIds(row.question_ids);
    const questions = await QuizRepository.getMany(standard.id, ids);
    const title = titleOf(clauses);
    const scope = storedScope(row.scope);
    return {
      id: row.id,
      standardId: standard.id,
      scope,
      scopeLabel: scopeLabel(scope, clauses),
      limitSeconds: row.limit_seconds,
      startedAt: row.started_at,
      deadlineAt: row.deadline_at,
      serverNow: deps.now().toISOString(),
      questions: questions.map((q) => publicQuestion(q, title)),
      responses: storedResponses(row.responses, new Set(questions.map((q) => q.id)), row.limit_seconds),
    };
  }

  function storedResult(row: AttemptRow): ResultView {
    try {
      return JSON.parse(row.result ?? "") as ResultView;
    } catch {
      throw new HttpError(500, "This test's result could not be read.");
    }
  }

  /** Scores and stores the attempt once. A concurrent finisher wins harmlessly: its stored result is returned. */
  async function finish(row: AttemptRow, standard: StandardRow, clauses: ClauseRow[], responses: Record<string, AnswerState>, auto: boolean): Promise<ResultView> {
    const now = deps.now();
    const ids = storedIds(row.question_ids);
    const questions = await QuizRepository.getMany(standard.id, ids);
    const title = titleOf(clauses);
    const scope = storedScope(row.scope);
    const submittedMs = Math.min(now.getTime(), deadlineMs(row));
    const startedMs = new Date(row.started_at).getTime();

    const results: ResultQuestion[] = questions.map((q) => {
      const r = responses[q.id];
      const yourAnswer = r?.answer ?? null;
      return {
        ...publicQuestion(q, title),
        yourAnswer,
        correct: yourAnswer === q.answer,
        answer: q.answer,
        explanation: q.explanation,
        optionNotes: q.optionNotes,
        proofQuote: q.proofQuote,
        proofClauseNo: q.proofClauseNo,
        seconds: r?.seconds ?? 0,
        marked: r?.marked ?? false,
      };
    });
    const ord = new Map(clauses.map((c) => [c.clause_no, c.ord]));
    const byClauseMap = new Map<string, ClauseBreakdown>();
    for (const q of results) {
      const b = byClauseMap.get(q.clauseNo) ?? { clauseNo: q.clauseNo, clauseTitle: q.clauseTitle, correct: 0, total: 0 };
      b.total += 1;
      if (q.correct) b.correct += 1;
      byClauseMap.set(q.clauseNo, b);
    }
    const correct = results.filter((q) => q.correct).length;
    const skipped = results.filter((q) => q.yourAnswer === null).length;
    const result: ResultView = {
      id: row.id,
      standardId: standard.id,
      scope,
      scopeLabel: scopeLabel(scope, clauses),
      limitSeconds: row.limit_seconds,
      startedAt: row.started_at,
      submittedAt: new Date(submittedMs).toISOString(),
      timeUsedSeconds: Math.max(0, Math.min(row.limit_seconds, Math.round((submittedMs - startedMs) / 1000))),
      autoSubmitted: auto,
      total: results.length,
      correct,
      wrong: results.length - correct - skipped,
      skipped,
      byClause: [...byClauseMap.values()].sort((a, b) => (ord.get(a.clauseNo) ?? 1e9) - (ord.get(b.clauseNo) ?? 1e9)),
      questions: results,
    };
    const stored = await AttemptRepository.finish(row.id, row.user_id, {
      responses: JSON.stringify(responses),
      submittedAt: result.submittedAt,
      autoSubmitted: auto,
      result: JSON.stringify(result),
    });
    if (stored) return result;
    const again = await AttemptRepository.find(row.id, row.user_id);
    if (again?.submitted_at) return storedResult(again);
    throw new HttpError(404, "No such test.");
  }

  /** Auto-submits (with the last saved answers) every unfinished attempt whose deadline has passed. */
  async function finishExpired(userId: string, standard: StandardRow, clauses: ClauseRow[]): Promise<AttemptRow[]> {
    const running: AttemptRow[] = [];
    const now = deps.now().getTime();
    for (const row of await AttemptRepository.unfinished(userId, standard.id)) {
      if (now >= deadlineMs(row)) {
        const ids = new Set(storedIds(row.question_ids));
        await finish(row, standard, clauses, storedResponses(row.responses, ids, row.limit_seconds), true);
      } else running.push(row);
    }
    return running;
  }

  function summary(row: AttemptRow, clauses: ClauseRow[]): AttemptSummary {
    const result = row.submitted_at && row.result ? safeParse<ResultView>(row.result) : null;
    return {
      id: row.id,
      scopeLabel: result?.scopeLabel ?? scopeLabel(storedScope(row.scope), clauses),
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      limitSeconds: row.limit_seconds,
      total: result?.total ?? storedIds(row.question_ids).length,
      correct: result ? result.correct : null,
    };
  }

  return {
    /** GET /api/standards/<id>/quiz */
    async overview(userId: string, standardId: unknown): Promise<QuizOverview> {
      const standard = await ownedStandard(userId, standardId);
      const clauses = await StandardsRepository.clauses(standard.id);
      await finishExpired(userId, standard, clauses);
      const questions = await QuizRepository.listVerified(standard.id, clauses);
      const byClause: Record<string, number> = {};
      const bySection: Record<string, number> = {};
      for (const q of questions) {
        byClause[q.clauseNo] = (byClause[q.clauseNo] ?? 0) + 1;
        const section = sectionOf(q.clauseNo);
        if (section) bySection[section] = (bySection[section] ?? 0) + 1;
      }
      const rows = await AttemptRepository.listForStandard(userId, standard.id);
      const now = deps.now().getTime();
      const live = rows.find((r) => !r.submitted_at && now < deadlineMs(r));
      let best: number | null = null;
      for (const r of rows) {
        if (!r.submitted_at || !r.result) continue;
        const res = safeParse<ResultView>(r.result);
        if (res && res.total > 0) best = Math.max(best ?? 0, percent(res.correct, res.total));
      }
      return {
        available: { total: questions.length, byClause, bySection },
        history: rows.slice(0, HISTORY_SIZE).map((r) => summary(r, clauses)),
        active: live ? { id: live.id, deadlineAt: live.deadline_at, scopeLabel: scopeLabel(storedScope(live.scope), clauses) } : null,
        bestPercent: best,
      };
    },

    /** POST /api/standards/<id>/quiz { scope, count, secondsPerQuestion? | limitSeconds? } */
    async start(userId: string, standardId: unknown, body: unknown): Promise<AttemptView> {
      const standard = await ownedStandard(userId, standardId);
      if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
      const clauses = await StandardsRepository.clauses(standard.id);
      const scope = parseScope(body.scope, clauses);
      const count = body.count;
      if (typeof count !== "number" || !Number.isInteger(count) || count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
        throw new HttpError(400, `The number of questions must be a whole number from ${MIN_QUESTIONS} to ${MAX_QUESTIONS}.`);
      }
      const { limitSeconds, secondsPerQuestion } = body;
      if (limitSeconds !== undefined && secondsPerQuestion !== undefined) throw new HttpError(400, "Give either secondsPerQuestion or limitSeconds, not both.");
      if (limitSeconds !== undefined && (typeof limitSeconds !== "number" || !Number.isInteger(limitSeconds))) throw new HttpError(400, "limitSeconds must be a whole number of seconds.");
      if (secondsPerQuestion !== undefined && (typeof secondsPerQuestion !== "number" || !Number.isInteger(secondsPerQuestion) || secondsPerQuestion < 1)) {
        throw new HttpError(400, "secondsPerQuestion must be a whole number of seconds.");
      }

      const running = await finishExpired(userId, standard, clauses);
      if (running.length) throw new ActiveAttemptError(running[0].id);

      const pool = await QuizRepository.listVerified(standard.id, clauses, unitsInScope(scope, clauses));
      if (pool.length < MIN_QUESTIONS) {
        throw new HttpError(400, `Not enough verified questions yet: ${pool.length} available for ${scopeLabel(scope, clauses)}, at least ${MIN_QUESTIONS} are needed.`);
      }
      const n = Math.min(count, pool.length);
      const limit = (limitSeconds as number | undefined) ?? n * ((secondsPerQuestion as number | undefined) ?? DEFAULT_SECONDS_PER_QUESTION);
      if (limit < MIN_LIMIT_SECONDS || limit > MAX_LIMIT_SECONDS) throw new HttpError(400, "The time limit must be between 1 minute and 4 hours.");

      const recent = new Set((await AttemptRepository.listForStandard(userId, standard.id, RECENT_ATTEMPTS)).flatMap((r) => storedIds(r.question_ids)));
      const ids = selectQuestions(pool, n, recent, seededRandom(Math.floor(deps.random() * 2 ** 32)));
      const now = deps.now();
      const row: AttemptRow = {
        id: newAttemptId(),
        user_id: userId,
        standard_id: standard.id,
        scope: JSON.stringify(scope),
        question_ids: JSON.stringify(ids),
        limit_seconds: limit,
        started_at: now.toISOString(),
        deadline_at: new Date(now.getTime() + limit * 1000).toISOString(),
        responses: "{}",
        submitted_at: null,
        auto_submitted: 0,
        result: null,
      };
      await AttemptRepository.create(row);

      // Two starts at once (double tap, two tabs): the earliest running attempt wins, the other is removed.
      const nowMs = deps.now().getTime();
      const live = (await AttemptRepository.unfinished(userId, standard.id)).filter((r) => nowMs < deadlineMs(r));
      const winner = live.sort((a, b) => (a.started_at === b.started_at ? (a.id < b.id ? -1 : 1) : a.started_at < b.started_at ? -1 : 1))[0];
      if (winner && winner.id !== row.id) {
        await AttemptRepository.deleteUnstarted(row.id, userId);
        throw new ActiveAttemptError(winner.id);
      }
      return attemptView(row, standard, clauses);
    },

    /** GET /api/standards/quiz/attempt/<id>: the running attempt (to resume), or its result. */
    async get(userId: string, attemptId: unknown): Promise<AttemptView | ResultView> {
      const { row, standard } = await ownedAttempt(userId, attemptId);
      if (row.submitted_at) return storedResult(row);
      const clauses = await StandardsRepository.clauses(standard.id);
      if (deps.now().getTime() >= deadlineMs(row)) {
        return finish(row, standard, clauses, storedResponses(row.responses, new Set(storedIds(row.question_ids)), row.limit_seconds), true);
      }
      return attemptView(row, standard, clauses);
    },

    /** POST … { action: "save", responses }: autosave while the clock runs (and for GRACE_SECONDS after). */
    async save(userId: string, attemptId: unknown, body: Record<string, unknown>): Promise<{ saved: true; serverNow: string }> {
      const { row } = await ownedAttempt(userId, attemptId);
      if (row.submitted_at) throw new HttpError(409, "This test has already been submitted.");
      if (deps.now().getTime() > deadlineMs(row) + GRACE_SECONDS * 1000) throw new HttpError(409, "Time is up: answers can no longer be changed.");
      const responses = parseResponses(body.responses, new Set(storedIds(row.question_ids)), row.limit_seconds);
      if (!(await AttemptRepository.saveResponses(row.id, userId, JSON.stringify(responses)))) throw new HttpError(409, "This test has already been submitted.");
      return { saved: true, serverNow: deps.now().toISOString() };
    },

    /**
     * POST … { action: "submit", responses?, auto? }: scores on the server. Within the grace period the
     * body's answers count; later the body is ignored and the last saved answers are scored. Submitting
     * a finished attempt again returns the stored result.
     */
    async submit(userId: string, attemptId: unknown, body: Record<string, unknown>): Promise<ResultView> {
      const { row, standard } = await ownedAttempt(userId, attemptId);
      if (row.submitted_at) return storedResult(row);
      const clauses = await StandardsRepository.clauses(standard.id);
      const ids = new Set(storedIds(row.question_ids));
      const nowMs = deps.now().getTime();
      const inTime = nowMs <= deadlineMs(row) + GRACE_SECONDS * 1000;
      const responses =
        inTime && body.responses !== undefined ? parseResponses(body.responses, ids, row.limit_seconds) : storedResponses(row.responses, ids, row.limit_seconds);
      return finish(row, standard, clauses, responses, body.auto === true || nowMs > deadlineMs(row));
    },
  };
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export type QuizService = ReturnType<typeof createQuizService>;

/** The service the route handlers use (real clock). */
export const quizService = createQuizService();
