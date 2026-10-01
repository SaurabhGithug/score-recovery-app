import crypto from "node:crypto";
import { getDatabase } from "../db";
import type { OptionId, QuizOption, StandardQuestion, QuestionStatus } from "../../standards/quiz-types";
import type { ClauseRow } from "./repo";

/** Fingerprint of the clause text a question was written from. Changing the clause hides its questions. */
export function clauseFingerprint(clause: Pick<ClauseRow, "clause_no" | "title" | "body">): string {
  return crypto.createHash("sha256").update(JSON.stringify([clause.clause_no, clause.title, clause.body])).digest("hex").slice(0, 32);
}

interface QuestionRow {
  id: string;
  standard_id: string;
  clause_no: string;
  clause_fp: string;
  stem: string;
  options: string;
  answer: string;
  explanation: string;
  option_notes: string;
  proof_quote: string;
  proof_clause_no: string;
  difficulty: number | string;
  level: string | null;
  status: string;
  generated_by: string;
  checked_by: string | null;
  check_independence: string | null;
  created_at: string;
}

function parse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toQuestion(r: QuestionRow): StandardQuestion {
  return {
    id: r.id,
    standardId: r.standard_id,
    clauseNo: r.clause_no,
    clauseFp: r.clause_fp,
    stem: r.stem,
    options: parse<QuizOption[]>(r.options, []),
    answer: r.answer as OptionId,
    explanation: r.explanation,
    optionNotes: parse<Partial<Record<OptionId, string>>>(r.option_notes, {}),
    proofQuote: r.proof_quote,
    proofClauseNo: r.proof_clause_no,
    difficulty: Number(r.difficulty) as 1 | 2 | 3,
    level: r.level as StandardQuestion["level"],
    status: r.status as QuestionStatus,
    generatedBy: r.generated_by,
    checkedBy: r.checked_by,
    checkIndependence: r.check_independence as StandardQuestion["checkIndependence"],
    createdAt: r.created_at,
  };
}

export type NewQuestion = Omit<StandardQuestion, "id" | "standardId" | "createdAt"> & { id?: string; createdAt?: string };

/** Questions are private to the standard's owner: callers must have proved ownership of standardId first (StandardsRepository.find). */
export const QuizRepository = {
  /** Replaces all stored questions of one clause with these (one transaction). */
  async replaceClauseQuestions(standardId: string, clauseNo: string, questions: NewQuestion[]): Promise<void> {
    const db = getDatabase();
    await db.transaction(async () => {
      await db.prepare("DELETE FROM standard_questions WHERE standard_id = ? AND clause_no = ?").run(standardId, clauseNo);
      for (const q of questions) {
        await db
          .prepare(
            `INSERT INTO standard_questions (id, standard_id, clause_no, clause_fp, stem, options, answer, explanation, option_notes, proof_quote,
               proof_clause_no, difficulty, level, status, generated_by, checked_by, check_independence, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            q.id ?? `sq_${crypto.randomBytes(8).toString("hex")}`,
            standardId,
            clauseNo,
            q.clauseFp,
            q.stem,
            JSON.stringify(q.options),
            q.answer,
            q.explanation,
            JSON.stringify(q.optionNotes),
            q.proofQuote,
            q.proofClauseNo,
            q.difficulty,
            q.level,
            q.status,
            q.generatedBy,
            q.checkedBy,
            q.checkIndependence,
            q.createdAt ?? new Date().toISOString()
          );
      }
    });
  },

  /** Verified questions whose clause is unchanged since they were written. Optionally limited to some clauses. */
  async listVerified(standardId: string, clauses: Pick<ClauseRow, "clause_no" | "title" | "body">[], only?: Set<string>): Promise<StandardQuestion[]> {
    const fps = new Map(clauses.map((c) => [c.clause_no, clauseFingerprint(c)]));
    const rows = await getDatabase()
      .prepare("SELECT * FROM standard_questions WHERE standard_id = ? AND status = 'verified' ORDER BY clause_no, created_at, id")
      .all<QuestionRow>(standardId);
    return rows.filter((r) => (!only || only.has(r.clause_no)) && fps.get(r.clause_no) === r.clause_fp).map(toQuestion);
  },

  async getMany(standardId: string, ids: string[]): Promise<StandardQuestion[]> {
    if (!ids.length) return [];
    const rows = await getDatabase()
      .prepare(`SELECT * FROM standard_questions WHERE standard_id = ? AND id IN (${ids.map(() => "?").join(", ")})`)
      .all<QuestionRow>(standardId, ...ids);
    const byId = new Map(rows.map((r) => [r.id, toQuestion(r)]));
    return ids.map((id) => byId.get(id)).filter((q): q is StandardQuestion => !!q);
  },

  /** Counts per clause and status, for the generator report and the quiz setup screen. */
  async counts(standardId: string): Promise<Record<string, { verified: number; needsReview: number }>> {
    const rows = await getDatabase()
      .prepare("SELECT clause_no, status, COUNT(*) AS n FROM standard_questions WHERE standard_id = ? GROUP BY clause_no, status")
      .all<{ clause_no: string; status: string; n: number | string }>(standardId);
    const out: Record<string, { verified: number; needsReview: number }> = {};
    for (const r of rows) {
      const c = (out[r.clause_no] ??= { verified: 0, needsReview: 0 });
      if (r.status === "verified") c.verified += Number(r.n);
      else c.needsReview += Number(r.n);
    }
    return out;
  },
};
