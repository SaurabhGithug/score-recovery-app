/**
 * Which units of a standard get questions, how many each, and the outline given to the models.
 */
import type { ClauseRow } from "../repo";
import { numberedParagraphs } from "./text";

/** Units never quizzed: the BIS National Foreword, the Introduction and the Bibliography. */
const EXCLUDED = new Set(["NF", "intro"]);
const EXCLUDED_TITLE = /^bibliography$/i;
/** Units shorter than this are skipped, except defined terms (3.x), which always get the minimum. */
export const MIN_BODY_CHARS = 250;
/**
 * Characters of clause text per question. The brief proposed 450, which gives only 162 questions
 * for the 53 eligible units of IS/ISO/IEC 17025:2017, far short of its 250-330 target; 200 gives
 * 280 (gate and checker losses are made up by asking for a few extra, see surplusFor).
 */
export const CHARS_PER_QUESTION = 200;
export const MIN_QUOTA = 2;
export const MAX_QUOTA = 8;
/** A defined term is one concept: more questions than this only repeat it or drift into its examples. */
export const MAX_DEFINITION_QUOTA = 4;

export function quotaFor(bodyChars: number, clauseNo = ""): number {
  const max = isDefinition(clauseNo) ? MAX_DEFINITION_QUOTA : MAX_QUOTA;
  return Math.min(max, Math.max(MIN_QUOTA, Math.round(bodyChars / CHARS_PER_QUESTION)));
}

/** Extra questions asked for per unit, so gate rejections and checker disagreements still leave the quota. */
export function surplusFor(quota: number): number {
  return Math.ceil(quota * 0.25);
}

export function isDefinition(clauseNo: string): boolean {
  return /^3\.\d+$/.test(clauseNo);
}

export interface PlannedUnit {
  clause: ClauseRow;
  quota: number;
}

export interface UnitPlan {
  units: PlannedUnit[];
  skipped: { clauseNo: string; title: string; reason: string }[];
  /** Requested clause numbers that are not units of this standard. */
  unknown: string[];
}

export function planUnits(clauses: ClauseRow[], options: { only?: string[]; perClause?: number } = {}): UnitPlan {
  const only = options.only?.length ? new Set(options.only) : null;
  const plan: UnitPlan = { units: [], skipped: [], unknown: [] };
  if (only) plan.unknown = [...only].filter((no) => !clauses.some((c) => c.clause_no === no));
  for (const clause of clauses) {
    if (only && !only.has(clause.clause_no)) continue;
    const chars = clause.body.trim().length;
    const skip = (reason: string) => plan.skipped.push({ clauseNo: clause.clause_no, title: clause.title, reason });
    if (EXCLUDED.has(clause.clause_no) || EXCLUDED_TITLE.test(clause.title.trim())) skip("excluded (foreword, introduction or bibliography)");
    else if (!chars) skip("heading only (no text of its own)");
    else if (chars < MIN_BODY_CHARS && !isDefinition(clause.clause_no)) skip(`short (${chars} characters < ${MIN_BODY_CHARS})`);
    else plan.units.push({ clause, quota: options.perClause ?? quotaFor(chars, clause.clause_no) });
  }
  return plan;
}

/** Clause numbers and titles of the whole standard (context for the models, no clause text). */
export function outline(clauses: ClauseRow[]): string {
  return clauses
    .filter((c) => !EXCLUDED.has(c.clause_no))
    .map((c) => `${"  ".repeat(Math.max(0, c.clause_no.split(".").length - 1))}${/^[A-Z]$/.test(c.clause_no) ? "" : `${c.clause_no} `}${c.title}`)
    .join("\n");
}

/** Every clause number that exists in the standard: units and the numbered paragraphs inside them. */
export function knownClauseNumbers(clauses: ClauseRow[]): Set<string> {
  const known = new Set<string>();
  for (const c of clauses) {
    known.add(c.clause_no);
    for (const p of numberedParagraphs(c.clause_no, c.body)) known.add(p.no);
  }
  return known;
}
