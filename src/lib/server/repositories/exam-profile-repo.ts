import { getDatabase } from "../db";
import crypto from "node:crypto";
import { broPreferenceError, validBirthDate, ExamProfileValidationError, type CandidateGender } from "../../ssc-je/eligibility";

export type CandidateCategory = "UR" | "EWS" | "OBC" | "SC" | "ST";

export interface ExamProfileRecord {
  id: string;
  user_id: string;
  preparation_context_id: string;
  category: CandidateCategory;
  date_of_birth: string | null;
  gender: CandidateGender | null;
  pwbd_status: number; // 0 or 1
  pwbd_type: string | null;
  ex_serviceman_status: number; // 0 or 1
  target_posts: string; // JSON array of string codes e.g. ["CPWD-JE-C", "MES-JE-C"]
  created_at: string;
  updated_at: string;
}

export class ExamProfileRepository {
  public static findByContextId(
    preparationContextId: string,
    userId?: string
  ): ExamProfileRecord | null {
    const db = getDatabase();
    let query = "SELECT * FROM exam_profiles WHERE preparation_context_id = ?";
    const params: string[] = [preparationContextId];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    const stmt = db.prepare(query);
    const row = stmt.get(...params) as unknown as ExamProfileRecord | undefined;
    return row ?? null;
  }

  public static upsert(data: {
    userId: string;
    preparationContextId: string;
    category: CandidateCategory;
    dateOfBirth?: string | null;
    gender?: CandidateGender | null;
    pwbdStatus?: boolean;
    pwbdType?: string | null;
    exServicemanStatus?: boolean;
    targetPosts?: string[];
  }): ExamProfileRecord {
    const db = getDatabase();
    const existing = this.findByContextId(data.preparationContextId, data.userId);
    const now = new Date().toISOString();
    const birth = data.dateOfBirth === undefined ? existing?.date_of_birth ?? null : data.dateOfBirth;
    const gender = data.gender === undefined ? existing?.gender ?? null : data.gender;
    const posts = data.targetPosts ?? (existing ? JSON.parse(existing.target_posts) : []);
    if (birth !== null && !validBirthDate(birth)) throw new ExamProfileValidationError("Enter a real, non-future date of birth in YYYY-MM-DD format.");
    if (gender !== null && !["male", "female", "other"].includes(gender)) throw new ExamProfileValidationError("Select a valid gender or leave it unspecified.");
    if (!["UR", "EWS", "OBC", "SC", "ST"].includes(data.category)) throw new ExamProfileValidationError("Invalid category.");
    if (!Array.isArray(posts) || !posts.every(p => typeof p === "string")) throw new ExamProfileValidationError("Departments must be a list of department codes.");
    const broError = broPreferenceError(gender, posts);
    if (broError) throw new ExamProfileValidationError(broError);
    const postsJson = JSON.stringify(posts);

    if (existing) {
      const stmt = db.prepare(`
        UPDATE exam_profiles
        SET category = ?,
            date_of_birth = ?,
            gender = ?,
            pwbd_status = ?,
            pwbd_type = ?,
            ex_serviceman_status = ?,
            target_posts = ?,
            updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        data.category,
        birth,
        gender,
        data.pwbdStatus !== undefined ? (data.pwbdStatus ? 1 : 0) : existing.pwbd_status,
        data.pwbdType === undefined ? existing.pwbd_type : data.pwbdType,
        data.exServicemanStatus !== undefined ? (data.exServicemanStatus ? 1 : 0) : existing.ex_serviceman_status,
        postsJson,
        now,
        existing.id
      );
      return this.findByContextId(data.preparationContextId, data.userId)!;
    }

    const id = `prof_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const stmt = db.prepare(`
      INSERT INTO exam_profiles (
        id, user_id, preparation_context_id, category, date_of_birth, gender,
        pwbd_status, pwbd_type, ex_serviceman_status, target_posts,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.userId,
      data.preparationContextId,
      data.category,
      birth,
      gender,
      data.pwbdStatus ? 1 : 0,
      data.pwbdType ?? null,
      data.exServicemanStatus ? 1 : 0,
      postsJson,
      now,
      now
    );

    return this.findByContextId(data.preparationContextId, data.userId)!;
  }
}
