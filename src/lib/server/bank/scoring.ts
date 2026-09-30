/**
 * Scores a bank attempt (DECISION-002). Marks come from the SSC JE scheme in
 * src/lib/ssc-je/config.ts (Paper-I +1 / −0.25, Paper-II +3 / −1). Only questions whose key,
 * resolved for this learner at submit time, is scored (isScored) count towards score and
 * maxScore; everything else is reported as `unscored`. The keys used are returned as a
 * snapshot so a later key change never silently rewrites a submitted result.
 */
import { isScored, type ResolvedKey } from "../../bank/answer-key";
import type {
  BankAttemptMode,
  BankAttemptResult,
  BankOutcome,
  BankPaperCode,
  BankResponse,
  BankResponses,
  BankSectionResult,
} from "../../bank/api-types";
import { SSC_JE_PAPER_1, SSC_JE_PAPER_2 } from "../../ssc-je/config";
import type { BankQuestionRecord, KeySnapshotEntry } from "../repositories/bank-repo";
import { presentable } from "./presentable";
import { contentFingerprint } from "./content-fp";

export const FULL_PAPER_MINUTES = 120;

export interface Marking {
  correct: number;
  negative: number;
  scheme: string;
}

export function markingFor(paper: BankPaperCode): Marking {
  const config = paper === "P2" ? SSC_JE_PAPER_2 : SSC_JE_PAPER_1;
  const correct = config.markingCorrect;
  const negative = config.markingNegative;
  if (typeof correct !== "number" || typeof negative !== "number") {
    throw new Error(`Marking scheme for SSC JE ${paper} is missing from src/lib/ssc-je/config.ts.`);
  }
  return {
    correct,
    negative,
    scheme: `SSC JE ${paper === "P2" ? "Paper-II" : "Paper-I"}: +${correct} correct, −${negative} wrong, 0 unattempted`,
  };
}

/** Timer for an attempt: full paper 120 min; a section gets its share of 120 min; practice is untimed. */
export function attemptDurationSeconds(
  mode: BankAttemptMode,
  paperDurationMinutes: number,
  sectionCount: number,
  paperCount: number
): number | null {
  if (mode === "practice") return null;
  const minutes = paperDurationMinutes || FULL_PAPER_MINUTES;
  if (mode === "full") return minutes * 60;
  if (paperCount <= 0) return null;
  return Math.round((minutes * sectionCount) / paperCount) * 60;
}

/** The questions an attempt covers: the whole paper, or one section. */
export function questionsInScope<T extends Pick<BankQuestionRecord, "section">>(
  questions: T[],
  mode: BankAttemptMode,
  section: string | null
): T[] {
  return mode === "section" ? questions.filter((q) => q.section === section) : questions;
}

export function outcomeFor(key: KeySnapshotEntry, response: BankResponse | null | undefined): BankOutcome {
  if (!isScored(key.status) || key.answer === null) return "unscored";
  const answer = response?.answer ?? null;
  if (answer === null) return "unattempted";
  return answer === key.answer ? "correct" : "wrong";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The key a question is scored against; `canPresent` false (see presentable.ts) ⇒ never scored. */
export function snapshotOf(key: ResolvedKey, canPresent = true): KeySnapshotEntry {
  if (!canPresent) return { status: key.status, answer: null, withheld: true };
  return { status: key.status, answer: isScored(key.status) ? key.answer : null };
}

export interface ScoreInput {
  attemptId: string;
  paperId: string;
  paper: BankPaperCode;
  /** Questions in the attempt's scope, in paper order. */
  questions: BankQuestionRecord[];
  keys: Map<string, ResolvedKey>;
  responses: BankResponses;
  submittedAt: string;
  /**
   * questionId → the content fingerprint the learner saw when the attempt started. A question whose
   * content differs now (or that was not in the attempt when it started) is withheld: the answer
   * was given to other content. Omitted ⇒ the current content is taken as seen (unit tests).
   */
  seenFps?: Record<string, string>;
}

export function scoreAttempt(input: ScoreInput): { result: BankAttemptResult; keySnapshot: Record<string, KeySnapshotEntry> } {
  const marking = markingFor(input.paper);
  const keySnapshot: Record<string, KeySnapshotEntry> = {};
  const counts = { correct: 0, wrong: 0, unattempted: 0, unscored: 0 };
  const sections = new Map<string, BankSectionResult>();
  let score = 0;
  let maxScore = 0;
  let totalSeconds = 0;

  for (const q of input.questions) {
    const resolved = input.keys.get(q.id);
    const current = contentFingerprint(q);
    const seen = input.seenFps ? (input.seenFps[q.id] ?? "") : current;
    const snap: KeySnapshotEntry = {
      ...(resolved ? snapshotOf(resolved, presentable(q) && seen === current) : { status: "no_key" as const, answer: null }),
      fp: seen,
    };
    keySnapshot[q.id] = snap;
    const response = input.responses[q.id];
    const outcome = outcomeFor(snap, response);
    const seconds = response && Number.isFinite(response.seconds) ? Math.max(0, response.seconds) : 0;

    let section = sections.get(q.section);
    if (!section) {
      section = { name: q.section, correct: 0, wrong: 0, unattempted: 0, unscored: 0, score: 0, maxScore: 0, seconds: 0 };
      sections.set(q.section, section);
    }
    section.seconds += seconds;
    totalSeconds += seconds;
    counts[outcome] += 1;
    section[outcome] += 1;
    if (outcome === "unscored") continue;
    section.maxScore += marking.correct;
    maxScore += marking.correct;
    if (outcome === "correct") {
      section.score += marking.correct;
      score += marking.correct;
    } else if (outcome === "wrong") {
      section.score -= marking.negative;
      score -= marking.negative;
    }
  }

  const result: BankAttemptResult = {
    attemptId: input.attemptId,
    paperId: input.paperId,
    submittedAt: input.submittedAt,
    marking,
    score: round2(score),
    maxScore: round2(maxScore),
    counts,
    sections: [...sections.values()].map((s) => ({ ...s, score: round2(s.score), maxScore: round2(s.maxScore), seconds: round2(s.seconds) })),
    negativeMarksLost: round2(counts.wrong * marking.negative),
    totalSeconds: round2(totalSeconds),
  };
  return { result, keySnapshot };
}
