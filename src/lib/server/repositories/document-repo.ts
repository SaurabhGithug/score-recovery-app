import { getDatabase } from "../db";
import crypto from "node:crypto";

export type ExtractionStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PROCESSING"
  | "READY"
  | "PARTIAL"
  | "FAILED";

export interface StudyDocumentRecord {
  id: string;
  user_id: string;
  preparation_context_id: string | null;
  original_name: string;
  mime_type: string;
  storage_path: string | null;
  file_size_bytes: number;
  document_type: string;
  extraction_status: ExtractionStatus;
  status_message: string | null;
  parser_used: string | null;
  page_count: number;
  questions_count: number;
  ready_questions_count: number;
  review_questions_count: number;
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface DocumentPageRecord {
  id: string;
  document_id: string;
  page_number: number;
  raw_text: string | null;
  markdown: string | null;
  parser: string | null;
  confidence: number;
  image_path: string | null;
  metadata: string;
  created_at: string;
}

export class DocumentRepository {
  public static async create(data: {
    userId: string;
    preparationContextId?: string | null;
    originalName: string;
    mimeType: string;
    storagePath: string | null;
    fileSizeBytes: number;
    documentType?: string;
  }): Promise<StudyDocumentRecord> {
    const db = getDatabase();
    const id = `doc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO study_documents (
        id, user_id, preparation_context_id, original_name, mime_type, storage_path, file_size_bytes,
        document_type, extraction_status, status_message, parser_used,
        page_count, questions_count, ready_questions_count, review_questions_count,
        metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', 'Queued for processing', NULL, 0, 0, 0, 0, '{}', ?, ?)
    `);

    await stmt.run(
      id,
      data.userId,
      data.preparationContextId ?? null,
      data.originalName,
      data.mimeType,
      data.storagePath,
      data.fileSizeBytes,
      data.documentType ?? "UNKNOWN",
      now,
      now
    );

    return (await this.findById(id, data.userId))!;
  }

  public static async findById(id: string, userId?: string): Promise<StudyDocumentRecord | null> {
    const db = getDatabase();
    let query = "SELECT * FROM study_documents WHERE id = ?";
    const params: string[] = [id];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    const stmt = db.prepare(query);
    const row = await stmt.get<StudyDocumentRecord>(...params);
    return row ?? null;
  }

  public static async listByUserId(userId: string, preparationContextId?: string | null): Promise<StudyDocumentRecord[]> {
    const db = getDatabase();
    if (preparationContextId) {
      const stmt = db.prepare(`
        SELECT * FROM study_documents
        WHERE user_id = ? AND preparation_context_id = ?
        ORDER BY created_at DESC
      `);
      return stmt.all<StudyDocumentRecord>(userId, preparationContextId);
    }
    const stmt = db.prepare("SELECT * FROM study_documents WHERE user_id = ? ORDER BY created_at DESC");
    return stmt.all<StudyDocumentRecord>(userId);
  }

  public static async updateStatus(
    id: string,
    status: ExtractionStatus,
    statusMessage?: string | null,
    parserUsed?: string | null
  ): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE study_documents
      SET extraction_status = ?, status_message = ?, parser_used = COALESCE(?, parser_used), updated_at = ?
      WHERE id = ?
    `);
    await stmt.run(status, statusMessage ?? null, parserUsed ?? null, now, id);
  }

  public static async updateCountsAndDetails(
    id: string,
    details: {
      pageCount?: number;
      questionsCount?: number;
      readyQuestionsCount?: number;
      reviewQuestionsCount?: number;
      documentType?: string;
      parserUsed?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const current = await this.findById(id);
    if (!current) return;

    const stmt = db.prepare(`
      UPDATE study_documents
      SET page_count = COALESCE(?, page_count),
          questions_count = COALESCE(?, questions_count),
          ready_questions_count = COALESCE(?, ready_questions_count),
          review_questions_count = COALESCE(?, review_questions_count),
          document_type = COALESCE(?, document_type),
          parser_used = COALESCE(?, parser_used),
          metadata = COALESCE(?, metadata),
          updated_at = ?
      WHERE id = ?
    `);

    await stmt.run(
      details.pageCount ?? null,
      details.questionsCount ?? null,
      details.readyQuestionsCount ?? null,
      details.reviewQuestionsCount ?? null,
      details.documentType ?? null,
      details.parserUsed ?? null,
      details.metadata ? JSON.stringify(details.metadata) : null,
      now,
      id
    );
  }

  /** Sets one top-level key of the document's metadata JSON, keeping every other key. */
  public static async setMetadataKey(id: string, key: string, value: unknown): Promise<void> {
    const current = await this.findById(id);
    if (!current) return;
    let metadata: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(current.metadata || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
    } catch {
      // unreadable metadata is replaced rather than blocking the update
    }
    metadata[key] = value;
    const db = getDatabase();
    await db.prepare("UPDATE study_documents SET metadata = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(metadata),
      new Date().toISOString(),
      id
    );
  }

  public static async insertPages(pages: {
    documentId: string;
    pageNumber: number;
    rawText: string | null;
    markdown: string | null;
    parser: string | null;
    confidence: number;
    imagePath?: string | null;
    metadata?: Record<string, unknown>;
  }[]): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO document_pages (
        id, document_id, page_number, raw_text, markdown, parser, confidence, image_path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const page of pages) {
      const pageId = `page_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await stmt.run(
        pageId,
        page.documentId,
        page.pageNumber,
        page.rawText,
        page.markdown,
        page.parser,
        page.confidence,
        page.imagePath ?? null,
        JSON.stringify(page.metadata ?? {}),
        now
      );
    }
  }

  public static async getPages(documentId: string): Promise<DocumentPageRecord[]> {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM document_pages WHERE document_id = ? ORDER BY page_number ASC");
    return stmt.all<DocumentPageRecord>(documentId);
  }

  public static async delete(id: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM study_documents WHERE id = ? AND user_id = ?");
    const result = await stmt.run(id, userId);
    return result.changes > 0;
  }
}
