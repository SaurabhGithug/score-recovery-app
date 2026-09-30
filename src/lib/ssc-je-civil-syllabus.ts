/**
 * Allow-list of SSC JE Civil syllabus topic names, enforced by the AI explanation gate
 * (src/lib/server/bank/explain-gate.ts) and quoted in its prompts. Names are the 2026 notice's
 * printed wording: the 13 Paper-I Part-A (Civil) subjects (para 14.2.3) plus the two other
 * Paper-I parts (para 14.2.1, 14.2.2). The full hierarchy — Paper-II headings and their items,
 * citations, provenance — lives in src/lib/syllabus/ and the syllabus_nodes table; this list must
 * stay equal to its official part/subject names (scripts/test-syllabus.mjs checks that).
 */
export const SSC_JE_CIVIL_SYLLABUS_SOURCE = {
  title: "SSC Junior Engineer Examination, 2026 notice (F. No. HQ-C-3019/1/2026-C-3, dated 02.09.2026)",
  url: "https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_je_2026.pdf",
  noticeNumber: "F. No. HQ-C-3019/1/2026-C-3",
  publishedOn: "2026-09-02",
  sha256: "3efcdd945ddbd6b72d84ae5124ed5e4e3571e81d93c0910c51b5ad6119e0156d",
  citation: "Notice F. No. HQ-C-3019/1/2026-C-3, p.23, paras 14.2.1–14.2.3 (Paper-I); pp.24–26, para 14.3.1 (Paper-II Part-A)",
  verifiedOn: "2026-09-29",
  limitation:
    "Topic names follow the 2026 notice. Previous-year papers (2016–2024) were set under older syllabi (the 2025 notice used different Civil subject names), so mapping an older question onto these names is an editorial judgement, not an official classification.",
} as const;

export const SSC_JE_CIVIL_SYLLABUS_TOPICS = [
  "General Intelligence & Reasoning",
  "General Awareness",
  "Engineering Mechanics",
  "Solid Mechanics",
  "Structural Analysis",
  "Construction Materials and Management",
  "Estimating, Costing and Valuation",
  "Concrete Structures",
  "Steel Structures",
  "Surveying",
  "Soil Mechanics (Geotechnical Engineering)",
  "Fluid Mechanics and Hydraulics",
  "Hydrology and Irrigation Engineering",
  "Environmental Engineering",
  "Transportation (Traffic) Engineering",
] as const;

export type SscJeCivilSyllabusTopic = (typeof SSC_JE_CIVIL_SYLLABUS_TOPICS)[number];
