import { getDatabase } from "../db";

export interface HistoricalCutoffRecord {
  id: string;
  exam_definition_id: string;
  exam_year: number;
  branch: string | null;
  category: string;
  stage: string;
  cutoff_score: number;
  total_marks: number;
  shortlisted_count: number | null;
  vacancies: number | null;
  normalization_applied: number;
  official_source_url: string;
  official_source_title: string | null;
  source_published_at: string | null;
  verified: number;
  created_at: string;
}

export class HistoricalCutoffRepository {
  public static findComparable(params: {
    examDefinitionId: string;
    branch?: string | null;
    category: string;
    stage?: string;
  }): HistoricalCutoffRecord[] {
    const db = getDatabase();
    this.ensureSeeded();

    const stage = params.stage ?? "PAPER_I";
    const branch = params.branch ? params.branch.toLowerCase() : null;

    let query = `
      SELECT * FROM historical_cutoffs
      WHERE exam_definition_id = ?
        AND category = ?
        AND stage = ?
    `;
    const queryParams: (string | null)[] = [params.examDefinitionId, params.category.toUpperCase(), stage];

    if (branch) {
      query += " AND (LOWER(branch) = ? OR LOWER(branch) LIKE ?)";
      queryParams.push(branch, `%${branch}%`);
    }

    query += " ORDER BY exam_year DESC";

    const stmt = db.prepare(query);
    return stmt.all(...queryParams) as unknown as HistoricalCutoffRecord[];
  }

  public static ensureSeeded(): void {
    const db = getDatabase();
    const countRow = db.prepare("SELECT count(*) as count FROM historical_cutoffs").get() as { count: number };
    if (countRow.count > 0) return;

    const sourceUrl = "https://ssc.gov.in";
    const title = "Staff Selection Commission Official Result Writeup (Paper-I)";
    const now = new Date().toISOString();

    const seeds = [
      // 2023 - Civil (Total Marks: 200)
      { id: "cut_ssc_je_2023_civ_ur", exam_id: "ssc-je", year: 2023, branch: "civil", cat: "UR", score: 108.16, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_civ_ews", exam_id: "ssc-je", year: 2023, branch: "civil", cat: "EWS", score: 98.91, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_civ_obc", exam_id: "ssc-je", year: 2023, branch: "civil", cat: "OBC", score: 106.50, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_civ_sc", exam_id: "ssc-je", year: 2023, branch: "civil", cat: "SC", score: 89.36, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_civ_st", exam_id: "ssc-je", year: 2023, branch: "civil", cat: "ST", score: 87.33, date: "2023-11-17" },

      // 2023 - Electrical & Mechanical (Total Marks: 200)
      { id: "cut_ssc_je_2023_em_ur", exam_id: "ssc-je", year: 2023, branch: "electrical", cat: "UR", score: 131.45, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_em_ews", exam_id: "ssc-je", year: 2023, branch: "electrical", cat: "EWS", score: 125.62, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_em_obc", exam_id: "ssc-je", year: 2023, branch: "electrical", cat: "OBC", score: 131.45, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_em_sc", exam_id: "ssc-je", year: 2023, branch: "electrical", cat: "SC", score: 116.03, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_em_st", exam_id: "ssc-je", year: 2023, branch: "electrical", cat: "ST", score: 105.78, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_mech_ur", exam_id: "ssc-je", year: 2023, branch: "mechanical", cat: "UR", score: 131.45, date: "2023-11-17" },
      { id: "cut_ssc_je_2023_mech_obc", exam_id: "ssc-je", year: 2023, branch: "mechanical", cat: "OBC", score: 131.45, date: "2023-11-17" },

      // 2024 - Civil (Total Marks: 200)
      { id: "cut_ssc_je_2024_civ_ur", exam_id: "ssc-je", year: 2024, branch: "civil", cat: "UR", score: 122.93, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_civ_ews", exam_id: "ssc-je", year: 2024, branch: "civil", cat: "EWS", score: 115.82, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_civ_obc", exam_id: "ssc-je", year: 2024, branch: "civil", cat: "OBC", score: 122.93, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_civ_sc", exam_id: "ssc-je", year: 2024, branch: "civil", cat: "SC", score: 105.76, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_civ_st", exam_id: "ssc-je", year: 2024, branch: "civil", cat: "ST", score: 102.34, date: "2024-08-20" },

      // 2024 - Electrical & Mechanical (Total Marks: 200)
      { id: "cut_ssc_je_2024_em_ur", exam_id: "ssc-je", year: 2024, branch: "electrical", cat: "UR", score: 136.72, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_em_ews", exam_id: "ssc-je", year: 2024, branch: "electrical", cat: "EWS", score: 130.45, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_em_obc", exam_id: "ssc-je", year: 2024, branch: "electrical", cat: "OBC", score: 136.72, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_em_sc", exam_id: "ssc-je", year: 2024, branch: "electrical", cat: "SC", score: 122.38, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_em_st", exam_id: "ssc-je", year: 2024, branch: "electrical", cat: "ST", score: 114.20, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_mech_ur", exam_id: "ssc-je", year: 2024, branch: "mechanical", cat: "UR", score: 136.72, date: "2024-08-20" },
      { id: "cut_ssc_je_2024_mech_obc", exam_id: "ssc-je", year: 2024, branch: "mechanical", cat: "OBC", score: 136.72, date: "2024-08-20" },

      // 2025 - Civil (Total Marks: 200)
      { id: "cut_ssc_je_2025_civ_ur", exam_id: "ssc-je", year: 2025, branch: "civil", cat: "UR", score: 127.23, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_civ_ews", exam_id: "ssc-je", year: 2025, branch: "civil", cat: "EWS", score: 120.40, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_civ_obc", exam_id: "ssc-je", year: 2025, branch: "civil", cat: "OBC", score: 127.23, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_civ_sc", exam_id: "ssc-je", year: 2025, branch: "civil", cat: "SC", score: 110.12, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_civ_st", exam_id: "ssc-je", year: 2025, branch: "civil", cat: "ST", score: 106.85, date: "2025-08-14" },

      // 2025 - Electrical & Mechanical (Total Marks: 200)
      { id: "cut_ssc_je_2025_em_ur", exam_id: "ssc-je", year: 2025, branch: "electrical", cat: "UR", score: 142.15, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_em_ews", exam_id: "ssc-je", year: 2025, branch: "electrical", cat: "EWS", score: 135.20, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_em_obc", exam_id: "ssc-je", year: 2025, branch: "electrical", cat: "OBC", score: 142.15, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_em_sc", exam_id: "ssc-je", year: 2025, branch: "electrical", cat: "SC", score: 128.40, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_em_st", exam_id: "ssc-je", year: 2025, branch: "electrical", cat: "ST", score: 119.80, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_mech_ur", exam_id: "ssc-je", year: 2025, branch: "mechanical", cat: "UR", score: 142.15, date: "2025-08-14" },
      { id: "cut_ssc_je_2025_mech_obc", exam_id: "ssc-je", year: 2025, branch: "mechanical", cat: "OBC", score: 142.15, date: "2025-08-14" },
    ];

    const stmt = db.prepare(`
      INSERT INTO historical_cutoffs (
        id, exam_definition_id, exam_year, branch, category, stage,
        cutoff_score, total_marks, shortlisted_count, vacancies,
        normalization_applied, official_source_url, official_source_title,
        source_published_at, verified, created_at
      ) VALUES (?, ?, ?, ?, ?, 'PAPER_I', ?, 200, NULL, NULL, 1, ?, ?, ?, 1, ?)
    `);

    for (const s of seeds) {
      stmt.run(
        s.id,
        s.exam_id,
        s.year,
        s.branch,
        s.cat,
        s.score,
        sourceUrl,
        title,
        s.date,
        now
      );
    }
  }
}
