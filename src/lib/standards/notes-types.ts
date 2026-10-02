/**
 * Shared contract for the learner's own study notes on a standard (client + server).
 * Tables: migrations/0012_standard_notes.sql. All rows are private to their user.
 *
 * Two lists:
 * - "Learn later": short topics or phrases the learner picked while reading (a selected phrase, a
 *   highlighted term in an AI answer, or typed by hand) to come back to. Each can be explained on
 *   demand by the AI tutor and ticked off.
 * - "Saved": explanations the learner chose to keep (an AI lesson, an Ask-AI answer, an explanation of
 *   a learn-later item, or a passage of the standard). Saved notes are snapshots: regenerating a lesson
 *   later never changes a saved copy.
 *
 * A saved note can be sent to ContentSathi as an idea for a post (see ContentSathiIdea). Sending is
 * always an explicit learner action with a preview; nothing is published from this app.
 */
import type { AnswerCheck } from "../server/followup/followup";

export type LearnLaterSource = "lesson" | "answer" | "clause" | "manual" | "test";

export interface LearnLaterItem {
  id: string;
  standardId: string;
  /** The clause the learner was reading when they added it (null for manual items). */
  clauseNo: string | null;
  /** The topic or phrase, as the learner picked it (trimmed, at most 200 characters). */
  text: string;
  /** The sentence around the phrase, so "why did I save this?" is answerable later (at most 600 characters). */
  context: string | null;
  source: LearnLaterSource;
  /** The saved note it was picked from, if any. */
  sourceNoteId: string | null;
  status: "open" | "done";
  /** Saved note holding the AI explanation of this item, once the learner asked for one and kept it. */
  explanationNoteId: string | null;
  createdAt: string;
  doneAt: string | null;
}

export type SavedNoteKind = "lesson" | "answer" | "explanation" | "excerpt";

export interface SavedNote {
  id: string;
  standardId: string;
  clauseNo: string | null;
  kind: SavedNoteKind;
  /** Short title shown in lists ("Why the National Foreword exists"). Editable. */
  title: string;
  /** The learner's question for "answer"/"explanation" notes. */
  question: string | null;
  /** The saved text (Markdown as the AI wrote it, or the verbatim passage for "excerpt"). */
  body: string;
  /** The learner's own words added to the note (optional, editable). */
  myNote: string | null;
  /** true for AI-written text (shown with the AI-generated badge). false only for "excerpt". */
  aiGenerated: boolean;
  model: string | null;
  sources: { title: string; uri: string }[];
  /** The second AI's verdict at the time it was saved, when there was one. */
  check: AnswerCheck | null;
  createdAt: string;
  updatedAt: string;
  /** Set once the note has been sent to ContentSathi. */
  contentSathi: { sentAt: string; ideaId: string | null } | null;
}

// ---------------------------------------------------------------- API shapes

/** GET /api/standards/<id>/notes */
export interface NotesOverview {
  learnLater: LearnLaterItem[];
  saved: SavedNote[];
  counts: { open: number; done: number; saved: number };
  /** Whether "Send to ContentSathi" is configured on this server. */
  contentSathiEnabled: boolean;
}

/** POST /api/standards/<id>/notes {action, ...} */
export type NotesRequest =
  | { action: "add-later"; text: string; context?: string | null; clauseNo?: string | null; source: LearnLaterSource; sourceNoteId?: string | null }
  | { action: "update-later"; itemId: string; status?: "open" | "done"; text?: string }
  | { action: "delete-later"; itemId: string }
  | {
      action: "save";
      kind: SavedNoteKind;
      clauseNo?: string | null;
      title?: string | null;
      question?: string | null;
      body: string;
      aiGenerated: boolean;
      model?: string | null;
      sources?: { title: string; uri: string }[];
      check?: AnswerCheck | null;
    }
  | { action: "update-note"; noteId: string; title?: string; myNote?: string | null }
  | { action: "delete-note"; noteId: string };

/** POST /api/standards/<id>/notes/explain {itemId} — AI explanation of a learn-later item (not saved until the learner saves it). */
export interface ExplainLaterResponse {
  itemId: string;
  answer: string;
  model: string;
  grounded: boolean;
  sources: { title: string; uri: string }[];
  searchEntryPointHtml: string | null;
  aiGenerated: true;
  check: { id: string | null; status: AnswerCheck["status"] };
}

// ---------------------------------------------------------------- ContentSathi bridge

/**
 * What leaves this app for ContentSathi: an IDEA for a post, not a post. ContentSathi drafts the post in
 * the learner's voice and nothing is published without its own approval step.
 * Rules (enforced on the server before sending): no more than one verbatim quote from the standard, at
 * most 25 words; no clause text beyond that; the clause is cited by number; AI-written material is marked.
 */
export interface ContentSathiIdea {
  /** Stable id of the source note in this app (idempotency: sending the same note twice updates, never duplicates). */
  externalRef: string;
  source: "score-recovery";
  /** One-line topic for the post ("Why ISO/IEC 17025 asks labs to manage impartiality risks"). */
  topic: string;
  /** Suggested angle, in the learner's direction ("What I learnt this week as a BIS officer"). Optional. */
  angle: string | null;
  /** 3 to 6 short takeaways in plain words. */
  keyPoints: string[];
  /** At most one short verbatim quote (<= 25 words) with its clause. */
  quote: { text: string; clauseNo: string } | null;
  /** E.g. "IS/ISO/IEC 17025:2017, clause 4.1". */
  reference: string;
  /** The learner's own note, if any (most valuable input for an authentic post). */
  myNote: string | null;
  aiGenerated: boolean;
  /** ISO time the learner pressed Send. */
  sentAt: string;
}

/** POST /api/standards/<id>/notes/content-sathi {noteId, preview: true} returns the idea that WOULD be sent;
 *  {noteId, preview: false, idea} sends the (possibly edited) idea and returns the result. */
export interface ContentSathiSendResult {
  idea: ContentSathiIdea;
  sent: boolean;
  /** ContentSathi's id for the idea, when sent. */
  ideaId: string | null;
  /** Where to continue in ContentSathi (its ideas / studio page), when sent. */
  openUrl: string | null;
}
