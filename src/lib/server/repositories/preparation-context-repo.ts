import { getDatabase } from "../db";
import crypto from "node:crypto";

export type PreparationType = "COMPETITIVE_EXAM" | "ACADEMIC" | "BOTH";

export interface PreparationContextRecord {
  id: string;
  user_id: string;
  name: string;
  type: PreparationType;
  exam_category: string | null;
  exam_id: string | null;
  exam_name: string | null;
  department: string | null;
  branch: string | null;
  degree: string | null;
  year: number | null;
  semester: number | null;
  is_active: number; // 1 = true, 0 = false
  metadata: string;
  created_at: string;
  updated_at: string;
}

export class PreparationContextRepository {
  public static async createContext(data: {
    userId: string;
    name: string;
    type: PreparationType;
    examCategory?: string | null;
    examId?: string | null;
    examName?: string | null;
    department?: string | null;
    branch?: string | null;
    degree?: string | null;
    year?: number | null;
    semester?: number | null;
    setAsActive?: boolean;
  }): Promise<PreparationContextRecord> {
    const db = getDatabase();
    const id = `ctx_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date().toISOString();

    const setAsActive = data.setAsActive ?? true;

    // If setting as active, deactivate other contexts for this user first
    if (setAsActive) {
      const deactStmt = db.prepare("UPDATE preparation_contexts SET is_active = 0 WHERE user_id = ?");
      await deactStmt.run(data.userId);
    }

    const stmt = db.prepare(`
      INSERT INTO preparation_contexts (
        id, user_id, name, type, exam_category, exam_id, exam_name,
        department, branch, degree, year, semester, is_active, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    `);

    await stmt.run(
      id,
      data.userId,
      data.name,
      data.type,
      data.examCategory ?? null,
      data.examId ?? null,
      data.examName ?? null,
      data.department ?? null,
      data.branch ?? null,
      data.degree ?? null,
      data.year ?? null,
      data.semester ?? null,
      setAsActive ? 1 : 0,
      now,
      now
    );

    return (await this.findById(id, data.userId))!;
  }

  public static async listByUserId(userId: string): Promise<PreparationContextRecord[]> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM preparation_contexts
      WHERE user_id = ?
      ORDER BY is_active DESC, updated_at DESC
    `);
    return stmt.all<PreparationContextRecord>(userId);
  }

  public static async getActiveContext(userId: string): Promise<PreparationContextRecord | null> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM preparation_contexts
      WHERE user_id = ? AND is_active = 1
      LIMIT 1
    `);
    const row = await stmt.get<PreparationContextRecord>(userId);
    if (row) return row;

    // If no active context, return the most recent one and activate it
    const all = await this.listByUserId(userId);
    if (all.length > 0) {
      await this.setActiveContext(userId, all[0].id);
      return { ...all[0], is_active: 1 };
    }
    return null;
  }

  public static async setActiveContext(userId: string, contextId: string): Promise<boolean> {
    const db = getDatabase();
    const deactStmt = db.prepare("UPDATE preparation_contexts SET is_active = 0 WHERE user_id = ?");
    await deactStmt.run(userId);

    const actStmt = db.prepare("UPDATE preparation_contexts SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?");
    const res = await actStmt.run(new Date().toISOString(), contextId, userId);
    return res.changes > 0;
  }

  public static async findById(id: string, userId?: string): Promise<PreparationContextRecord | null> {
    const db = getDatabase();
    let query = "SELECT * FROM preparation_contexts WHERE id = ?";
    const params: string[] = [id];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    const stmt = db.prepare(query);
    const row = await stmt.get<PreparationContextRecord>(...params);
    return row ?? null;
  }

  public static async deleteContext(id: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const stmt = db.prepare("DELETE FROM preparation_contexts WHERE id = ? AND user_id = ?");
    const res = await stmt.run(id, userId);
    return res.changes > 0;
  }
}
