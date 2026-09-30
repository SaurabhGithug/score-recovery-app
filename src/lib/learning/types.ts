import type { BankQuestionForAttempt, BankKeyView } from "../bank/api-types";

export const CAUSES = ["concept", "formula", "method", "calculation_units", "reading", "time", "deliberate_skip", "not_reached", "unsure"] as const;
export type LearningCause = typeof CAUSES[number];
export type LearningMode = "learn" | "check" | "speed";
export interface LearningEvent {
  id: string; questionId: string; fingerprint: string; contentVersion: string;
  groupId: string; groupName: string; at: string; correct: boolean | null;
  answer: string | null; assisted: boolean; repeated: boolean; seconds: number;
  interrupted: boolean; confidence: number | null; cause: LearningCause | null;
  mode: LearningMode; dueAt: string; intervalDays: number;
}
export interface LearningGroup {
  id: string; name: string; attempts: number; independent: number; correct: number;
  newAttempts: number; newCorrect: number; assisted: number; due: number;
  retained: number; retentionChecks: number; medianSeconds: number | null;
  status: "No evidence" | "Building evidence" | "Needs practice" | "Consistent so far";
}
export interface PlanItem {
  questionId: string; fingerprint: string; groupId: string; groupName: string;
  reason: string; activity: string; targetSeconds: number | null;
}
export interface LearningFeedback {
  correct: boolean | null; selected: string | null; key: BankKeyView;
  sourceSolution: string | null; explanationNotice: string;
  nextStep: string; dueAt: string; assisted: boolean; repeated: boolean;
}
export interface LearningSessionView {
  id: string; mode: LearningMode; cursor: number; total: number; completed: boolean;
  item: PlanItem | null; question: BankQuestionForAttempt | null;
  version: string | null; selected: string | null; seconds: number;
  confidence: number | null; cause: LearningCause | null; assisted: boolean;
  feedback: LearningFeedback | null; lesson: LearningLesson | null;
}
export interface LearningLesson {
  title: string; body: string; sourceTitle: string; sourceLocator: string;
  kind: "source" | "ai"; limitations: string[];
}
export interface LearningOverview {
  groups: LearningGroup[]; recent: LearningEvent[];
  practiceReadyGroupIds: string[];
  inventory: { papers: number; questions: number; eligible: number; heldOut: number; reserved: number; explanations: number; fineMappings: number };
  activeSessionId: string | null; nextDueAt: string | null;
  policy: { version: string; note: string };
}
