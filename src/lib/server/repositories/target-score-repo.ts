import { getDatabase } from "../db";
import crypto from "node:crypto";

export interface TargetScoreRecord {
  id: string;
  user_id: string;
  preparation_context_id: string;
  score: number;
  method_version: string;
  official_qualifying_mark: number;
  safety_margin: number;
  evidence: string; // JSON
  historical_years: string; // JSON
  calculated_at: string;
}

export class TargetScoreRepository {
  public static async findByContextId(
    preparationContextId: string,
    userId?: string
  ): Promise<TargetScoreRecord | null> {
    const db = getDatabase();
    let query = "SELECT * FROM target_scores WHERE preparation_context_id = ?";
    const params: string[] = [preparationContextId];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    const stmt = db.prepare(query);
    const row = await stmt.get<TargetScoreRecord>(...params);
    return row ?? null;
  }

  public static async upsert(data: {
    userId: string;
    preparationContextId: string;
    score: number;
    methodVersion?: string;
    officialQualifyingMark: number;
    safetyMargin: number;
    evidence: Record<string, unknown>;
    historicalYears: { year: number; cutoff: number; source?: string }[];
  }): Promise<TargetScoreRecord> {
    const db = getDatabase();
    const existing = await this.findByContextId(data.preparationContextId, data.userId);
    const now = new Date().toISOString();
    const evidenceJson = JSON.stringify(data.evidence);
    const yearsJson = JSON.stringify(data.historicalYears);

    if (existing) {
      const stmt = db.prepare(`
        UPDATE target_scores
        SET score = ?,
            method_version = ?,
            official_qualifying_mark = ?,
            safety_margin = ?,
            evidence = ?,
            historical_years = ?,
            calculated_at = ?
        WHERE id = ?
      `);
      await stmt.run(
        data.score,
        data.methodVersion ?? "v1_historical_trend",
        data.officialQualifyingMark,
        data.safetyMargin,
        evidenceJson,
        yearsJson,
        now,
        existing.id
      );
      return (await this.findByContextId(data.preparationContextId, data.userId))!;
    }

    const id = `tgt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const stmt = db.prepare(`
      INSERT INTO target_scores (
        id, user_id, preparation_context_id, score, method_version,
        official_qualifying_mark, safety_margin, evidence,
        historical_years, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      id,
      data.userId,
      data.preparationContextId,
      data.score,
      data.methodVersion ?? "v1_historical_trend",
      data.officialQualifyingMark,
      data.safetyMargin,
      evidenceJson,
      yearsJson,
      now
    );

    return (await this.findByContextId(data.preparationContextId, data.userId))!;
  }
}
