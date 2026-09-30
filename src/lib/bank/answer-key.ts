/**
 * Decides which answer a question-bank item is scored against, from the evidence rows
 * stored for it. This is the only place that turns evidence into a key.
 *
 * Rules (DECISION-002):
 * - An SSC key (final, or the tick marks on an SSC response sheet) is the authority. Nothing
 *   overrides it; disagreeing sources are reported as dissent, not applied.
 * - AI never supplies a key. A blind AI solve can only corroborate a human-sourced key, or
 *   dispute it.
 * - Human-sourced keys (Testbook solutions, a publisher's printed key) count as independent
 *   only across different source groups: two publishers owned by one company are one source.
 * - Anything contradictory is `disputed` and is not scored until the learner resolves it.
 */

export type AnswerAuthority =
  | "ssc_final"
  | "ssc_response_sheet"
  | "testbook_portal"
  | "publisher_key"
  | "human_review"
  | "ai_blind_solve";

export interface AnswerEvidence {
  authority: AnswerAuthority;
  sourceGroup: string;
  sourceLabel: string;
  answer: string | null;
  dropped: boolean;
  observedAt: string;
}

export type KeyStatus =
  | "official"
  | "corroborated"
  | "ai_checked"
  | "single_source"
  | "reviewed"
  | "disputed"
  | "dropped"
  | "no_key";

export interface ResolvedKey {
  status: KeyStatus;
  /** The option id to score against; null whenever the question must not be scored. */
  answer: string | null;
  /** Evidence that agrees with `answer` (or, when unscored, everything that was considered). */
  basis: AnswerEvidence[];
  /** Evidence that disagrees with `answer`. Shown to the learner, never applied. */
  dissent: AnswerEvidence[];
}

const SCORED: ReadonlySet<KeyStatus> = new Set(["official", "corroborated", "ai_checked", "single_source", "reviewed"]);

export function isScored(status: KeyStatus): boolean {
  return SCORED.has(status);
}

export const KEY_STATUS_LABEL: Record<KeyStatus, string> = {
  official: "SSC's own key",
  corroborated: "Independent sources agree",
  ai_checked: "Source key, confirmed by an independent AI solve",
  single_source: "Single source key, not yet cross-checked",
  reviewed: "Resolved by your review",
  disputed: "Sources disagree: not scored",
  dropped: "Dropped from the key: not scored",
  no_key: "No trustworthy key: not scored",
};

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function latest(rows: AnswerEvidence[]): AnswerEvidence {
  return rows.reduce((a, b) => (b.observedAt > a.observedAt ? b : a));
}

/**
 * @param optionIds the question's own option ids. Evidence naming any other option is
 *   malformed and makes the question disputed rather than silently ignored.
 */
export function resolveAnswerKey(evidence: AnswerEvidence[], optionIds: string[]): ResolvedKey {
  const valid = new Set(optionIds);
  const malformed = evidence.filter((row) => !row.dropped && (row.answer === null || !valid.has(row.answer)));
  if (malformed.length) return { status: "disputed", answer: null, basis: evidence, dissent: malformed };

  const ai = evidence.filter((row) => row.authority === "ai_blind_solve");
  const withDissent = (status: KeyStatus, answer: string, basis: AnswerEvidence[]): ResolvedKey => ({
    status,
    answer,
    basis,
    dissent: evidence.filter((row) => !basis.includes(row) && (row.dropped || row.answer !== answer)),
  });

  // 1. SSC's own key. Final beats response-sheet ticks; either beats everything else.
  for (const authority of ["ssc_final", "ssc_response_sheet"] as const) {
    const rows = evidence.filter((row) => row.authority === authority);
    if (!rows.length) continue;
    if (rows.every((row) => row.dropped)) return { status: "dropped", answer: null, basis: rows, dissent: [] };
    const answers = distinct(rows.filter((row) => !row.dropped).map((row) => row.answer));
    if (answers.length !== 1 || rows.some((row) => row.dropped)) {
      return { status: "disputed", answer: null, basis: rows, dissent: rows };
    }
    return withDissent("official", answers[0], rows.filter((row) => row.answer === answers[0]));
  }

  // 2. The learner resolved it themselves (only ever offered for disputed items).
  const reviews = evidence.filter((row) => row.authority === "human_review");
  if (reviews.length) {
    const decision = latest(reviews);
    if (decision.dropped || decision.answer === null) return { status: "dropped", answer: null, basis: [decision], dissent: [] };
    return withDissent("reviewed", decision.answer, [decision]);
  }

  // 3. Human-sourced provider keys.
  const human = evidence.filter((row) => row.authority === "testbook_portal" || row.authority === "publisher_key");
  if (!human.length) return { status: "no_key", answer: null, basis: ai, dissent: [] };
  if (human.every((row) => row.dropped)) return { status: "dropped", answer: null, basis: human, dissent: [] };
  const answers = distinct(human.filter((row) => !row.dropped).map((row) => row.answer));
  if (answers.length !== 1 || human.some((row) => row.dropped)) {
    return { status: "disputed", answer: null, basis: human, dissent: human };
  }

  const answer = answers[0];
  // Any disagreeing AI solve blocks scoring: better an unscored question than a taught error.
  if (ai.some((row) => row.answer !== answer)) {
    return { status: "disputed", answer: null, basis: human, dissent: ai.filter((row) => row.answer !== answer) };
  }
  const groups = new Set(human.map((row) => row.sourceGroup));
  if (groups.size >= 2) return withDissent("corroborated", answer, human);
  if (ai.length) return withDissent("ai_checked", answer, [...human, ...ai]);
  return withDissent("single_source", answer, human);
}
