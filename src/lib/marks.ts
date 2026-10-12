import type { Bilingual } from "./types";

/** A learner's own mark on a question they have answered. One mark per question; clearing deletes it. */
export const MARK_LEVELS = ["super_important", "important", "revise"] as const;
export type MarkLevel = (typeof MARK_LEVELS)[number];
export type MarkSourceKind = "bank" | "made_easy";

export const MARK_NOTE_MAX = 1000;

export const MARK_LABEL: Record<MarkLevel, Bilingual> = {
  super_important: { en: "Super important", hi: "अति महत्वपूर्ण" },
  important: { en: "Important", hi: "महत्वपूर्ण" },
  revise: { en: "Revise", hi: "दोहराना" },
};

export function isMarkLevel(value: unknown): value is MarkLevel {
  return typeof value === "string" && (MARK_LEVELS as readonly string[]).includes(value);
}

export interface QuestionMark {
  kind: MarkSourceKind;
  id: string;
  level: MarkLevel;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** The question as the learner may see it after answering. Made Easy questions carry the portal's sanitized HTML. */
export interface MarkedQuestionView {
  heading: string;
  question: string;
  questionHtml: string | null;
  options: { label: string; text: string; html: string | null }[];
  key: string | null;
  keySource: string;
  learnerAnswer: string | null;
  explanation: string | null;
  explanationHtml: string | null;
  /** Why the text may be incomplete (scanned page, missing figure), when it may be. */
  incomplete: string | null;
  /** Past papers: the scanned question without the answer key, shown with the question. */
  imageUrl: string | null;
  /** Past papers: the original scan, which shows SSC's key, shown only with the answer. */
  answerImageUrl: string | null;
}

export interface MarkedQuestion extends QuestionMark {
  /** null when the question can no longer be shown; `unavailable` says why. */
  view: MarkedQuestionView | null;
  unavailable: string | null;
}
