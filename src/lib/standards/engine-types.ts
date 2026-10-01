/**
 * Shared contract for the standards teaching engine (client + server). Design: docs/standards-teaching-engine.md.
 * Truth rule: the AI proposes concepts, summaries, misconceptions and questions; plain code decides eligibility,
 * correctness, scheduling, rung changes and status labels. Answer keys, explanations and proof quotes are
 * returned only in AnswerFeedback, after the learner has answered.
 */
import type { OptionId, QuizOption } from "./quiz-types";

/** Ladder rungs: 1 Recognise, 2 Recall, 3 Explain, 4 Tell apart, 5 Apply, 6 Combine. */
export type Rung = 1 | 2 | 3 | 4 | 5 | 6;
export const RUNGS: Rung[] = [1, 2, 3, 4, 5, 6];
export const RUNG_LABELS: Record<Rung, string> = {
  1: "Recognise",
  2: "Recall",
  3: "Explain",
  4: "Tell apart",
  5: "Apply",
  6: "Combine",
};
/** Existing question `level` for each rung. */
export const RUNG_LEVEL: Record<Rung, "recall" | "understanding" | "application"> = {
  1: "recall",
  2: "recall",
  3: "understanding",
  4: "understanding",
  5: "application",
  6: "application",
};

/** A typical confusion about a concept. Each wrong option of a question is tagged with one (or "near-miss"). */
export interface Misconception {
  id: string;
  /** What the learner probably believes, in one short sentence. */
  label: string;
  /** The one-line difference that corrects it, grounded in the text. */
  contrast: string;
}
export const NEAR_MISS_TAG = "near-miss";

/** One verbatim passage of the standard that supports a concept. */
export interface Extract {
  clauseNo: string;
  quote: string;
}

/** A concept as stored (standard_concepts). */
export interface Concept {
  id: string;
  standardId: string;
  moduleNo: number;
  moduleTitle: string;
  /** Teaching order across the whole standard (0-based). */
  ord: number;
  title: string;
  /** Plain-words teach-card text. AI-written, labelled AI-generated in the UI. */
  summary: string;
  /** Short worked example shown on the teach card (AI-written, grounded in the extracts). */
  example: string | null;
  extracts: Extract[];
  /** standard_clauses.clause_no values this concept is taught from. */
  clauseNos: string[];
  /** Concept ids that should be Practised first. */
  prerequisites: string[];
  /** Concept ids often confused with this one (drives rung-4 questions). */
  confusableWith: string[];
  misconceptions: Misconception[];
  status: "proposed" | "reviewed";
}

/** Plain evidence status; never a mastery claim or a forecast. */
export type ConceptStatus = "not_started" | "learning" | "practised" | "solid";
export const STATUS_LABELS: Record<ConceptStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  practised: "Practised",
  solid: "Solid",
};

export interface ConceptEvidence {
  /** Independent (no hint) correct answers, all rungs. */
  independentCorrect: number;
  attempts: number;
  /** Highest rung passed, 0 when none. */
  rungPassed: number;
  lastAt: string | null;
  /** When the next spaced review is due, null until the concept is Practised. */
  dueAt: string | null;
}

// ---------------------------------------------------------------- learner-facing views

export interface LearnConceptRow {
  id: string;
  title: string;
  status: ConceptStatus;
  evidence: ConceptEvidence;
  /** true when its prerequisites are not Practised yet (shown dimmed, still readable). */
  locked: boolean;
}

export interface LearnModuleRow {
  moduleNo: number;
  title: string;
  concepts: LearnConceptRow[];
}

/** GET /api/standards/<id>/learn */
export interface LearnOverview {
  standardId: string;
  modules: LearnModuleRow[];
  /** Reviews due now across the standard. */
  dueCount: number;
  /** false while no curriculum exists for this standard or no question supply can serve any step. */
  ready: boolean;
  /** Why not ready, in plain words (null when ready). */
  notReadyReason: string | null;
  /** One-line preview of what "Continue" will do ("New idea: impartiality"), null when nothing is available. */
  nextReason: string | null;
  sessionSize: number;
}

export interface SessionProgress {
  /** Steps answered in this session. */
  done: number;
  planned: number;
}

export interface TeachCard {
  kind: "teach";
  conceptId: string;
  title: string;
  moduleTitle: string;
  summary: string;
  example: string | null;
  extracts: Extract[];
  /** Why you are seeing this now, one line. */
  reason: string;
  progress: SessionProgress;
}

export interface QuestionCard {
  kind: "question";
  questionId: string;
  conceptId: string;
  conceptTitle: string;
  rung: Rung;
  rungLabel: string;
  clauseNo: string;
  stem: string;
  options: QuizOption[];
  /** Why you are seeing this now, one line. */
  reason: string;
  /** true while the question is in the guided phase (a hint is available). */
  hintAvailable: boolean;
  progress: SessionProgress;
}

export interface SummaryCard {
  kind: "summary";
  progress: SessionProgress;
  /** Concepts touched this session with plain before/after status. */
  touched: { conceptId: string; title: string; before: ConceptStatus; after: ConceptStatus; independentCorrect: number; attempts: number }[];
  /** Concepts to look at again, each with the reason from real answers ("picked X twice"). */
  needsAttention: { conceptId: string; title: string; reason: string }[];
  nextReviewAt: string | null;
  /** Always shown: how small the evidence is. */
  caveat: string;
}

export type LearnStep = TeachCard | QuestionCard | SummaryCard;

/** POST {action:"answer"} */
export interface AnswerFeedback {
  questionId: string;
  correct: boolean;
  yourAnswer: OptionId;
  answer: OptionId;
  explanation: string;
  /** Why each WRONG option is wrong, keyed by option id. */
  optionNotes: Partial<Record<OptionId, string>>;
  proofQuote: string;
  proofClauseNo: string;
  clauseNo: string;
  /** Set when a wrong pick maps to a listed misconception: what the learner probably believes and the contrast. */
  misconception: { label: string; contrast: string } | null;
  hinted: boolean;
  /** Concept status before and after this answer. */
  statusBefore: ConceptStatus;
  statusAfter: ConceptStatus;
  rungBefore: number;
  rungAfter: number;
  /** One line on what happens next and why ("Two correct at Recall: moving to Explain"). */
  nextReason: string;
  progress: SessionProgress;
}

export interface LearnRequestNext {
  action: "next";
}
export interface LearnRequestAnswer {
  action: "answer";
  questionId: string;
  answer: OptionId;
  hinted: boolean;
  seconds: number;
}
export interface LearnRequestHint {
  action: "hint";
  questionId: string;
}
export interface LearnRequestAckTeach {
  action: "ack-teach";
  conceptId: string;
}
export type LearnRequest = LearnRequestNext | LearnRequestAnswer | LearnRequestHint | LearnRequestAckTeach;

// ---------------------------------------------------------------- portable curriculum file

/** Written by scripts/build-standard-curriculum.mjs, read by scripts/import-standard-curriculum.mjs. */
export interface CurriculumFile {
  version: 1;
  standardCode: string;
  generatedAt: string;
  concepts: Omit<Concept, "standardId">[];
  /** Points the independent critic raised that a human should look at. */
  reviewNotes: string[];
}

/** Per-question teaching metadata (standard_question_meta). */
export interface QuestionMeta {
  questionId: string;
  conceptId: string;
  rung: Rung;
  /** Option id -> misconception id (or NEAR_MISS_TAG) for the WRONG options. */
  optionTags: Partial<Record<OptionId, string>>;
}

/** Heuristic knobs, all in one place and documented as product heuristics, not research constants. */
export interface EnginePolicy {
  sessionSize: number;
  /** Max share of a session spent on due reviews. */
  reviewShare: number;
  /** Independent correct answers on different questions needed to pass a rung. */
  correctToPass: number;
  /** Consecutive wrong answers at a rung before stepping down. */
  wrongToStepDown: number;
  /** Misses on one concept in a session before its weakest prerequisite is inserted. */
  missesToInsertPrerequisite: number;
  /** A question is not repeated within this many attempts. */
  noRepeatWindow: number;
  /** Same misconception tag chosen this many times queues a contrast question. */
  tagRepeatsForContrast: number;
  /** Concepts of a module that must reach rung 3 before interleaving starts. */
  interleaveAfterConcepts: number;
  /** Minimum days since the previous answer for a "delayed" retrieval. */
  delayedAfterDays: number;
  /** Unseen supply per (concept, rung) below which background generation is requested. */
  lowSupply: number;
}
