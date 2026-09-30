/**
 * Deterministic gates for AI output in the question-bank explainer (DECISION-002). Pure
 * functions: they never call a model and never read the database, so they are cheap to test.
 *
 * A gate either returns the cleaned value or a reason. Reasons never contain the key itself:
 * they end up in job reports that any signed-in learner can read before attempting a paper.
 */
import type { BankExplanationOption } from "../../bank/api-types";
import { SSC_JE_CIVIL_SYLLABUS_TOPICS } from "../../ssc-je-civil-syllabus";

export type GateResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Hard caps. Over-long output is rejected rather than cut, so a formula is never truncated mid-way. */
export const NOTE_LIMITS = {
  concept: 1500,
  steps: 10,
  step: 800,
  whyCorrect: 1500,
  optionWhy: 700,
  traps: 6,
  trap: 600,
  examTip: 600,
  verificationLimits: 8,
  verificationLimit: 600,
} as const;

export const BLIND_REASONING_MAX = 1200;

/** The teaching fields of BankExplanation (everything except model and createdAt). */
export interface TeachingNoteFields {
  lockedAnswer: string;
  topic: string;
  concept: string;
  steps: string[];
  whyCorrect: string;
  options: BankExplanationOption[];
  traps: string[];
  examTip: string;
  verificationLimits: string[];
}

export interface BlindSolveValue {
  answer: string;
  confidence: number;
  reasoning: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, required = true): GateResult<string> {
  if (typeof value !== "string") return { ok: false, reason: `${field} is missing or not text` };
  const trimmed = value.trim();
  if (required && !trimmed) return { ok: false, reason: `${field} is empty` };
  if (trimmed.length > max) return { ok: false, reason: `${field} is longer than ${max} characters` };
  return { ok: true, value: trimmed };
}

function textList(value: unknown, field: string, maxItems: number, maxLength: number, minItems = 0): GateResult<string[]> {
  if (!Array.isArray(value)) return { ok: false, reason: `${field} is not a list` };
  if (value.length < minItems) return { ok: false, reason: `${field} is empty` };
  if (value.length > maxItems) return { ok: false, reason: `${field} has more than ${maxItems} items` };
  const out: string[] = [];
  for (const [i, item] of value.entries()) {
    const t = text(item, `${field}[${i}]`, maxLength);
    if (!t.ok) return t;
    out.push(t.value);
  }
  return { ok: true, value: out };
}

/**
 * Per-option analysis: every option id exactly once and no others, "correct" for the key and
 * only the key, a bounded non-empty reason each. Output follows the question's option order.
 */
export function gateOptionVerdicts(raw: unknown, optionIds: string[], key: string): GateResult<BankExplanationOption[]> {
  if (!Array.isArray(raw)) return { ok: false, reason: "options is not a list" };
  const valid = new Set(optionIds);
  const seen = new Map<string, BankExplanationOption>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string") return { ok: false, reason: "options has an entry without an id" };
    const id = item.id.trim();
    if (!valid.has(id)) return { ok: false, reason: "options names an option the question does not have" };
    if (seen.has(id)) return { ok: false, reason: "options lists an option twice" };
    if (item.verdict !== "correct" && item.verdict !== "wrong") return { ok: false, reason: "options has a verdict other than correct/wrong" };
    if (item.verdict === "correct" && id !== key) return { ok: false, reason: "options marks a non-key option correct" };
    if (item.verdict === "wrong" && id === key) return { ok: false, reason: "options marks the key wrong" };
    const why = text(item.why, "options[].why", NOTE_LIMITS.optionWhy);
    if (!why.ok) return why;
    seen.set(id, { id, verdict: item.verdict, why: why.value });
  }
  if (seen.size !== valid.size) return { ok: false, reason: "options does not cover every option" };
  return { ok: true, value: optionIds.map((id) => seen.get(id)!) };
}

export function isSyllabusTopic(topic: string): boolean {
  return (SSC_JE_CIVIL_SYLLABUS_TOPICS as readonly string[]).includes(topic);
}

/** The full teaching-note gate. Reject (do not store) on any failure. */
export function gateTeachingNote(raw: unknown, key: string, optionIds: string[]): GateResult<TeachingNoteFields> {
  if (!isRecord(raw)) return { ok: false, reason: "the reply is not a JSON object" };
  if (typeof raw.lockedAnswer !== "string" || raw.lockedAnswer.trim() !== key) {
    return { ok: false, reason: "lockedAnswer does not match the key" };
  }
  const topic = text(raw.topic, "topic", 120);
  if (!topic.ok) return topic;
  if (!isSyllabusTopic(topic.value)) return { ok: false, reason: "topic is not an SSC JE Civil syllabus topic" };
  const concept = text(raw.concept, "concept", NOTE_LIMITS.concept);
  if (!concept.ok) return concept;
  const steps = textList(raw.steps, "steps", NOTE_LIMITS.steps, NOTE_LIMITS.step, 1);
  if (!steps.ok) return steps;
  const whyCorrect = text(raw.whyCorrect, "whyCorrect", NOTE_LIMITS.whyCorrect);
  if (!whyCorrect.ok) return whyCorrect;
  const options = gateOptionVerdicts(raw.options, optionIds, key);
  if (!options.ok) return options;
  const traps = textList(raw.traps ?? [], "traps", NOTE_LIMITS.traps, NOTE_LIMITS.trap);
  if (!traps.ok) return traps;
  const examTip = text(raw.examTip, "examTip", NOTE_LIMITS.examTip);
  if (!examTip.ok) return examTip;
  const limits = textList(raw.verificationLimits ?? [], "verificationLimits", NOTE_LIMITS.verificationLimits, NOTE_LIMITS.verificationLimit);
  if (!limits.ok) return limits;
  return {
    ok: true,
    value: {
      lockedAnswer: key,
      topic: topic.value,
      concept: concept.value,
      steps: steps.value,
      whyCorrect: whyCorrect.value,
      options: options.value,
      traps: traps.value,
      examTip: examTip.value,
      verificationLimits: limits.value,
    },
  };
}

/** {answer: option id | null, confidence 0–1, reasoning}. A null or unknown answer is not evidence. */
export function parseBlindSolve(raw: unknown, optionIds: string[]): GateResult<BlindSolveValue> {
  if (!isRecord(raw)) return { ok: false, reason: "the reply is not a JSON object" };
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim().slice(0, BLIND_REASONING_MAX) : "";
  if (raw.answer === null || raw.answer === undefined || raw.answer === "") {
    // Its reasoning is not echoed: reasons are shown in job reports before learners attempt the paper.
    return { ok: false, reason: "the solver gave no answer (question judged incomplete, ambiguous or without a correct option)" };
  }
  if (typeof raw.answer !== "string") return { ok: false, reason: "answer is not an option id" };
  const trimmed = raw.answer.trim();
  const answer = optionIds.find((id) => id === trimmed) ?? optionIds.find((id) => id.toUpperCase() === trimmed.toUpperCase());
  if (!answer) return { ok: false, reason: "answer is not one of the question's option ids" };
  const confidence = raw.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, reason: "confidence is not a number from 0 to 1" };
  }
  if (!reasoning) return { ok: false, reason: "reasoning is empty" };
  return { ok: true, value: { answer, confidence, reasoning } };
}
