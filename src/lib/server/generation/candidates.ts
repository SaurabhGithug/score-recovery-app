import { normalizeForMatch } from "./grounding";

/**
 * Turns the model's raw JSON into typed question candidates and rejects anything malformed or
 * off-style. Style problems are rejected rather than sent to review: a fresh question is cheap,
 * the student's review time is not.
 */

export type OptionId = "A" | "B" | "C" | "D";
const OPTION_IDS: OptionId[] = ["A", "B", "C", "D"];

export interface QuestionCandidate {
  stem: string;
  options: { id: OptionId; text: string }[];
  answer: OptionId;
  explanation: string;
  sourceQuote: string;
  sourcePage: number;
  subject: string | null;
  topic: string | null;
  difficulty: 1 | 2 | 3;
  level: string | null;
}

export interface CandidateRejection {
  stem: string;
  reason: string;
}

const BANNED_OPTION = /\b(all|none|both|neither)\s+(of\s+(the\s+)?(above|these)|[a-d]\s+and\s+[a-d])\b/i;
const DOCUMENT_REFERENCE =
  /\b(according to|as per|as (stated|mentioned|described|given) in|mentioned in)\s+the\s+(passage|text|material|document|author|chapter|extract)\b/i;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shortText(value: unknown, max: number): string | null {
  const s = str(value);
  return s ? s.slice(0, max) : null;
}

function validate(raw: Record<string, unknown>): QuestionCandidate | string {
  const stem = str(raw.stem);
  if (stem.length < 15) return "Question stem missing or too short";
  if (DOCUMENT_REFERENCE.test(stem)) return "Stem refers to the document instead of the concept";

  const rawOptions = raw.options;
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) return "Options missing";
  const optionMap = rawOptions as Record<string, unknown>;
  const keys = Object.keys(optionMap).map((k) => k.trim().toUpperCase());
  if (keys.length !== 4 || !OPTION_IDS.every((id) => keys.includes(id))) return "Needs exactly four options A-D";

  const options = OPTION_IDS.map((id) => {
    const key = Object.keys(optionMap).find((k) => k.trim().toUpperCase() === id)!;
    return { id, text: str(optionMap[key]) };
  });
  if (options.some((o) => !o.text)) return "An option is empty";
  if (new Set(options.map((o) => normalizeForMatch(o.text))).size !== 4) return "Two options are the same";
  if (options.some((o) => BANNED_OPTION.test(o.text))) return "Uses an all/none-of-the-above style option";

  const answer = str(raw.answer).toUpperCase() as OptionId;
  if (!OPTION_IDS.includes(answer)) return "Answer is not one of A-D";

  const sourceQuote = str(raw.sourceQuote);
  if (!sourceQuote) return "No proof quote given";
  const sourcePage = Number(raw.sourcePage);
  if (!Number.isInteger(sourcePage) || sourcePage <= 0) return "No valid source page given";

  const explanation = str(raw.explanation);
  if (!explanation) return "No explanation given";

  const difficulty = Number(raw.difficulty);
  return {
    stem,
    options,
    answer,
    explanation,
    sourceQuote,
    sourcePage,
    subject: shortText(raw.subject, 120),
    topic: shortText(raw.topic, 120),
    difficulty: difficulty === 1 || difficulty === 3 ? difficulty : 2,
    level: shortText(raw.level, 40),
  };
}

export function parseCandidates(json: unknown): {
  candidates: QuestionCandidate[];
  rejections: CandidateRejection[];
} {
  const list = (json as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) {
    return { candidates: [], rejections: [{ stem: "", reason: "Model output had no questions list" }] };
  }

  const candidates: QuestionCandidate[] = [];
  const rejections: CandidateRejection[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") {
      rejections.push({ stem: "", reason: "Malformed question entry" });
      continue;
    }
    const result = validate(item as Record<string, unknown>);
    if (typeof result === "string") {
      rejections.push({ stem: str((item as Record<string, unknown>).stem).slice(0, 160), reason: result });
    } else {
      candidates.push(result);
    }
  }
  return { candidates, rejections };
}

export interface CheckVerdict {
  answer: OptionId | "NONE";
  reason: string;
}

/** Reads the blind checker's output into a map keyed by question id. Missing ids are simply absent. */
export function parseVerdicts(json: unknown): Map<string, CheckVerdict> {
  const verdicts = new Map<string, CheckVerdict>();
  const list = (json as { results?: unknown })?.results;
  if (!Array.isArray(list)) return verdicts;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = str(r.id);
    const answer = str(r.answer).toUpperCase();
    if (!id) continue;
    verdicts.set(id, {
      answer: (OPTION_IDS as string[]).includes(answer) ? (answer as OptionId) : "NONE",
      reason: str(r.reason).slice(0, 300),
    });
  }
  return verdicts;
}
