import { CandidateCategory } from "../server/repositories/exam-profile-repo";
import { HistoricalCutoffRecord, HistoricalCutoffRepository } from "../server/repositories/historical-cutoff-repo";

export interface TargetCalculationResult {
  planningTargetScore: number;
  officialMinimumScore: number;
  totalMarks: number;
  safetyMargin: number;
  hasComparableHistory: boolean;
  historicalYears: {
    year: number;
    cutoff: number;
    source: string;
  }[];
  explanation: {
    summary: string;
    details: string[];
    disclaimer: string;
  };
}

/**
 * Returns Official Minimum Qualifying Marks as per official examination notice.
 * Example SSC JE Notice Para 18.2:
 * UR: 30% (60/200)
 * OBC / EWS: 25% (50/200)
 * All other categories (SC, ST, PwBD): 20% (40/200)
 */
export function getOfficialMinimumQualifyingMarks(
  examDefinitionId: string,
  category: CandidateCategory,
  totalMarks: number = 200
): number {
  const normCat = category.toUpperCase();
  if (normCat === "UR") {
    return Math.round(totalMarks * 0.30);
  }
  if (normCat === "OBC" || normCat === "EWS") {
    return Math.round(totalMarks * 0.25);
  }
  // SC, ST, PwBD
  return Math.round(totalMarks * 0.20);
}

/**
 * Computes transparent, explainable Personal Preparation Target.
 * STRICT RULE: Never mix Official Qualifying Marks, Historical Cutoff, and Preparation Target.
 */
export function calculatePersonalTarget(params: {
  examDefinitionId: string;
  branch?: string | null;
  category: CandidateCategory;
  stage?: string;
}): TargetCalculationResult {
  const stage = params.stage ?? "PAPER_I";
  const totalMarks = 200; // SSC JE Paper-I standard
  const officialMin = getOfficialMinimumQualifyingMarks(params.examDefinitionId, params.category, totalMarks);

  // Retrieve verified historical cutoffs
  const history: HistoricalCutoffRecord[] = HistoricalCutoffRepository.findComparable({
    examDefinitionId: params.examDefinitionId,
    branch: params.branch,
    category: params.category,
    stage,
  });

  if (history.length === 0) {
    // No comparable historical data exists
    const fallbackTarget = Math.max(officialMin, Math.round(totalMarks * 0.65));
    return {
      planningTargetScore: fallbackTarget,
      officialMinimumScore: officialMin,
      totalMarks,
      safetyMargin: fallbackTarget - officialMin,
      hasComparableHistory: false,
      historicalYears: [],
      explanation: {
        summary: "Limited comparable history available for this specific stream.",
        details: [
          `Official minimum qualifying requirement: ${officialMin} / ${totalMarks} (${params.category})`,
          "Historical normalized cutoff records for this stream are not yet verified by official writeups.",
          `Provisional benchmark set at ${fallbackTarget} based on general competitive standards.`,
        ],
        disclaimer: "This is a conservative preparation benchmark, not a predicted cutoff.",
      },
    };
  }

  // Sort by year ascending
  const sorted = [...history].sort((a, b) => a.exam_year - b.exam_year);
  const recentCutoff = sorted[sorted.length - 1].cutoff_score;

  // Determine trend & safety buffer:
  // e.g. 2024: 122.93, 2025: 127.23 -> Delta is ~4.3 marks
  // Standard safety buffer of 5–8 marks to ensure comfortable qualification beyond cutoff variance
  const desiredRaw = recentCutoff + 7.5;
  // Round to nearest clean milestone integer (e.g. 135)
  const planningTarget = Math.max(officialMin, Math.ceil(desiredRaw));

  const safetyMargin = Math.round((planningTarget - recentCutoff) * 100) / 100;

  const historicalYears = sorted.map((h) => ({
    year: h.exam_year,
    cutoff: h.cutoff_score,
    source: h.official_source_title || "Official SSC Result Notice",
  }));

  const details = [
    `Official minimum qualifying mark: ${officialMin} / ${totalMarks} (${params.category})`,
    ...historicalYears.map((h) => `${h.year} official Paper-I cutoff: ${h.cutoff.toFixed(2)}`),
    `Recommended preparation safety margin: +${safetyMargin} marks above recent cutoff`,
    `Personal preparation target: ${planningTarget}+`,
  ];

  return {
    planningTargetScore: planningTarget,
    officialMinimumScore: officialMin,
    totalMarks,
    safetyMargin,
    hasComparableHistory: true,
    historicalYears,
    explanation: {
      summary: `Target ${planningTarget}+ is based on recent comparable official cutoffs (${recentCutoff.toFixed(2)}) plus a ${safetyMargin}-mark resilience buffer.`,
      details,
      disclaimer: "This is a preparation target designed to give you a safe margin of error. It is NOT a prediction of the 2026 cutoff.",
    },
  };
}
