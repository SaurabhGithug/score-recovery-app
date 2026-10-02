/**
 * Deterministic gates every standard question must pass, at generation and again at import (an
 * export file is never trusted). A question failing any gate is rejected and counted by reason;
 * style problems are rejected, not queued for review: a fresh question is cheap.
 */
import crypto from "node:crypto";
import { OPTION_IDS, type OptionId, type QuestionLevel, type QuizOption } from "../../../standards/quiz-types";
import type { ClauseRow } from "../repo";
import {
  citesClause,
  clauseReferences,
  collapseSpace,
  containsWords,
  findVerbatim,
  hasLetterReference,
  normaliseQuote,
  normaliseWords,
  numberedParagraphs,
  paragraphAt,
  stemHasLetterReference,
  wordCount,
} from "./text";

/** A question before it is stored: options in A-D order. */
export interface DraftQuestion {
  stem: string;
  options: QuizOption[];
  answer: OptionId;
  explanation: string;
  optionNotes: Partial<Record<OptionId, string>>;
  proofQuote: string;
  proofClauseNo: string;
  difficulty: 1 | 2 | 3;
  level: QuestionLevel;
}

export type RejectReason =
  | "shape"
  | "too_long"
  | "banned_option"
  | "document_reference"
  | "letter_reference"
  | "length_cue"
  | "options_not_distinct"
  | "answer_in_stem"
  | "notes_incomplete"
  | "note_without_clause"
  | "unknown_clause_reference"
  | "quote_too_short"
  | "quote_too_long"
  | "quote_not_verbatim"
  | "proof_clause_invalid"
  | "proof_clause_mismatch"
  | "duplicate_stem"
  | "duplicate_quote";

export interface Rejection {
  reason: RejectReason;
  detail: string;
  stem: string;
}

export const LIMITS = { stem: 900, option: 320, explanation: 1400, note: 500, quoteMinWords: 6, quoteMaxWords: 90 };
const LEVELS: QuestionLevel[] = ["recall", "understanding", "application"];

const BANNED_OPTION = /\b(?:all|none|both|neither)\b\s*(?:of\s+(?:the\s+)?(?:above|these|them)|the\s+above|[A-D]\s+(?:and|nor|or)\s+[A-D])\b/i;
const DOCUMENT_REFERENCE =
  /\b(?:according to|as per|as (?:stated|mentioned|described|given) in|mentioned in|based on|in)\s+the\s+(?:passage|excerpt|extract|material|given text|provided text|text (?:above|below|provided|given)|above text|given unit|unit text|unit above)\b|\bthe (?:passage|excerpt) (?:above|below)\b/i;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type Parsed = { ok: true; draft: DraftQuestion } | { ok: false; rejection: Rejection };

const fail = (reason: RejectReason, detail: string, stem: string): Parsed => ({ ok: false, rejection: { reason, detail, stem: stem.slice(0, 200) } });

/** Reads one question as the generator returned it ({options: {A..D}, optionNotes: {..}}). */
export function draftFromModel(raw: unknown): Parsed {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("shape", "not an object", "");
  const r = raw as Record<string, unknown>;
  const stem = str(r.stem);
  const opts = r.options;
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) return fail("shape", "options must be an object A-D", stem);
  const optionMap = opts as Record<string, unknown>;
  const keys = Object.keys(optionMap).map((k) => k.trim().toUpperCase());
  if (keys.length !== 4 || !OPTION_IDS.every((id) => keys.includes(id))) return fail("shape", "needs exactly four options A-D", stem);
  const options = OPTION_IDS.map((id) => ({ id, text: str(optionMap[Object.keys(optionMap).find((k) => k.trim().toUpperCase() === id)!]) }));
  const notesRaw = r.optionNotes && typeof r.optionNotes === "object" && !Array.isArray(r.optionNotes) ? (r.optionNotes as Record<string, unknown>) : {};
  const optionNotes: Partial<Record<OptionId, string>> = {};
  for (const [k, v] of Object.entries(notesRaw)) {
    const id = k.trim().toUpperCase() as OptionId;
    if (!OPTION_IDS.includes(id)) return fail("shape", `option note for unknown option "${k}"`, stem);
    if (str(v)) optionNotes[id] = str(v);
  }
  const difficulty = Number(r.difficulty);
  return checkShape({
    stem,
    options,
    answer: str(r.answer).toUpperCase() as OptionId,
    explanation: str(r.explanation),
    optionNotes,
    proofQuote: str(r.proofQuote),
    proofClauseNo: str(r.proofClauseNo),
    difficulty: (difficulty === 1 || difficulty === 2 || difficulty === 3 ? difficulty : 0) as 1 | 2 | 3,
    level: str(r.level).toLowerCase() as QuestionLevel,
  });
}

/** Gate (a) and (f): fields, sizes, style. Works on a draft from the model or from an export file. */
export function checkShape(d: DraftQuestion): Parsed {
  const stem = d.stem;
  if (stem.length < 15) return fail("shape", "stem missing or too short", stem);
  if (!Array.isArray(d.options) || d.options.length !== 4 || d.options.some((o, i) => o?.id !== OPTION_IDS[i] || typeof o.text !== "string" || !o.text.trim())) {
    return fail("shape", "needs exactly four non-empty options A-D in order", stem);
  }
  if (!OPTION_IDS.includes(d.answer)) return fail("shape", `answer "${d.answer}" is not one of A-D`, stem);
  if (!d.explanation) return fail("shape", "no explanation", stem);
  if (!d.proofQuote) return fail("shape", "no proof quote", stem);
  if (!d.proofClauseNo) return fail("shape", "no proof clause number", stem);
  if (![1, 2, 3].includes(d.difficulty)) return fail("shape", "difficulty must be 1, 2 or 3", stem);
  if (!LEVELS.includes(d.level)) return fail("shape", `level "${d.level}" is not recall, understanding or application`, stem);

  if (stem.length > LIMITS.stem) return fail("too_long", "stem", stem);
  if (d.options.some((o) => o.text.length > LIMITS.option)) return fail("too_long", "an option", stem);
  if (d.explanation.length > LIMITS.explanation) return fail("too_long", "explanation", stem);
  if (Object.values(d.optionNotes).some((n) => (n ?? "").length > LIMITS.note)) return fail("too_long", "an option note", stem);

  if (d.options.some((o) => BANNED_OPTION.test(o.text))) return fail("banned_option", "all/none/both-style option", stem);
  if (DOCUMENT_REFERENCE.test(stem)) return fail("document_reference", "stem refers to the passage instead of the standard", stem);
  if (new Set(d.options.map((o) => normaliseWords(o.text))).size !== 4) return fail("options_not_distinct", "two options are the same", stem);

  const wrong = OPTION_IDS.filter((id) => id !== d.answer);
  const noteIds = Object.keys(d.optionNotes) as OptionId[];
  if (noteIds.length !== 3 || !wrong.every((id) => d.optionNotes[id]?.trim())) {
    return fail("notes_incomplete", `notes must cover exactly the three wrong options (got ${noteIds.sort().join(",") || "none"}, key ${d.answer})`, stem);
  }
  if (stemHasLetterReference(stem)) return fail("letter_reference", "stem points at an option letter", stem);
  if (hasLetterReference(d.explanation)) return fail("letter_reference", `explanation: ${collapseSpace(d.explanation).slice(0, 160)}`, stem);
  for (const id of wrong) {
    if (hasLetterReference(d.optionNotes[id]!)) return fail("letter_reference", `note: ${collapseSpace(d.optionNotes[id]!).slice(0, 160)}`, stem);
  }
  for (const id of wrong) {
    if (!citesClause(d.optionNotes[id]!)) return fail("note_without_clause", `note cites no clause number: ${d.optionNotes[id]!.slice(0, 120)}`, stem);
  }

  // A correct option that is conspicuously longer than every wrong one gives the answer away.
  const correctLen = d.options.find((o) => o.id === d.answer)!.text.length;
  const maxWrong = Math.max(...d.options.filter((o) => o.id !== d.answer).map((o) => o.text.length));
  if (correctLen >= maxWrong * 1.5 && correctLen - maxWrong >= 25) return fail("length_cue", `correct option ${correctLen} chars vs longest wrong ${maxWrong}`, stem);

  // Gate (d): the correct option's words must not already be in the stem.
  const correct = d.options.find((o) => o.id === d.answer)!.text;
  if (containsWords(stem, correct)) return fail("answer_in_stem", `"${correct.slice(0, 80)}" appears in the stem`, stem);

  return { ok: true, draft: { ...d, stem: collapseSpace(stem), options: d.options.map((o) => ({ id: o.id, text: collapseSpace(o.text) })) } };
}

/**
 * Gates (b) and (c) against the unit's CURRENT body, plus invented clause numbers. On success the
 * proof quote is replaced by the body's own text and the proof clause by the paragraph the quote is
 * actually in (never the model's copy).
 */
export function checkAgainstText(d: DraftQuestion, unit: Pick<ClauseRow, "clause_no" | "body">, known: Set<string>): Parsed {
  const stem = d.stem;
  const words = wordCount(d.proofQuote);
  if (words < LIMITS.quoteMinWords) return fail("quote_too_short", `${words} words`, stem);
  if (words > LIMITS.quoteMaxWords) return fail("quote_too_long", `${words} words`, stem);
  const matches = findVerbatim(unit.body, d.proofQuote);
  if (!matches.length) return fail("quote_not_verbatim", collapseSpace(d.proofQuote).slice(0, 200), stem);

  const paragraphs = new Set(numberedParagraphs(unit.clause_no, unit.body).map((p) => p.no));
  // "Clause 6.4.13 a)" -> "6.4.13": a list item belongs to its paragraph.
  const claimed = d.proofClauseNo.replace(/^(?:clause|section)\s+/i, "").replace(/\s*\(?[a-z]\)$/, "").trim();
  if (claimed !== unit.clause_no && !paragraphs.has(claimed)) return fail("proof_clause_invalid", `"${d.proofClauseNo}" is not a numbered paragraph of ${unit.clause_no}`, stem);
  // The claimed paragraph must be where (one occurrence of) the quote is, or the unit itself.
  const located = matches.map((m) => ({ m, no: paragraphAt(unit.clause_no, unit.body, m.start) }));
  const hit = claimed === unit.clause_no ? located[0] : located.find((l) => l.no === claimed);
  if (!hit) return fail("proof_clause_mismatch", `quote is in ${located.map((l) => l.no).join("/")}, not ${claimed}`, stem);

  const texts = [d.explanation, ...Object.values(d.optionNotes).map((n) => n ?? "")];
  const unknown = texts.flatMap(clauseReferences).filter((no) => !known.has(no));
  if (unknown.length) return fail("unknown_clause_reference", `cites ${[...new Set(unknown)].join(", ")}, not in the standard`, stem);

  return { ok: true, draft: { ...d, proofQuote: hit.m.text, proofClauseNo: hit.no } };
}

/** Gate (e): drops later questions that repeat an earlier stem or proof quote of the same unit. */
export function dedupe<T extends { stem: string; proofQuote: string }>(items: T[]): { kept: T[]; rejections: Rejection[] } {
  const stems = new Set<string>();
  const quotes = new Set<string>();
  const kept: T[] = [];
  const rejections: Rejection[] = [];
  for (const q of items) {
    const s = normaliseWords(q.stem);
    const p = normaliseQuote(q.proofQuote);
    if (stems.has(s)) rejections.push({ reason: "duplicate_stem", detail: "same stem as an earlier question", stem: q.stem.slice(0, 200) });
    else if (quotes.has(p)) rejections.push({ reason: "duplicate_quote", detail: "same proof quote as an earlier question", stem: q.stem.slice(0, 200) });
    else {
      stems.add(s);
      quotes.add(p);
      kept.push(q);
    }
  }
  return { kept, rejections };
}

/** Stable id: re-importing or re-storing the same question keeps its id (attempts refer to ids). */
export function questionId(standardId: string, clauseNo: string, stem: string, correctText: string): string {
  return `sq_${crypto.createHash("sha256").update(JSON.stringify([standardId, clauseNo, normaliseWords(stem), normaliseWords(correctText)])).digest("hex").slice(0, 16)}`;
}
