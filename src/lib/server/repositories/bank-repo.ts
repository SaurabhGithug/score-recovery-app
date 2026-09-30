/**
 * Shared question bank storage (DECISION-002). Content (papers, questions, global evidence,
 * explanations) is shared by every learner; attempts and human_review evidence belong to one
 * learner. Keys are never stored on a question: `resolveKeyFor` / `resolveKeysForPapers` turn
 * evidence rows into a key through resolveAnswerKey(), the only function allowed to do that.
 *
 * Evidence scoping: rows with user_id '' apply to everyone; a learner's own rows (human_review)
 * are loaded only for that learner, so one learner's resolution never changes another's key.
 */
import crypto from "node:crypto";
import { getDatabase } from "../db";
import { contentFingerprint, madeForContent } from "../bank/content-fp";
import { resolveAnswerKey, type AnswerAuthority, type AnswerEvidence, type KeyStatus, type ResolvedKey } from "../../bank/answer-key";
import type {
  BankAttemptMode,
  BankAttemptResult,
  BankOption,
  BankPaperCode,
  BankPaperKind,
  BankResponses,
} from "../../bank/api-types";

type Row = Record<string, unknown>;

export interface BankPaperRecord {
  id: string;
  kind: BankPaperKind;
  exam: "SSC_JE";
  branch: "CIVIL";
  paper: BankPaperCode;
  cycleYear: number | null;
  examDate: string | null;
  shift: string | null;
  title: string;
  questionCount: number;
  durationMinutes: number;
  fidelity: string;
  publisher: string;
  sourceUrl: string | null;
  sourceFile: string | null;
  sourceSha256: string | null;
  capturedOn: string;
  rightsNote: string;
  /** '' = shared with every learner; otherwise private to this learner (see db.ts). */
  ownerUserId: string;
  metadata: Record<string, unknown>;
}

export interface BankQuestionRecord {
  id: string;
  paperId: string;
  position: number;
  section: string;
  stem: string;
  options: BankOption[];
  hasVisual: boolean;
  /** Relative to data/storage/pyp-crops (served by /api/bank/assets/<visualPath>). */
  visualPath: string | null;
  sourcePage: number | null;
  sourceSolution: string | null;
  topic: string | null;
  topicEvidence: string;
  metadata: Record<string, unknown>;
}

export interface BankEvidenceRecord extends AnswerEvidence {
  id: string;
  questionId: string;
  userId: string;
  detail: Record<string, unknown>;
}

export interface KeySnapshotEntry {
  status: KeyStatus;
  answer: string | null;
  /** The question could not be presented (see bank/presentable.ts), so it was not scored. */
  withheld?: true;
  /** The question content the learner answered (bank/content-fp.ts); absent on older attempts. */
  fp?: string;
}

/** What bank_attempts.result holds: the result plus the keys it was scored against. */
export interface StoredAttemptResult {
  result: BankAttemptResult;
  keySnapshot: Record<string, KeySnapshotEntry>;
}

export interface BankAttemptRecord {
  id: string;
  userId: string;
  paperId: string;
  mode: BankAttemptMode;
  section: string | null;
  durationSeconds: number | null;
  startedAt: string;
  submittedAt: string | null;
  responses: BankResponses;
  /** questionId → the answer locked by a practice-mode check (null = locked as unanswered). */
  checked: Record<string, string | null>;
  stored: StoredAttemptResult | null;
  /** questionId → content fingerprint of every in-scope question when the attempt started. */
  contentFps: Record<string, string>;
}

export interface BankExplanationRecord {
  questionId: string;
  lockedAnswer: string;
  note: string;
  model: string;
  createdAt: string;
  /** The question content the note was written for (bank/content-fp.ts). */
  contentFp: string;
}

/**
 * Evidence that is a judgement about the question's CONTENT (an AI solve of the text, a learner's
 * reading of the options) rather than a source's key for the question: valid only for the exact
 * content it was made for. Source keys (SSC ticks, publisher keys, Testbook) are re-derived from
 * the source on every import, so they are never stale.
 */
const CONTENT_BOUND: ReadonlySet<AnswerAuthority> = new Set(["ai_blind_solve", "human_review"]);

/** Drops content-bound evidence made for different content than the question has now. */
export function currentEvidence<T extends Pick<BankEvidenceRecord, "authority" | "detail">>(
  question: Pick<BankQuestionRecord, "stem" | "options">,
  rows: T[]
): T[] {
  const fp = contentFingerprint(question);
  return rows.filter((row) => !CONTENT_BOUND.has(row.authority) || madeForContent(row.detail, fp));
}

function toExplanation(row: Row): BankExplanationRecord {
  return {
    questionId: String(row.question_id),
    lockedAnswer: String(row.locked_answer),
    note: String(row.note),
    model: String(row.model),
    createdAt: String(row.created_at),
    contentFp: String(row.content_fp ?? ""),
  };
}

/** A note is usable only for the content it was written for. */
function freshFor(x: BankExplanationRecord, question: Pick<BankQuestionRecord, "stem" | "options">): boolean {
  return x.contentFp !== "" && x.contentFp === contentFingerprint(question);
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : null;
}

function toPaper(row: Row): BankPaperRecord {
  return {
    id: String(row.id),
    kind: row.kind as BankPaperKind,
    exam: "SSC_JE",
    branch: "CIVIL",
    paper: row.paper as BankPaperCode,
    cycleYear: num(row.cycle_year),
    examDate: str(row.exam_date),
    shift: str(row.shift),
    title: String(row.title),
    questionCount: num(row.question_count) ?? 0,
    durationMinutes: num(row.duration_minutes) ?? 120,
    fidelity: String(row.fidelity),
    publisher: String(row.publisher),
    sourceUrl: str(row.source_url),
    sourceFile: str(row.source_file),
    sourceSha256: str(row.source_sha256),
    capturedOn: String(row.captured_on),
    rightsNote: String(row.rights_note),
    ownerUserId: String(row.owner_user_id ?? ""),
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
  };
}

/** Can this learner see the paper at all? Private papers are invisible to everyone but their owner. */
export function paperVisibleTo(paper: Pick<BankPaperRecord, "ownerUserId">, userId: string): boolean {
  return paper.ownerUserId === "" || paper.ownerUserId === userId;
}

function toQuestion(row: Row): BankQuestionRecord {
  return {
    id: String(row.id),
    paperId: String(row.paper_id),
    position: num(row.position) ?? 0,
    section: String(row.section),
    stem: String(row.stem ?? ""),
    options: parseJson<BankOption[]>(row.options, []),
    hasVisual: num(row.has_visual) === 1,
    visualPath: str(row.visual_path),
    sourcePage: num(row.source_page),
    sourceSolution: str(row.source_solution),
    topic: str(row.topic),
    topicEvidence: String(row.topic_evidence ?? "pending"),
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
  };
}

function toEvidence(row: Row): BankEvidenceRecord {
  return {
    id: String(row.id),
    questionId: String(row.question_id),
    userId: String(row.user_id),
    authority: row.authority as AnswerAuthority,
    sourceGroup: String(row.source_group),
    sourceLabel: String(row.source_label),
    answer: str(row.answer),
    dropped: num(row.dropped) === 1,
    observedAt: String(row.observed_at),
    detail: parseJson<Record<string, unknown>>(row.detail, {}),
  };
}

function toAttempt(row: Row): BankAttemptRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    paperId: String(row.paper_id),
    mode: (str(row.mode) ?? "full") as BankAttemptMode,
    section: str(row.section),
    durationSeconds: num(row.duration_seconds),
    startedAt: String(row.started_at),
    submittedAt: str(row.submitted_at),
    responses: parseJson<BankResponses>(row.responses, {}),
    checked: parseJson<Record<string, string | null>>(row.checked, {}),
    stored: parseJson<StoredAttemptResult | null>(row.result, null),
    contentFps: parseJson<Record<string, string>>(row.content_fps, {}),
  };
}

function placeholders(n: number): string {
  return new Array(n).fill("?").join(", ");
}

/** Plain evidence (what the resolver sees), without storage ids/details. */
function asEvidence(row: BankEvidenceRecord): AnswerEvidence {
  return {
    authority: row.authority,
    sourceGroup: row.sourceGroup,
    sourceLabel: row.sourceLabel,
    answer: row.answer,
    dropped: row.dropped,
    observedAt: row.observedAt,
  };
}

export interface PaperUpsert {
  id: string;
  kind: BankPaperKind;
  paper: BankPaperCode;
  cycleYear: number | null;
  examDate: string | null;
  shift: string | null;
  title: string;
  questionCount: number;
  durationMinutes: number;
  fidelity: string;
  publisher: string;
  sourceUrl: string | null;
  sourceFile: string | null;
  sourceSha256: string | null;
  capturedOn: string;
  rightsNote: string;
  /** Omit (or '') for a shared paper. */
  ownerUserId?: string;
  metadata: Record<string, unknown>;
}

export interface QuestionUpsert {
  id: string;
  paperId: string;
  position: number;
  section: string;
  stem: string;
  options: BankOption[];
  hasVisual: boolean;
  visualPath: string | null;
  sourcePage: number | null;
  sourceSolution: string | null;
  topic: string | null;
  topicEvidence: string;
  metadata: Record<string, unknown>;
}

export interface GlobalEvidenceUpsert {
  questionId: string;
  authority: AnswerAuthority;
  sourceGroup: string;
  sourceLabel: string;
  answer: string | null;
  dropped?: boolean;
  detail: Record<string, unknown>;
}

export class BankRepository {
  // ------------------------------------------------------------------ transactions
  public static transaction<T>(fn: () => T): T {
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  // ------------------------------------------------------------------ papers
  /** Papers visible to `userId`: shared ones plus that learner's own private imports. */
  public static listPapers(userId: string, filter: { kind?: BankPaperKind; paper?: BankPaperCode } = {}): BankPaperRecord[] {
    const where: string[] = ["exam = 'SSC_JE'", "branch = 'CIVIL'", "(owner_user_id = '' OR owner_user_id = ?)"];
    const args: string[] = [userId];
    if (filter.kind) {
      where.push("kind = ?");
      args.push(filter.kind);
    }
    if (filter.paper) {
      where.push("paper = ?");
      args.push(filter.paper);
    }
    const rows = getDatabase()
      .prepare(`SELECT * FROM bank_papers WHERE ${where.join(" AND ")} ORDER BY kind, paper, exam_date DESC, shift, title`)
      .all(...args) as Row[];
    return rows.map(toPaper);
  }

  /** Unchecked lookup, for importers and internal jobs. Learner-facing code uses getPaperFor. */
  public static getPaper(id: string): BankPaperRecord | null {
    const row = getDatabase().prepare("SELECT * FROM bank_papers WHERE id = ?").get(id) as Row | undefined;
    return row ? toPaper(row) : null;
  }

  /** The paper if `userId` may see it, else null (callers answer 404: never confirm it exists). */
  public static getPaperFor(id: string, userId: string): BankPaperRecord | null {
    const paper = BankRepository.getPaper(id);
    return paper && paperVisibleTo(paper, userId) ? paper : null;
  }

  public static upsertPaper(p: PaperUpsert): void {
    const now = new Date().toISOString();
    getDatabase()
      .prepare(
        `INSERT INTO bank_papers (id, kind, exam, branch, paper, cycle_year, exam_date, shift, title, question_count,
           duration_minutes, fidelity, publisher, source_url, source_file, source_sha256, captured_on, rights_note,
           owner_user_id, metadata, created_at, updated_at)
         VALUES (?, ?, 'SSC_JE', 'CIVIL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, paper = excluded.paper, cycle_year = excluded.cycle_year,
           exam_date = excluded.exam_date, shift = excluded.shift, title = excluded.title,
           question_count = excluded.question_count, duration_minutes = excluded.duration_minutes,
           fidelity = excluded.fidelity, publisher = excluded.publisher, source_url = excluded.source_url,
           source_file = excluded.source_file, source_sha256 = excluded.source_sha256,
           captured_on = excluded.captured_on, rights_note = excluded.rights_note, metadata = excluded.metadata,
           updated_at = excluded.updated_at
         WHERE bank_papers.owner_user_id = excluded.owner_user_id`
      )
      .run(
        p.id,
        p.kind,
        p.paper,
        p.cycleYear,
        p.examDate,
        p.shift,
        p.title,
        p.questionCount,
        p.durationMinutes,
        p.fidelity,
        p.publisher,
        p.sourceUrl,
        p.sourceFile,
        p.sourceSha256,
        p.capturedOn,
        p.rightsNote,
        p.ownerUserId ?? "",
        JSON.stringify(p.metadata),
        now,
        now
      );
  }

  // ------------------------------------------------------------------ questions
  public static listQuestions(paperId: string): BankQuestionRecord[] {
    const rows = getDatabase()
      .prepare("SELECT * FROM bank_questions WHERE paper_id = ? ORDER BY position")
      .all(paperId) as Row[];
    return rows.map(toQuestion);
  }

  public static listQuestionsForPapers(paperIds: string[]): BankQuestionRecord[] {
    if (!paperIds.length) return [];
    const rows = getDatabase()
      .prepare(`SELECT * FROM bank_questions WHERE paper_id IN (${placeholders(paperIds.length)}) ORDER BY paper_id, position`)
      .all(...paperIds) as Row[];
    return rows.map(toQuestion);
  }

  /** Unchecked lookup, for importers and internal jobs. Learner-facing code uses getQuestionFor. */
  public static getQuestion(id: string): BankQuestionRecord | null {
    const row = getDatabase().prepare("SELECT * FROM bank_questions WHERE id = ?").get(id) as Row | undefined;
    return row ? toQuestion(row) : null;
  }

  /** The question if `userId` may see its paper, else null. */
  public static getQuestionFor(id: string, userId: string): BankQuestionRecord | null {
    const question = BankRepository.getQuestion(id);
    return question && BankRepository.getPaperFor(question.paperId, userId) ? question : null;
  }

  public static findQuestionsByVisualPath(visualPath: string): BankQuestionRecord[] {
    const rows = getDatabase().prepare("SELECT * FROM bank_questions WHERE visual_path = ?").all(visualPath) as Row[];
    return rows.map(toQuestion);
  }

  /**
   * Moves every question of a paper to a negative position so a re-import can reorder
   * positions without tripping UNIQUE(paper_id, position). Call inside a transaction.
   */
  public static parkPositions(paperId: string): void {
    getDatabase().prepare("UPDATE bank_questions SET position = -1000000 - position WHERE paper_id = ?").run(paperId);
  }

  public static upsertQuestion(q: QuestionUpsert): void {
    getDatabase()
      .prepare(
        `INSERT INTO bank_questions (id, paper_id, position, section, stem, options, has_visual, visual_path, source_page,
           source_solution, topic, topic_evidence, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET position = excluded.position, section = excluded.section, stem = excluded.stem,
           options = excluded.options, has_visual = excluded.has_visual, visual_path = excluded.visual_path,
           source_page = excluded.source_page, source_solution = excluded.source_solution, topic = excluded.topic,
           topic_evidence = excluded.topic_evidence, metadata = excluded.metadata`
      )
      .run(
        q.id,
        q.paperId,
        q.position,
        q.section,
        q.stem,
        JSON.stringify(q.options),
        q.hasVisual ? 1 : 0,
        q.visualPath,
        q.sourcePage,
        q.sourceSolution,
        q.topic,
        q.topicEvidence,
        JSON.stringify(q.metadata),
        new Date().toISOString()
      );
  }

  /** Deletes questions of `paperId` whose id is not in `keep` (cascades their evidence). Returns the count. */
  public static deleteQuestionsNotIn(paperId: string, keep: string[]): number {
    const db = getDatabase();
    const existing = db.prepare("SELECT id FROM bank_questions WHERE paper_id = ?").all(paperId) as Row[];
    const keepSet = new Set(keep);
    const stale = existing.map((row) => String(row.id)).filter((id) => !keepSet.has(id));
    const del = db.prepare("DELETE FROM bank_questions WHERE id = ?");
    for (const id of stale) del.run(id);
    return stale.length;
  }

  // ------------------------------------------------------------------ evidence
  /** Global evidence plus `userId`'s own rows for every question of the given papers, grouped by question. */
  public static loadEvidenceForPapers(paperIds: string[], userId: string): Map<string, BankEvidenceRecord[]> {
    const out = new Map<string, BankEvidenceRecord[]>();
    if (!paperIds.length) return out;
    const rows = getDatabase()
      .prepare(
        `SELECT e.* FROM bank_answer_evidence e
         JOIN bank_questions q ON q.id = e.question_id
         WHERE q.paper_id IN (${placeholders(paperIds.length)}) AND (e.user_id = '' OR e.user_id = ?)
         ORDER BY e.observed_at, e.id`
      )
      .all(...paperIds, userId) as Row[];
    for (const row of rows) {
      const ev = toEvidence(row);
      const list = out.get(ev.questionId);
      if (list) list.push(ev);
      else out.set(ev.questionId, [ev]);
    }
    return out;
  }

  public static loadEvidenceForQuestion(questionId: string, userId: string): BankEvidenceRecord[] {
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM bank_answer_evidence WHERE question_id = ? AND (user_id = '' OR user_id = ?)
         ORDER BY observed_at, id`
      )
      .all(questionId, userId) as Row[];
    return rows.map(toEvidence);
  }

  /** Global evidence rows of one paper (every learner's view shares these), for importers. */
  public static listGlobalEvidenceForPaper(paperId: string): BankEvidenceRecord[] {
    return BankRepository.listScopedEvidenceForPaper(paperId, "");
  }

  /** Evidence rows of one paper with exactly this scope ('' = global, else one learner's rows). */
  public static listScopedEvidenceForPaper(paperId: string, scopeUserId: string): BankEvidenceRecord[] {
    const rows = getDatabase()
      .prepare(
        `SELECT e.* FROM bank_answer_evidence e JOIN bank_questions q ON q.id = e.question_id
         WHERE q.paper_id = ? AND e.user_id = ?`
      )
      .all(paperId, scopeUserId) as Row[];
    return rows.map(toEvidence);
  }

  /** Insert or update one global (user_id '') evidence row, identified by (question, authority, label). */
  public static upsertGlobalEvidence(ev: GlobalEvidenceUpsert, observedAt = new Date().toISOString()): void {
    BankRepository.upsertScopedEvidence(ev, "", observedAt);
  }

  /**
   * Insert or update one evidence row in a scope: '' = every learner, or one learner's id for
   * evidence only that learner supplied (e.g. their own Testbook capture), which must never
   * reach another learner's key.
   */
  public static upsertScopedEvidence(ev: GlobalEvidenceUpsert, scopeUserId: string, observedAt = new Date().toISOString()): void {
    getDatabase()
      .prepare(
        `INSERT INTO bank_answer_evidence (id, question_id, user_id, authority, source_group, source_label, answer, dropped, detail, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(question_id, authority, source_label, user_id) DO UPDATE SET source_group = excluded.source_group,
           answer = excluded.answer, dropped = excluded.dropped, detail = excluded.detail,
           observed_at = CASE WHEN bank_answer_evidence.answer IS excluded.answer
                               AND bank_answer_evidence.dropped = excluded.dropped
                              THEN bank_answer_evidence.observed_at ELSE excluded.observed_at END`
      )
      .run(
        `bev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        ev.questionId,
        scopeUserId,
        ev.authority,
        ev.sourceGroup,
        ev.sourceLabel,
        ev.answer,
        ev.dropped ? 1 : 0,
        JSON.stringify(ev.detail),
        observedAt
      );
  }

  public static deleteEvidence(id: string): void {
    getDatabase().prepare("DELETE FROM bank_answer_evidence WHERE id = ?").run(id);
  }

  /**
   * Records a learner's own resolution of a disputed question (authority human_review,
   * user_id = that learner). One row per learner per question; a later call replaces it.
   */
  public static upsertHumanReview(
    question: Pick<BankQuestionRecord, "id" | "stem" | "options">,
    userId: string,
    answer: string | null,
    note: string | null
  ): void {
    if (!userId) throw new Error("A human review must belong to a learner.");
    const questionId = question.id;
    const now = new Date().toISOString();
    getDatabase()
      .prepare(
        `INSERT INTO bank_answer_evidence (id, question_id, user_id, authority, source_group, source_label, answer, dropped, detail, observed_at)
         VALUES (?, ?, ?, 'human_review', ?, 'Your review', ?, ?, ?, ?)
         ON CONFLICT(question_id, authority, source_label, user_id) DO UPDATE SET answer = excluded.answer,
           dropped = excluded.dropped, detail = excluded.detail, observed_at = excluded.observed_at`
      )
      .run(
        `bev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        questionId,
        userId,
        `learner:${userId}`,
        answer,
        answer === null ? 1 : 0,
        JSON.stringify({ note, content_fp: contentFingerprint(question) }),
        now
      );
  }

  // ------------------------------------------------------------------ keys
  /** The key from `evidence`, ignoring content-bound rows made for other content (currentEvidence). */
  public static resolveFrom(question: Pick<BankQuestionRecord, "stem" | "options">, evidence: BankEvidenceRecord[] | undefined): ResolvedKey {
    return resolveAnswerKey(currentEvidence(question, evidence ?? []).map(asEvidence), question.options.map((o) => o.id));
  }

  /** The key `userId` is scored against: global evidence + that learner's own rows only. */
  public static resolveKeyFor(questionId: string, userId: string): ResolvedKey | null {
    const question = BankRepository.getQuestion(questionId);
    if (!question) return null;
    return BankRepository.resolveFrom(question, BankRepository.loadEvidenceForQuestion(questionId, userId));
  }

  /** Keys for every question of the given papers, for one learner, with one evidence query. */
  public static resolveKeysForQuestions(questions: BankQuestionRecord[], userId: string): Map<string, ResolvedKey> {
    const paperIds = [...new Set(questions.map((q) => q.paperId))];
    const evidence = BankRepository.loadEvidenceForPapers(paperIds, userId);
    const out = new Map<string, ResolvedKey>();
    for (const q of questions) out.set(q.id, BankRepository.resolveFrom(q, evidence.get(q.id)));
    return out;
  }

  // ------------------------------------------------------------------ explanations
  /** The question's teaching note, or null when there is none or it was written for other content. */
  public static getExplanation(questionId: string): BankExplanationRecord | null {
    const row = getDatabase()
      .prepare("SELECT x.*, q.stem AS q_stem, q.options AS q_options FROM bank_explanations x JOIN bank_questions q ON q.id = x.question_id WHERE x.question_id = ?")
      .get(questionId) as Row | undefined;
    if (!row) return null;
    const x = toExplanation(row);
    return freshFor(x, { stem: String(row.q_stem ?? ""), options: parseJson<BankOption[]>(row.q_options, []) }) ? x : null;
  }

  /** Fresh notes (see getExplanation) of every question of a paper. */
  public static getExplanationsForPaper(paperId: string): Map<string, BankExplanationRecord> {
    const rows = getDatabase()
      .prepare(
        `SELECT x.*, q.stem AS q_stem, q.options AS q_options FROM bank_explanations x
         JOIN bank_questions q ON q.id = x.question_id WHERE q.paper_id = ?`
      )
      .all(paperId) as Row[];
    const out = new Map<string, BankExplanationRecord>();
    for (const row of rows) {
      const x = toExplanation(row);
      if (freshFor(x, { stem: String(row.q_stem ?? ""), options: parseJson<BankOption[]>(row.q_options, []) })) out.set(x.questionId, x);
    }
    return out;
  }

  public static saveExplanation(x: BankExplanationRecord): void {
    if (!x.contentFp) throw new Error("A teaching note must record the content it was written for.");
    getDatabase()
      .prepare(
        `INSERT INTO bank_explanations (question_id, locked_answer, note, model, created_at, content_fp) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(question_id) DO UPDATE SET locked_answer = excluded.locked_answer, note = excluded.note,
           model = excluded.model, created_at = excluded.created_at, content_fp = excluded.content_fp`
      )
      .run(x.questionId, x.lockedAnswer, x.note, x.model, x.createdAt, x.contentFp);
  }

  // ------------------------------------------------------------------ attempts
  public static createAttempt(input: {
    userId: string;
    paperId: string;
    mode: BankAttemptMode;
    section: string | null;
    durationSeconds: number | null;
    /** Content fingerprints of the in-scope questions as the learner is about to see them. */
    contentFps: Record<string, string>;
  }): BankAttemptRecord {
    const id = `bat_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const startedAt = new Date().toISOString();
    getDatabase()
      .prepare(
        `INSERT INTO bank_attempts (id, user_id, paper_id, mode, section, duration_seconds, started_at, responses, checked, content_fps)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '{}', ?)`
      )
      .run(id, input.userId, input.paperId, input.mode, input.section, input.durationSeconds, startedAt, JSON.stringify(input.contentFps));
    return {
      id,
      userId: input.userId,
      paperId: input.paperId,
      mode: input.mode,
      section: input.section,
      durationSeconds: input.durationSeconds,
      startedAt,
      submittedAt: null,
      responses: {},
      checked: {},
      stored: null,
      contentFps: input.contentFps,
    };
  }

  /** The attempt, only when it belongs to `userId` (callers answer 404 otherwise). */
  public static getAttemptForUser(id: string, userId: string): BankAttemptRecord | null {
    const row = getDatabase()
      .prepare("SELECT * FROM bank_attempts WHERE id = ? AND user_id = ?")
      .get(id, userId) as Row | undefined;
    return row ? toAttempt(row) : null;
  }

  public static listAttemptsForUser(userId: string, paperIds?: string[]): BankAttemptRecord[] {
    const db = getDatabase();
    const rows = (
      paperIds
        ? paperIds.length
          ? db
              .prepare(
                `SELECT * FROM bank_attempts WHERE user_id = ? AND paper_id IN (${placeholders(paperIds.length)})
                 ORDER BY started_at DESC, id DESC`
              )
              .all(userId, ...paperIds)
          : []
        : db.prepare("SELECT * FROM bank_attempts WHERE user_id = ? ORDER BY started_at DESC, id DESC").all(userId)
    ) as Row[];
    return rows.map(toAttempt);
  }

  /**
   * Of `questionIds`, those the learner has met in the adaptive-learning loop (learning_events,
   * owned by src/lib/server/learning), where checking an item shows its key. Read-only.
   */
  public static questionsSeenInLearning(userId: string, questionIds: string[]): string[] {
    if (!questionIds.length) return [];
    try {
      const rows = getDatabase()
        .prepare(`SELECT DISTINCT question_id FROM learning_events WHERE user_id = ? AND question_id IN (${placeholders(questionIds.length)})`)
        .all(userId, ...questionIds) as Row[];
      return rows.map((r) => String(r.question_id));
    } catch {
      return []; // learning tables not migrated in this database
    }
  }

  /** Saves responses of an unsubmitted attempt. Returns false when it was already submitted. */
  public static saveResponses(id: string, userId: string, responses: BankResponses): boolean {
    const r = getDatabase()
      .prepare("UPDATE bank_attempts SET responses = ? WHERE id = ? AND user_id = ? AND submitted_at IS NULL")
      .run(JSON.stringify(responses), id, userId);
    return Number(r.changes) === 1;
  }

  public static saveChecked(id: string, userId: string, responses: BankResponses, checked: Record<string, string | null>): boolean {
    const r = getDatabase()
      .prepare("UPDATE bank_attempts SET responses = ?, checked = ? WHERE id = ? AND user_id = ? AND submitted_at IS NULL")
      .run(JSON.stringify(responses), JSON.stringify(checked), id, userId);
    return Number(r.changes) === 1;
  }

  /** Marks the attempt submitted with its result. Returns false if it was already submitted (no overwrite). */
  public static submitAttempt(id: string, userId: string, responses: BankResponses, stored: StoredAttemptResult): boolean {
    const r = getDatabase()
      .prepare(
        `UPDATE bank_attempts SET responses = ?, result = ?, submitted_at = ?
         WHERE id = ? AND user_id = ? AND submitted_at IS NULL`
      )
      .run(JSON.stringify(responses), JSON.stringify(stored), stored.result.submittedAt, id, userId);
    return Number(r.changes) === 1;
  }
}
