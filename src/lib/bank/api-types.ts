/**
 * HTTP contract for the shared question bank (DECISION-002). Server routes under
 * src/app/api/bank/ return exactly these shapes; the /papers UI consumes them.
 * Every route requires a signed-in learner (session cookie via getCurrentUser).
 *
 * Invariant: nothing a learner can fetch before submitting an attempt contains an answer key,
 * evidence row, source solution or explanation.
 */
import type { AnswerAuthority, KeyStatus } from "./answer-key";

export type BankPaperKind = "pyp" | "mock";
export type BankPaperCode = "P1" | "P2";
export type BankLanguage = "en" | "hi";
/**
 * text_layer: clean printed text. bilingual_en: the English half of a bilingual block whose Hindi
 * half was mis-encoded (the English is intact; the answer-free image stays authoritative).
 * ocr: read by OCR from a scan. garbled: unusable as text; rely on the image.
 */
export type BankTextQuality = "text_layer" | "bilingual_en" | "ocr" | "garbled";

export interface BankAttemptStub {
  id: string;
  mode: BankAttemptMode;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  /** See BankAttemptResult.priorExposure. */
  priorExposure?: number;
}

/** GET /api/bank/papers?kind=pyp|mock&paper=P1|P2 → { papers: BankPaperSummary[] } */
export interface BankPaperSummary {
  id: string;
  kind: BankPaperKind;
  exam: "SSC_JE";
  branch: "CIVIL";
  paper: BankPaperCode;
  /** SSC cycle name ("JE 2020"), which is not the year it was sat. */
  cycleYear: number | null;
  /** YYYY-MM-DD the paper was sat. */
  examDate: string | null;
  /** e.g. "09:00-11:00". */
  shift: string | null;
  title: string;
  questionCount: number;
  durationMinutes: number;
  publisher: string;
  fidelity: string;
  languages: BankLanguage[];
  /** Key status counts as resolved for the requesting learner. */
  keyCounts: Partial<Record<KeyStatus, number>>;
  /** Questions that count towards a score (see isScored in answer-key.ts). */
  scoredCount: number;
  /** The requesting learner's attempts, newest first. */
  attempts: BankAttemptStub[];
}

export interface BankOption {
  id: string;
  text: string;
}

export interface BankSection {
  name: string;
  firstPosition: number;
  count: number;
}

export interface BankQuestionForAttempt {
  id: string;
  position: number;
  section: string;
  stem: string;
  options: BankOption[];
  hasFigure: boolean;
  /**
   * Image of the question block (GET /api/bank/assets/...), or null. Before submit/check a PYP
   * question gets its key-free clean crop here (same as cleanImageUrl) or null; in review and
   * check results it is the original crop, which shows the SSC key, when that crop was proven to
   * hold only this question (otherwise the clean crop again).
   */
  imageUrl: string | null;
  /**
   * The key-free crop (grayscale, no tick/cross, no "Correct Answer" line, option numbers
   * aligned), present only when one passed verification. Safe to show before submit. Added by
   * the bank API.
   */
  cleanImageUrl?: string | null;
  textQuality: BankTextQuality;
  translations?: { hi?: { stem: string; options: BankOption[] } };
  /** false → shown, but excluded from the score (no trustworthy key, or the question is unavailable). */
  scored: boolean;
  /**
   * true → the source could not be extracted cleanly: its text is missing or unreadable and there
   * is no verified image. Shown for reference only, never scored.
   */
  unavailable?: boolean;
}

/** GET /api/bank/papers/[id] → BankPaperDetail. Never contains keys. */
export interface BankPaperDetail {
  paper: BankPaperSummary;
  sections: BankSection[];
  questions: BankQuestionForAttempt[];
}

export type BankAttemptMode = "full" | "section" | "practice";

/** POST /api/bank/attempts { paperId, mode, section? } → { attempt: BankAttempt } */
export interface BankAttempt {
  id: string;
  paperId: string;
  mode: BankAttemptMode;
  /** Set when mode is "section". */
  section: string | null;
  startedAt: string;
  /** null for untimed practice. */
  durationSeconds: number | null;
  submittedAt: string | null;
  /** Practice mode: questions already checked via /check (their answers are locked). Added by the bank API. */
  checkedQuestionIds?: string[];
}

export interface BankResponse {
  /** Option id, or null when left unanswered. */
  answer: string | null;
  seconds: number;
  visits: number;
  changes: number;
  marked: boolean;
}

/**
 * PUT  /api/bank/attempts/[id]         { responses } → { ok: true }            (autosave, before submit only)
 * POST /api/bank/attempts/[id]/submit  { responses } → { result: BankAttemptResult }
 * GET  /api/bank/attempts/[id]                      → { attempt, responses, result | null }
 * Learners can only read or write their own attempts.
 */
export type BankResponses = Record<string, BankResponse>;

export interface BankSectionResult {
  name: string;
  correct: number;
  wrong: number;
  unattempted: number;
  unscored: number;
  score: number;
  maxScore: number;
  seconds: number;
}

export interface BankAttemptResult {
  attemptId: string;
  paperId: string;
  submittedAt: string;
  /** Marks per question, from the SSC JE 2026 scheme in src/lib/ssc-je/config.ts. */
  marking: { correct: number; negative: number; scheme: string };
  score: number;
  maxScore: number;
  counts: { correct: number; wrong: number; unattempted: number; unscored: number };
  sections: BankSectionResult[];
  negativeMarksLost: number;
  totalSeconds: number;
  /**
   * Scored questions in this attempt whose key the learner had already seen before submitting (a
   * practice check, the review of an earlier submitted attempt, or their own dispute resolution):
   * for those, the score is not a fresh measurement. Absent on attempts from before 2026-09-29.
   */
  priorExposure?: number;
}

export interface BankEvidenceView {
  authority: AnswerAuthority;
  sourceLabel: string;
  answer: string | null;
  dropped: boolean;
}

export interface BankKeyView {
  status: KeyStatus;
  statusLabel: string;
  /** null whenever the question is unscored. */
  answer: string | null;
  scored: boolean;
  basis: BankEvidenceView[];
  dissent: BankEvidenceView[];
}

export interface BankExplanationOption {
  id: string;
  verdict: "correct" | "wrong";
  why: string;
}

export interface BankExplanation {
  lockedAnswer: string;
  topic: string;
  concept: string;
  steps: string[];
  whyCorrect: string;
  /** One entry per option: why the key is right and why each other option is wrong. */
  options: BankExplanationOption[];
  traps: string[];
  examTip: string;
  verificationLimits: string[];
  model: string;
  createdAt: string;
}

export type BankOutcome = "correct" | "wrong" | "unattempted" | "unscored";

export interface BankReviewQuestion extends BankQuestionForAttempt {
  response: BankResponse | null;
  outcome: BankOutcome;
  key: BankKeyView;
  /** The source's own worked solution, verbatim, when it has one. */
  sourceSolution: string | null;
  /** null when none exists or it is stale (its lockedAnswer no longer equals key.answer). */
  explanation: BankExplanation | null;
  /**
   * The key this question was scored against at submit time, present only when it differs from
   * `key` (the key changed later, e.g. the learner resolved a dispute). `outcome` and the result
   * always use this snapshot. Added by the bank API.
   */
  keyAtSubmit?: { status: KeyStatus; answer: string | null };
  /**
   * true → the question's text or options were corrected (re-extracted) after this attempt was
   * submitted: the recorded answer was given to the earlier version. Added by the bank API.
   */
  contentChangedSinceSubmit?: boolean;
}

/**
 * POST /api/bank/attempts/[id]/check { questionId, answer } → BankCheckResult
 *   Practice mode only. Records `answer` for that question and locks it (later autosaves cannot
 *   change a checked question), then reveals that one question's key. The only pre-submit route
 *   that returns a key, and only for a question the learner has already committed to.
 */
export interface BankCheckResult {
  questionId: string;
  outcome: BankOutcome;
  key: BankKeyView;
  sourceSolution: string | null;
  explanation: BankExplanation | null;
  /** The original crop, now that the question is committed (pre-submit views withhold PYP crops: they show the key). Added by the bank API. */
  imageUrl?: string | null;
}

/** GET /api/bank/attempts/[id]/review → BankReview (only after submit). */
export interface BankReview {
  attempt: BankAttempt;
  result: BankAttemptResult;
  questions: BankReviewQuestion[];
}

/**
 * POST /api/bank/questions/[id]/resolve { answer: string | null, note?: string } → { key: BankKeyView }
 *   Only allowed while the learner's status for the question is "disputed". Stored as a
 *   human_review evidence row scoped to that learner. answer null = "treat as dropped".
 * POST /api/bank/questions/[id]/explain → { explanation: BankExplanation }
 *   503 { error } when AI is not configured; 409 when the question has no scored key.
 * GET  /api/bank/ai-status → BankAiStatus
 * GET  /api/bank/assets/[...path] → image/png from data/storage/pyp-crops (signed-in only; only
 *   after the learner committed to that question). /api/bank/assets/clean/[...path] → the
 *   key-free crop from data/storage/pyp-crops-clean (any signed-in learner).
 * POST /api/bank/import/testbook (TestbookImport JSON) → BankTestbookImportResult
 */
export interface BankAiStatus {
  configured: boolean;
  reason: string | null;
}

export interface BankTestbookImportResult {
  paperIds: string[];
  questions: number;
  keyed: number;
  heldOut: number;
}

export interface BankApiError {
  error: string;
}
