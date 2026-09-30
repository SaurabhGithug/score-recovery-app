import { getDatabase } from "../db";
import crypto from "node:crypto";

export type VerificationStatus =
  | "AUTO_ACCEPTED"
  | "VERIFIED"
  | "NEEDS_REVIEW"
  | "REJECTED";

export type SourceType = "EXTRACTED" | "GENERATED";

export interface QuestionOptionItem {
  id: "A" | "B" | "C" | "D" | string;
  text: string;
}

/** Thrown when a question would become practisable without a usable answer key. */
export class MissingAnswerKeyError extends Error {
  constructor() {
    super("A verified question needs a correct answer that matches one of its options.");
    this.name = "MissingAnswerKeyError";
  }
}

function keyMatchesOptions(answer: string | null, optionsJson: string): boolean {
  if (!answer) return false;
  try {
    return (JSON.parse(optionsJson) as QuestionOptionItem[]).some((option) => option.id === answer);
  } catch {
    return false;
  }
}

export interface ImportedQuestionRecord {
  id: string;
  document_id: string;
  user_id: string;
  preparation_context_id: string | null;
  question_number: number | null;
  question_text: string;
  question_type: string;
  options: string; // JSON string of QuestionOptionItem[]
  correct_answer: string | null;
  explanation: string | null;
  subject: string | null;
  topic: string | null;
  difficulty: number;
  source_page: number;
  source_bounding_box: string | null; // JSON string [ymin, xmin, ymax, xmax]
  source_image_crop: string | null;
  source_type: SourceType;
  extraction_confidence: number;
  verification_status: VerificationStatus;
  review_reason: string | null;
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export class QuestionRepository {
  public static createMany(
    questions: {
      documentId: string;
      userId: string;
      preparationContextId?: string | null;
      questionNumber?: number | null;
      questionText: string;
      questionType?: string;
      options: QuestionOptionItem[];
      correctAnswer?: string | null;
      explanation?: string | null;
      subject?: string | null;
      topic?: string | null;
      difficulty?: number;
      sourcePage: number;
      sourceBoundingBox?: number[] | null;
      sourceImageCrop?: string | null;
      sourceType?: SourceType;
      extractionConfidence?: number;
      verificationStatus?: VerificationStatus;
      reviewReason?: string | null;
      metadata?: Record<string, unknown>;
    }[]
  ): void {
    if (questions.length === 0) return;
    const db = getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO imported_questions (
        id, document_id, user_id, preparation_context_id, question_number, question_text, question_type,
        options, correct_answer, explanation, subject, topic, difficulty,
        source_page, source_bounding_box, source_image_crop, source_type,
        extraction_confidence, verification_status, review_reason, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of questions) {
      const qId = `iq_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      stmt.run(
        qId,
        q.documentId,
        q.userId,
        q.preparationContextId ?? null,
        q.questionNumber ?? null,
        q.questionText,
        q.questionType ?? "MCQ",
        JSON.stringify(q.options),
        q.correctAnswer ?? null,
        q.explanation ?? null,
        q.subject ?? null,
        q.topic ?? null,
        q.difficulty ?? 2,
        q.sourcePage,
        q.sourceBoundingBox ? JSON.stringify(q.sourceBoundingBox) : null,
        q.sourceImageCrop ?? null,
        q.sourceType ?? "EXTRACTED",
        q.extractionConfidence ?? 1.0,
        q.verificationStatus ?? "AUTO_ACCEPTED",
        q.reviewReason ?? null,
        JSON.stringify(q.metadata ?? {}),
        now,
        now
      );
    }
  }

  public static listByDocumentId(documentId: string, userId: string): ImportedQuestionRecord[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM imported_questions
      WHERE document_id = ? AND user_id = ?
      ORDER BY source_page ASC, question_number ASC, id ASC
    `);
    return stmt.all(documentId, userId) as unknown as ImportedQuestionRecord[];
  }

  public static listReadyForPractice(documentId: string, userId: string): ImportedQuestionRecord[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM imported_questions
      WHERE document_id = ? AND user_id = ? AND verification_status IN ('AUTO_ACCEPTED', 'VERIFIED')
      ORDER BY source_page ASC, question_number ASC, id ASC
    `);
    return stmt.all(documentId, userId) as unknown as ImportedQuestionRecord[];
  }

  public static findById(id: string, userId?: string): ImportedQuestionRecord | null {
    const db = getDatabase();
    let query = "SELECT * FROM imported_questions WHERE id = ?";
    const params: string[] = [id];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    const stmt = db.prepare(query);
    const row = stmt.get(...params) as unknown as ImportedQuestionRecord | undefined;
    return row ?? null;
  }

  public static updateVerification(
    id: string,
    userId: string,
    update: {
      status: VerificationStatus;
      questionText?: string;
      options?: QuestionOptionItem[];
      correctAnswer?: string | null;
      explanation?: string | null;
      reviewReason?: string | null;
    }
  ): ImportedQuestionRecord | null {
    const current = this.findById(id, userId);
    if (!current) return null;

    if (update.status === "VERIFIED" || update.status === "AUTO_ACCEPTED") {
      const answer = update.correctAnswer ?? current.correct_answer;
      const options = update.options ? JSON.stringify(update.options) : current.options;
      if (!keyMatchesOptions(answer, options)) throw new MissingAnswerKeyError();
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE imported_questions
      SET verification_status = ?,
          question_text = COALESCE(?, question_text),
          options = COALESCE(?, options),
          correct_answer = COALESCE(?, correct_answer),
          explanation = COALESCE(?, explanation),
          review_reason = ?,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `);

    stmt.run(
      update.status,
      update.questionText ?? null,
      update.options ? JSON.stringify(update.options) : null,
      update.correctAnswer ?? null,
      update.explanation ?? null,
      update.reviewReason ?? null,
      now,
      id,
      userId
    );

    // Refresh study document counts
    this.refreshDocumentCounts(current.document_id, userId);

    return this.findById(id, userId);
  }

  public static refreshDocumentCounts(documentId: string, userId: string): void {
    const db = getDatabase();
    const statsStmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN verification_status IN ('AUTO_ACCEPTED', 'VERIFIED') THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN verification_status = 'NEEDS_REVIEW' THEN 1 ELSE 0 END) as review
      FROM imported_questions
      WHERE document_id = ? AND user_id = ?
    `);
    const stats = statsStmt.get(documentId, userId) as unknown as { total: number; ready: number; review: number };
    if (stats) {
      const updateStmt = db.prepare(`
        UPDATE study_documents
        SET questions_count = ?, ready_questions_count = ?, review_questions_count = ?, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(stats.total || 0, stats.ready || 0, stats.review || 0, new Date().toISOString(), documentId);
    }
  }
}
