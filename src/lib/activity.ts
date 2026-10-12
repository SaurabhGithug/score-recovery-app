/**
 * The activity log: one row per meaningful action a learner takes (not every click).
 * Client events are UI-only facts the server cannot see (a page opened, an answer looked at).
 * Server events are recorded by the route that did the work, so a browser cannot forge them.
 */
export const CLIENT_EVENT_TYPES = [
  "page.view",
  "me.answer.view",
  "me.teach.open",
  "me.practice.start",
  "me.practice.finish",
  "me.practice.leave",
  "chatgpt.send",
] as const;

export const SERVER_EVENT_TYPES = [
  "auth.signin",
  "me.practice.answer",
  "ai.followup.ask",
  "ai.studypack.open",
  "mark.set",
  "mark.clear",
  "note.save",
  "bank.attempt.start",
  "bank.attempt.submit",
] as const;

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type ActivityType = ClientEventType | (typeof SERVER_EVENT_TYPES)[number];

/** What an event is about: a page path, a question (Made Easy or bank), a Made Easy test, or a bank paper/attempt. */
export type ActivityTargetKind = "page" | "made_easy" | "bank" | "made_easy_test" | "bank_paper" | "bank_attempt";
export const TARGET_KINDS: readonly ActivityTargetKind[] = ["page", "made_easy", "bank", "made_easy_test", "bank_paper", "bank_attempt"];

export type ActivityDetail = Record<string, string | number | boolean | null>;

/** Traffic from Claude's own browser (used for testing the app); reports leave it out. */
export const CLAUDE_CLIENT = "claude-app";

export interface ActivityEvent {
  id: string;
  at: string;
  type: ActivityType;
  targetKind: ActivityTargetKind | null;
  targetId: string | null;
  detail: ActivityDetail;
  client: string;
}

/** Where a learner stands on each saved question of one Made Easy test. */
export type CoverageState = "correct" | "wrong" | "viewed" | "untouched";

export interface MadeEasyCoverage {
  code: string;
  title: string;
  questions: { id: string; number: number; state: CoverageState; attempts: number; lastAt: string | null }[];
  counts: Record<CoverageState, number>;
}

export interface ActivityOverview {
  events: ActivityEvent[];
  /** null for an account that has no Made Easy tests. */
  coverage: MadeEasyCoverage[] | null;
  /** When this account's first event was logged (the log starts on 2 Oct 2026). */
  trackingSince: string | null;
  /** Events from Claude's testing browser, left out of the list and the counts. */
  hiddenTestEvents: number;
}
