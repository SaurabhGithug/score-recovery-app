/**
 * Shared contract for the standards MCQ quiz (client + server). Tables: migrations/0011_standard_quiz.sql.
 * Truth rule: a question is only ever shown while status === "verified" (its proof quote was found
 * word for word in the clause AND a second AI from another company solved it blind to the same
 * answer). Answer keys, explanations and proof quotes are sent to the browser only after an attempt
 * is submitted.
 */
export type OptionId = "A" | "B" | "C" | "D";
export const OPTION_IDS: OptionId[] = ["A", "B", "C", "D"];
export type QuestionLevel = "recall" | "understanding" | "application";
export type QuestionStatus = "verified" | "needs_review";
export type CheckIndependence = "other_provider" | "same_vendor" | "same_model";

export interface QuizOption {
  id: OptionId;
  text: string;
}

/** A stored question, as the server sees it. */
export interface StandardQuestion {
  id: string;
  standardId: string;
  /** The study unit the question belongs to, e.g. "6.4" or "3.6" (a standard_clauses.clause_no). */
  clauseNo: string;
  /** Fingerprint of the clause (title + body) it was written from; see clauseFingerprint() in quiz-repo.ts. */
  clauseFp: string;
  stem: string;
  options: QuizOption[];
  answer: OptionId;
  /** Why the correct option is right, in plain words. */
  explanation: string;
  /** Why each WRONG option is wrong (keyed by option id; the correct option has no entry). */
  optionNotes: Partial<Record<OptionId, string>>;
  /** Verbatim text from the clause that proves the answer. */
  proofQuote: string;
  /** The numbered requirement inside the clause the quote comes from, e.g. "6.4.7"; falls back to clauseNo. */
  proofClauseNo: string;
  difficulty: 1 | 2 | 3;
  level: QuestionLevel | null;
  status: QuestionStatus;
  generatedBy: string;
  checkedBy: string | null;
  checkIndependence: CheckIndependence | null;
  createdAt: string;
}

/** Portable file written by scripts/generate-standard-questions.mjs and read by scripts/import-standard-questions.mjs. */
export interface QuestionExportFile {
  version: 1;
  standardCode: string;
  /** standards.content_fp of the text the questions were written from (informational; clauseFp is what gates display). */
  contentFp: string;
  generatedAt: string;
  questions: Omit<StandardQuestion, "id" | "standardId">[];
}

// ---------------------------------------------------------------- quiz attempts (browser-facing)

export type QuizScope =
  | { kind: "all" }
  | { kind: "section"; section: "4" | "5" | "6" | "7" | "8" }
  | { kind: "clause"; clauseNo: string };

/** One question as shown during an attempt: no key, no explanation, no proof. */
export interface AttemptQuestion {
  id: string;
  clauseNo: string;
  clauseTitle: string;
  stem: string;
  options: QuizOption[];
}

export interface AnswerState {
  /** null = not answered. */
  answer: OptionId | null;
  marked: boolean;
  /** Active seconds spent on the question. */
  seconds: number;
}

/** GET/POST responses while an attempt is running. */
export interface AttemptView {
  id: string;
  standardId: string;
  scope: QuizScope;
  scopeLabel: string;
  limitSeconds: number;
  startedAt: string;
  /** Fixed by the server at start. The browser counts down to this, corrected by serverNow. */
  deadlineAt: string;
  serverNow: string;
  questions: AttemptQuestion[];
  responses: Record<string, AnswerState>;
}

export interface ResultQuestion extends AttemptQuestion {
  yourAnswer: OptionId | null;
  correct: boolean;
  answer: OptionId;
  explanation: string;
  optionNotes: Partial<Record<OptionId, string>>;
  proofQuote: string;
  proofClauseNo: string;
  seconds: number;
  marked: boolean;
}

export interface ClauseBreakdown {
  clauseNo: string;
  clauseTitle: string;
  correct: number;
  total: number;
}

/** Returned after submit, and by GET on a finished attempt. */
export interface ResultView {
  id: string;
  standardId: string;
  scopeLabel: string;
  limitSeconds: number;
  startedAt: string;
  submittedAt: string;
  /** Seconds between start and submit, capped at limitSeconds. */
  timeUsedSeconds: number;
  /** true when the timer ran out and the server submitted what had been saved. */
  autoSubmitted: boolean;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  byClause: ClauseBreakdown[];
  questions: ResultQuestion[];
}

export interface AttemptSummary {
  id: string;
  scopeLabel: string;
  startedAt: string;
  submittedAt: string | null;
  limitSeconds: number;
  total: number;
  correct: number | null;
}

/** GET /api/standards/<id>/quiz */
export interface QuizOverview {
  /** Verified questions that can be put in a test right now. */
  available: { total: number; byClause: Record<string, number>; bySection: Record<string, number> };
  history: AttemptSummary[];
  /** An unfinished attempt whose deadline has not passed (resume it). */
  active: { id: string; deadlineAt: string; scopeLabel: string } | null;
  bestPercent: number | null;
}
