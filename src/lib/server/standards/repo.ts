import crypto from "node:crypto";
import { getDatabase } from "../db";
import type { StandardUnit } from "./parse";

export interface StandardRow {
  id: string;
  owner_user_id: string;
  code: string;
  title: string;
  source_name: string;
  content_fp: string;
  created_at: string;
}

export interface ClauseRow {
  clause_no: string;
  parent_no: string | null;
  title: string;
  body: string;
  page: number;
  ord: number;
}

export interface LessonRow {
  clause_no: string;
  content_fp: string;
  lesson: string;
  model: string;
  grounded: number;
  sources: string;
  search_html: string | null;
  check_result: string | null;
  created_at: string;
}

/** Standards are private to their owner: every read is keyed on the owner. */
export const StandardsRepository = {
  async listForUser(userId: string): Promise<(StandardRow & { clauses: number; lessons: number })[]> {
    return getDatabase()
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM standard_clauses c WHERE c.standard_id = s.id) AS clauses,
                (SELECT COUNT(*) FROM standard_lessons l WHERE l.standard_id = s.id) AS lessons
         FROM standards s WHERE s.owner_user_id = ? ORDER BY s.created_at`
      )
      .all(userId);
  },

  async find(id: string, userId: string): Promise<StandardRow | undefined> {
    return getDatabase().prepare("SELECT * FROM standards WHERE id = ? AND owner_user_id = ?").get<StandardRow>(id, userId);
  },

  async clauses(standardId: string): Promise<ClauseRow[]> {
    return getDatabase()
      .prepare("SELECT clause_no, parent_no, title, body, page, ord FROM standard_clauses WHERE standard_id = ? ORDER BY ord")
      .all<ClauseRow>(standardId);
  },

  async lessons(standardId: string): Promise<LessonRow[]> {
    return getDatabase().prepare("SELECT * FROM standard_lessons WHERE standard_id = ?").all<LessonRow>(standardId);
  },

  async lesson(standardId: string, clauseNo: string): Promise<LessonRow | undefined> {
    return getDatabase().prepare("SELECT * FROM standard_lessons WHERE standard_id = ? AND clause_no = ?").get<LessonRow>(standardId, clauseNo);
  },

  async saveLesson(standardId: string, row: Omit<LessonRow, "check_result">): Promise<void> {
    await getDatabase()
      .prepare(
        `INSERT INTO standard_lessons (standard_id, clause_no, content_fp, lesson, model, grounded, sources, search_html, check_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT (standard_id, clause_no) DO UPDATE SET content_fp = excluded.content_fp, lesson = excluded.lesson, model = excluded.model,
           grounded = excluded.grounded, sources = excluded.sources, search_html = excluded.search_html, check_result = NULL, created_at = excluded.created_at`
      )
      .run(standardId, row.clause_no, row.content_fp, row.lesson, row.model, row.grounded, row.sources, row.search_html, row.created_at);
  },

  /** Stores the second AI's verdict, only if the lesson it checked is still the current one. */
  async saveLessonCheck(standardId: string, clauseNo: string, createdAt: string, check: unknown): Promise<void> {
    await getDatabase()
      .prepare("UPDATE standard_lessons SET check_result = ? WHERE standard_id = ? AND clause_no = ? AND created_at = ?")
      .run(JSON.stringify(check), standardId, clauseNo, createdAt);
  },

  async saveAnswerCheck(id: string, userId: string, result: unknown): Promise<void> {
    await getDatabase()
      .prepare(
        `INSERT INTO standard_answer_checks (id, user_id, result, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET result = excluded.result`
      )
      .run(id, userId, JSON.stringify(result), new Date().toISOString());
  },

  async answerCheck(id: string, userId: string): Promise<{ result: string; created_at: string } | undefined> {
    return getDatabase().prepare("SELECT result, created_at FROM standard_answer_checks WHERE id = ? AND user_id = ?").get(id, userId);
  },

  /**
   * Imports (or re-imports) a parsed standard for one owner. Same content → nothing changes and the
   * lessons are kept; changed content replaces the clauses and drops the lessons made for the old text.
   */
  async importStandard(input: { ownerUserId: string; code: string; title: string; sourceName: string; units: StandardUnit[] }): Promise<{ id: string; changed: boolean }> {
    const db = getDatabase();
    const fp = crypto.createHash("sha256").update(JSON.stringify(input.units.map((u) => [u.clauseNo, u.title, u.body]))).digest("hex").slice(0, 32);
    return db.transaction(async () => {
      const existing = await db.prepare("SELECT id, content_fp FROM standards WHERE owner_user_id = ? AND code = ?").get<{ id: string; content_fp: string }>(input.ownerUserId, input.code);
      if (existing?.content_fp === fp) return { id: existing.id, changed: false };
      const id = existing?.id ?? `std_${crypto.randomBytes(8).toString("hex")}`;
      if (existing) {
        await db.prepare("DELETE FROM standard_clauses WHERE standard_id = ?").run(id);
        await db.prepare("DELETE FROM standard_lessons WHERE standard_id = ?").run(id);
        await db.prepare("UPDATE standards SET title = ?, source_name = ?, content_fp = ? WHERE id = ?").run(input.title, input.sourceName, fp, id);
      } else {
        await db
          .prepare("INSERT INTO standards (id, owner_user_id, code, title, source_name, content_fp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(id, input.ownerUserId, input.code, input.title, input.sourceName, fp, new Date().toISOString());
      }
      for (const u of input.units) {
        await db
          .prepare("INSERT INTO standard_clauses (standard_id, clause_no, parent_no, title, body, page, ord) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(id, u.clauseNo, u.parentNo, u.title, u.body, u.page, u.ord);
      }
      return { id, changed: true };
    });
  },
};
