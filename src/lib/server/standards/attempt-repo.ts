import crypto from "node:crypto";
import { getDatabase } from "../db";

/** One row of standard_quiz_attempts (migrations/0011_standard_quiz.sql). JSON columns stay strings here. */
export interface AttemptRow {
  id: string;
  user_id: string;
  standard_id: string;
  /** JSON QuizScope. */
  scope: string;
  /** JSON string[] in test order. */
  question_ids: string;
  limit_seconds: number;
  started_at: string;
  deadline_at: string;
  /** JSON Record<questionId, AnswerState>. */
  responses: string;
  submitted_at: string | null;
  auto_submitted: number;
  /** JSON snapshot of the ResultView, written once at submit. */
  result: string | null;
}

export function newAttemptId(): string {
  return `sqa_${crypto.randomBytes(8).toString("hex")}`;
}

/** Attempts are private to their learner: every read and write is keyed on the user. */
export const AttemptRepository = {
  async create(row: Omit<AttemptRow, "responses" | "submitted_at" | "auto_submitted" | "result">): Promise<void> {
    await getDatabase()
      .prepare(
        `INSERT INTO standard_quiz_attempts (id, user_id, standard_id, scope, question_ids, limit_seconds, started_at, deadline_at, responses, submitted_at, auto_submitted, result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, 0, NULL)`
      )
      .run(row.id, row.user_id, row.standard_id, row.scope, row.question_ids, row.limit_seconds, row.started_at, row.deadline_at);
  },

  async find(id: string, userId: string): Promise<AttemptRow | undefined> {
    const row = await getDatabase().prepare("SELECT * FROM standard_quiz_attempts WHERE id = ? AND user_id = ?").get<AttemptRow>(id, userId);
    return row ? normalise(row) : undefined;
  },

  /** Newest first. */
  async listForStandard(userId: string, standardId: string, limit?: number): Promise<AttemptRow[]> {
    const rows = await getDatabase()
      .prepare(
        `SELECT * FROM standard_quiz_attempts WHERE user_id = ? AND standard_id = ? ORDER BY started_at DESC, id DESC${limit ? ` LIMIT ${Math.max(1, Math.floor(limit))}` : ""}`
      )
      .all<AttemptRow>(userId, standardId);
    return rows.map(normalise);
  },

  async unfinished(userId: string, standardId: string): Promise<AttemptRow[]> {
    const rows = await getDatabase()
      .prepare("SELECT * FROM standard_quiz_attempts WHERE user_id = ? AND standard_id = ? AND submitted_at IS NULL ORDER BY started_at, id")
      .all<AttemptRow>(userId, standardId);
    return rows.map(normalise);
  },

  /** Replaces the saved responses of a running attempt. Returns false when it was already submitted. */
  async saveResponses(id: string, userId: string, responses: string): Promise<boolean> {
    const res = await getDatabase()
      .prepare("UPDATE standard_quiz_attempts SET responses = ? WHERE id = ? AND user_id = ? AND submitted_at IS NULL")
      .run(responses, id, userId);
    return res.changes > 0;
  },

  /** Writes the result once. Returns false when another request finished the attempt first (the caller re-reads it). */
  async finish(id: string, userId: string, input: { responses: string; submittedAt: string; autoSubmitted: boolean; result: string }): Promise<boolean> {
    const res = await getDatabase()
      .prepare(
        "UPDATE standard_quiz_attempts SET responses = ?, submitted_at = ?, auto_submitted = ?, result = ? WHERE id = ? AND user_id = ? AND submitted_at IS NULL"
      )
      .run(input.responses, input.submittedAt, input.autoSubmitted ? 1 : 0, input.result, id, userId);
    return res.changes > 0;
  },

  /** Removes an attempt that was never used (only the loser of a double start calls this, on its own new row). */
  async deleteUnstarted(id: string, userId: string): Promise<void> {
    await getDatabase().prepare("DELETE FROM standard_quiz_attempts WHERE id = ? AND user_id = ? AND submitted_at IS NULL").run(id, userId);
  },
};

/** Postgres returns integers as strings in some drivers' modes; keep the row shape stable. */
function normalise(row: AttemptRow): AttemptRow {
  return { ...row, limit_seconds: Number(row.limit_seconds), auto_submitted: Number(row.auto_submitted) };
}
