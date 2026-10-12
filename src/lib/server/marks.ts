/**
 * The learner's own marks on questions (Revise / Important / Super important) and their marked list.
 * Table: question_marks (migrations/0013_question_marks.sql). A question can be marked only when the
 * learner may see it; that rule comes from questionFacts (followup.ts), the same one the follow-up uses.
 */
import crypto from "node:crypto";
import { getDatabase } from "./db";
import { HttpError } from "./bank/http";
import { questionFacts } from "./followup/followup";
import { madeEasyQuestion } from "./made-easy";
import { MARK_LEVELS, MARK_NOTE_MAX, isMarkLevel, type MarkLevel, type MarkSourceKind, type MarkedQuestion, type MarkedQuestionView, type QuestionMark } from "@/lib/marks";

interface MarkRow {
  source_kind: MarkSourceKind;
  source_id: string;
  level: MarkLevel;
  note: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "source_kind, source_id, level, note, created_at, updated_at";

function toMark(row: MarkRow): QuestionMark {
  return { kind: row.source_kind, id: row.source_id, level: row.level, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at };
}

function target(kind: unknown, id: unknown): { kind: MarkSourceKind; id: string } {
  if (kind !== "bank" && kind !== "made_easy") throw new HttpError(400, "Unknown question source.");
  if (typeof id !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) throw new HttpError(400, "Question id required.");
  return { kind, id };
}

export async function getMark(userId: string, kind: unknown, id: unknown): Promise<QuestionMark | null> {
  const t = target(kind, id);
  const row = await getDatabase().prepare(`SELECT ${COLUMNS} FROM question_marks WHERE user_id = ? AND source_kind = ? AND source_id = ?`)
    .get<MarkRow>(userId, t.kind, t.id);
  return row ? toMark(row) : null;
}

/** Sets, changes or (with level null) clears the learner's mark. Returns the mark, or null once cleared. */
export async function setMark(userId: string, input: { kind: unknown; id: unknown; level: unknown; note?: unknown }): Promise<QuestionMark | null> {
  const t = target(input.kind, input.id);
  if (input.level === undefined) throw new HttpError(400, "A level is required (null clears the mark).");
  if (input.level !== null && !isMarkLevel(input.level)) throw new HttpError(400, "Choose Revise, Important or Super important.");
  if (input.note !== undefined && typeof input.note !== "string") throw new HttpError(400, "The note must be text.");
  const note = (input.note ?? "").trim();
  if (note.length > MARK_NOTE_MAX) throw new HttpError(400, `Keep the note under ${MARK_NOTE_MAX} characters.`);

  // Only a question this learner may see can be marked (403/404 otherwise).
  await questionFacts(userId, t);

  const db = getDatabase();
  if (input.level === null) {
    await db.prepare("DELETE FROM question_marks WHERE user_id = ? AND source_kind = ? AND source_id = ?").run(userId, t.kind, t.id);
    return null;
  }
  const now = new Date().toISOString();
  const id = `mark_${crypto.randomUUID().replaceAll("-", "")}`;
  // Changing the level without sending a note keeps the saved note; an explicit note replaces it.
  const noteUpdate = input.note === undefined ? "" : "note = excluded.note, ";
  await db.prepare(`INSERT INTO question_marks (id, user_id, source_kind, source_id, level, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source_kind, source_id) DO UPDATE SET level = excluded.level, ${noteUpdate}updated_at = excluded.updated_at`)
    .run(id, userId, t.kind, t.id, input.level, note, now, now);
  return getMark(userId, t.kind, t.id);
}

async function viewFor(userId: string, mark: QuestionMark): Promise<MarkedQuestionView> {
  const f = await questionFacts(userId, { kind: mark.kind, id: mark.id });
  // Made Easy questions keep the portal's own HTML (sanitized by madeEasyQuestion) so figures show.
  const me = mark.kind === "made_easy" ? madeEasyQuestion(mark.id) : null;
  return {
    heading: f.heading,
    question: f.question,
    questionHtml: me?.questionHtml ?? null,
    options: f.options.map((o, i) => ({ label: o.label, text: o.text, html: me?.optionsHtml?.[i] ?? null })),
    key: f.key,
    keySource: f.keySource,
    learnerAnswer: f.learnerAnswer,
    explanation: f.explanation,
    explanationHtml: me?.explanationHtml ?? null,
    incomplete: f.incomplete,
    imageUrl: f.crop?.clean ?? null,
    answerImageUrl: f.crop?.original && f.crop.original !== f.crop.clean ? f.crop.original : null,
  };
}

/** Every mark of this learner, most important first, then most recently marked. */
export async function listMarks(userId: string): Promise<MarkedQuestion[]> {
  const order = `CASE level ${MARK_LEVELS.map((level, i) => `WHEN '${level}' THEN ${i}`).join(" ")} END`;
  const rows = await getDatabase().prepare(`SELECT ${COLUMNS} FROM question_marks WHERE user_id = ? ORDER BY ${order}, updated_at DESC`)
    .all<MarkRow>(userId);
  const marks: MarkedQuestion[] = [];
  for (const row of rows) {
    const mark = toMark(row);
    try {
      marks.push({ ...mark, view: await viewFor(userId, mark), unavailable: null });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      marks.push({ ...mark, view: null, unavailable: err.message });
    }
  }
  return marks;
}
