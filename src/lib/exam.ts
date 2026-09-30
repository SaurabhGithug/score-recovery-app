import { quantQuestions } from "./content/quant";
import { reasoningQuestions } from "./content/reasoning";
import { englishQuestions } from "./content/english";
import { gkQuestions } from "./content/gk";
import { Bilingual, ContentVersion, Question } from "./types";

// See docs/syllabus-update-process.md for what these mean operationally and when/how they
// should change as SSC/Railway update exam patterns and syllabi over time.
export const CONTENT_VERSION: ContentVersion = {
  contentVersion: "1.0.0",
  examPatternVersion: "SSC-CGL-Tier1-2025",
  lastReviewedAt: "2026-09-09",
};

export const ALL_QUESTIONS: Question[] = [
  ...quantQuestions,
  ...reasoningQuestions,
  ...englishQuestions,
  ...gkQuestions,
];

export const QUESTION_BY_ID: Map<string, Question> = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

/** The first-seen question for each concept — used to build the diagnostic mock. */
export const DIAGNOSTIC_QUESTIONS: Question[] = ALL_QUESTIONS.filter((q) => !q.retestOf);

/** The paired, delayed-unseen-retest question for each concept — served only via repair drills. */
export const RETEST_QUESTIONS: Question[] = ALL_QUESTIONS.filter((q) => !!q.retestOf);

export function retestQuestionFor(originalId: string): Question | null {
  return RETEST_QUESTIONS.find((q) => q.retestOf === originalId) ?? null;
}

export function conceptRetestQuestions(section: string, concept: string): Question[] {
  return RETEST_QUESTIONS.filter((q) => q.section === section && q.concept === concept);
}

export type ExamBlueprint = {
  id: string;
  title: Bilingual;
  description: Bilingual;
  durationSeconds: number;
  questions: Question[];
};

export const DIAGNOSTIC_BLUEPRINT: ExamBlueprint = {
  id: "ssc-cgl-diagnostic",
  title: { en: "Quick practice test", hi: "छोटा अभ्यास टेस्ट" },
  description: {
    en: "A short set of questions from four sections to help you find mistakes. This is not a full SSC JE paper.",
    hi: "सभी चार खंडों में प्रत्येक अवधारणा से एक प्रश्न — यह जानने के लिए पर्याप्त कि आप वास्तव में कहाँ अंक गंवा रहे हैं।",
  },
  durationSeconds: 24 * 60,
  questions: DIAGNOSTIC_QUESTIONS,
};

export const EXAM_BLUEPRINTS: ExamBlueprint[] = [DIAGNOSTIC_BLUEPRINT];

export function getBlueprint(id: string): ExamBlueprint | null {
  return EXAM_BLUEPRINTS.find((b) => b.id === id) ?? null;
}
