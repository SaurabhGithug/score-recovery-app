import crypto from "node:crypto";
import { getDatabase } from "../db";

export type FeedbackCategory = "content" | "experience" | "technical" | "idea" | "question_issue";

export interface FeedbackRecord {
  id: string;
  user_id: string;
  preparation_context_id: string | null;
  document_id: string | null;
  question_id: string | null;
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  placement: string;
  metadata: string;
  status: "OPEN" | "REVIEWED" | "RESOLVED";
  created_at: string;
}

export class FeedbackRepository {
  static async create(input: {
    userId: string;
    preparationContextId?: string | null;
    documentId?: string | null;
    questionId?: string | null;
    category: FeedbackCategory;
    rating?: number | null;
    message: string;
    placement?: string;
    metadata?: Record<string, unknown>;
  }): Promise<FeedbackRecord> {
    const db = getDatabase();
    const id = `feedback_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const createdAt = new Date().toISOString();

    await db.prepare(`
      INSERT INTO product_feedback (
        id, user_id, preparation_context_id, document_id, question_id,
        category, rating, message, placement, metadata, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(
      id,
      input.userId,
      input.preparationContextId ?? null,
      input.documentId ?? null,
      input.questionId ?? null,
      input.category,
      input.rating ?? null,
      input.message,
      input.placement ?? "unknown",
      JSON.stringify(input.metadata ?? {}),
      createdAt
    );

    return (await db.prepare("SELECT * FROM product_feedback WHERE id = ?").get<FeedbackRecord>(id))!;
  }
}
