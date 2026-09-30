// Core data model for the Score-Recovery exam platform.
// Every learner-facing number must be traceable back to a deterministic
// computation over these types — no black-box "AI" scoring.

export type Lang = "en" | "hi";

export type Bilingual = {
  en: string;
  hi: string;
};

export type Section = "quant" | "reasoning" | "english" | "gk";

export const SECTION_LABEL: Record<Section, Bilingual> = {
  quant: { en: "Quantitative Aptitude", hi: "मात्रात्मक अभियोग्यता" },
  reasoning: { en: "General Intelligence & Reasoning", hi: "सामान्य बुद्धिमत्ता एवं तर्कशक्ति" },
  english: { en: "English Comprehension", hi: "अंग्रेज़ी भाषा" },
  gk: { en: "General Awareness", hi: "सामान्य जागरूकता" },
};

export type Difficulty = 1 | 2 | 3; // 1 = easy, 2 = medium, 3 = hard

export type QuestionOption = {
  id: "A" | "B" | "C" | "D";
  text: Bilingual;
};

export type Question = {
  id: string;
  section: Section;
  concept: string; // e.g. "Percentage" — stable key used for the error ledger
  conceptLabel: Bilingual;
  difficulty: Difficulty;
  marks: number; // awarded on correct
  negativeMarks: number; // deducted on wrong (positive number, subtracted)
  text: Bilingual;
  options: QuestionOption[];
  correctOptionId: QuestionOption["id"];
  explanation: Bilingual;
  commonTrap?: Bilingual; // the misconception that produces the top wrong answer
  expectedTimeSeconds: number; // used to flag "rushed" vs "stuck" behaviour
  /** Marks this question as the delayed, unseen retest pairing for another question id. */
  retestOf?: string;
  /** Bumped on any content correction; undefined == 1. Shown on a resolved dispute so a
   *  learner who reported an issue can see it was actually fixed. See DisputeReason above. */
  version?: number;
};

// ---- Attempt-time behavioural evidence -----------------------------------

export type ResponseEvent = {
  questionId: string;
  timeSpentSeconds: number;
  answerChangeCount: number;
  visitCount: number;
  wasSkipped: boolean;
  markedForReview: boolean;
  confidence: "low" | "medium" | "high" | null; // learner self-report, optional
  selectedOptionId: QuestionOption["id"] | null;
  isCorrect: boolean | null; // null when unattempted
};

export type Attempt = {
  id: string;
  examId: string;
  userId?: string;
  contextId?: string;
  startedAt: string; // ISO timestamp, stamped client-side
  submittedAt: string | null;
  responses: ResponseEvent[];
  interrupted: boolean; // true if a resume/checkpoint recovery happened
};

// ---- Diagnosis -------------------------------------------------------------

export type ErrorCause =
  | "concept_gap"
  | "calculation_error"
  | "misreading"
  | "risky_guess"
  | "time_pressure"
  | "recurring_gap"
  | "fragile_correct"; // correct, but low confidence / rushed — likely to fail under pressure next time

export const ERROR_CAUSE_LABEL: Record<ErrorCause, Bilingual> = {
  concept_gap: { en: "Concept not understood", hi: "अवधारणा स्पष्ट नहीं है" },
  calculation_error: { en: "Calculation error", hi: "गणना में त्रुटि" },
  misreading: { en: "Misread the question", hi: "प्रश्न को गलत समझा" },
  risky_guess: { en: "Risky guess", hi: "जोखिम भरा अनुमान" },
  time_pressure: { en: "Time pressure / skipped", hi: "समय का दबाव / छोड़ा गया" },
  recurring_gap: { en: "Recurring mistake", hi: "बार-बार होने वाली गलती" },
  fragile_correct: { en: "Correct but fragile", hi: "सही, पर अस्थिर" },
};

export type DiagnosedItem = {
  questionId: string;
  section: Section;
  concept: string;
  marksLost: number; // 0 for correct/confident items
  cause: ErrorCause | null; // null when correct and not fragile
  recoverable: boolean; // heuristic: is this the kind of error that closes fast?
  recoverySource: "rule"; // always "rule" — never claim this is a trained model
};

export type ScoreBreakdown = {
  totalMarks: number;
  maxMarks: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  bySection: Record<Section, { marks: number; max: number; correct: number; wrong: number; unattempted: number }>;
};

export type RecoveryReport = {
  attemptId: string;
  userId?: string;
  contextId?: string;
  score: ScoreBreakdown;
  diagnosis: DiagnosedItem[];
  marksLostTotal: number;
  marksRecoverableEstimate: number;
  recoverableByCause: Partial<Record<ErrorCause, number>>;
  nextActions: NextAction[];
};

export type NextAction = {
  id: string;
  title: Bilingual;
  description: Bilingual;
  cause: ErrorCause;
  concept: string;
  section: Section;
  estimatedMinutes: number;
  drillQuestionIds: string[]; // questions to serve in the repair drill
};

// ---- Error ledger (persisted across attempts) ------------------------------

export type ErrorLedgerEntry = {
  concept: string;
  section: Section;
  cause: ErrorCause;
  occurrences: number;
  lastSeenAttemptId: string;
  resolvedCount: number; // times a delayed unseen retest on this concept was answered correctly
  history: { attemptId: string; timestamp: string; result: "wrong" | "resolved" }[];
};

export type LearnerProfile = {
  name: string;
  language: Lang;
  createdAt: string;
};

// ---- Question disputes / correction pipeline -------------------------------
// Every question a learner can flag as wrong/ambiguous, kept separate from the
// personal-cause diagnosis flow (see src/lib/diagnosis.ts header) so a self-serving
// "the question was wrong" click can never silently suppress a real concept gap.

export type DisputeReason = "wrong_answer" | "ambiguous" | "translation" | "typo" | "other";

export const DISPUTE_REASON_LABEL: Record<DisputeReason, Bilingual> = {
  wrong_answer: { en: "The marked answer looks wrong", hi: "चिह्नित उत्तर गलत लगता है" },
  ambiguous: { en: "More than one option seems correct", hi: "एक से अधिक विकल्प सही लगते हैं" },
  translation: { en: "Hindi/English versions don't match", hi: "हिंदी/अंग्रेज़ी संस्करण मेल नहीं खाते" },
  typo: { en: "Typo or formatting issue", hi: "टाइपो या फ़ॉर्मेटिंग समस्या" },
  other: { en: "Something else", hi: "कुछ और" },
};

export type Dispute = {
  id: string;
  questionId: string;
  questionVersion: number;
  reason: DisputeReason;
  note: string;
  createdAt: string;
  status: "open" | "reviewed"; // "reviewed" is set by the (not-yet-built) editorial console — see docs/syllabus-update-process.md
};

// ---- Content versioning ------------------------------------------------------
// See docs/syllabus-update-process.md for what these mean operationally and how
// they're expected to change as SSC/Railway update exam patterns and syllabi.

export type ContentVersion = {
  /** Bumped whenever a question is added, edited, or retired. */
  contentVersion: string;
  /** The official exam pattern/blueprint this content was authored against. */
  examPatternVersion: string;
  lastReviewedAt: string; // ISO date
};
