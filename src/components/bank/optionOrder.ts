/**
 * Option display order and labels. SSC shuffles option order per candidate, so while a learner
 * answers a text-led question we do the same — deterministically, seeded by attemptId+questionId,
 * so a reload/autosave restore shows the same order, labelled A, B, C… by display position. The
 * scored answer is always the option id, never the display index.
 *
 * Printed order is kept instead:
 * - once the learner has committed (checked or submitted): sources, AI notes and dispute choices
 *   all name options, so every view then uses printed order and the one label per option given by
 *   optionLabel() — a shuffled "B" next to a source's "B" would name two different options;
 * - for image-led questions (a figure, text that is OCR/garbled/incomplete, or options only in
 *   the image): the learner reads the options off the printed image, so buttons follow its order
 *   and its numbers 1–4 (number keys included);
 * - when an option's own text refers to other options by position ("both A and B", "all of the
 *   above", "only 1 and 2" ...).
 */
import type { BankOption, BankTextQuality } from "@/lib/bank/api-types";

/** What layout decisions need to know about a question. */
export interface OptionLayout {
  options: BankOption[];
  hasFigure: boolean;
  textQuality: BankTextQuality;
}

const TEXT_LED: ReadonlySet<BankTextQuality> = new Set(["text_layer", "bilingual_en"]);

export const DISPLAY_LETTERS = ["A", "B", "C", "D", "E", "F"];

const REFERENCE_PATTERNS: RegExp[] = [
  /\ball of (the )?above\b/i,
  /\bnone of (the )?above\b/i,
  /\ball of these\b/i,
  /\bnone of these\b/i,
  /\bboth\b/i,
  /\ball the above\b/i,
  /\bonly\s+[a-d]\b/i,
  /\bonly\s+[1-4]\b/i,
  /\b[a-d]\s*(and|&)\s*[a-d]\b/i,
  /\b[1-4]\s*(and|&)\s*[1-4]\b/i,
  /\b(option|options)\s*[a-d1-4]\b/i,
];

export function optionsReferToOtherOptions(options: BankOption[]): boolean {
  return options.some((opt) => REFERENCE_PATTERNS.some((re) => re.test(opt.text)));
}

/** Small deterministic PRNG (mulberry32, seeded via a djb2-ish string hash) — stable across
 *  reloads/devices for the same seed, no external dependency needed. */
function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * True when some option has no text, so it can only be identified by its printed number in the
 * question image. Such options are never shuffled and are labelled 1–4 like the image: a shuffled
 * "A" pointing at printed option 3 would silently score the learner against the wrong option.
 */
export function optionsNeedImage(options: BankOption[]): boolean {
  return options.some((opt) => !opt.text.trim());
}

/** Shown image-first: the learner reads the question (and options) off the printed image. */
export function imageLed(q: OptionLayout): boolean {
  return q.hasFigure || !TEXT_LED.has(q.textQuality) || optionsNeedImage(q.options);
}

/** The typed text came from the PDF's text layer, so it can stand beside the image. OCR, garbled
 *  and incomplete text would only repeat the image with errors. */
export function textReliable(q: OptionLayout): boolean {
  return TEXT_LED.has(q.textQuality);
}

/** Option text to print next to its label, or "" when the learner reads it off the image. */
export function shownOptionText(q: OptionLayout, text: string): string {
  return textReliable(q) ? text.trim() : "";
}

function label(q: OptionLayout, index: number): string {
  return imageLed(q) ? String(index + 1) : (DISPLAY_LETTERS[index] ?? String(index + 1));
}

/** Label at display position `pos` of displayOrder(): printed numbers for image-led questions, else letters. */
export function displayLabel(q: OptionLayout, pos: number): string {
  return label(q, pos);
}

/**
 * The one label of an option in printed order — what every committed view (review, check result,
 * sources, AI notes, dispute choices) calls it. Equals displayLabel() once displayOrder() is in
 * printed order, which it always is after commitment.
 */
export function optionLabel(q: OptionLayout, optionId: string): string {
  const index = q.options.findIndex((o) => o.id === optionId);
  return index < 0 ? optionId : label(q, index);
}

export function displayOrder(q: OptionLayout, attemptId: string, questionId: string, committed: boolean): BankOption[] {
  const options = q.options;
  if (committed || imageLed(q) || options.length <= 1 || optionsReferToOtherOptions(options)) return options;
  const rand = seededRandom(`${attemptId}:${questionId}`);
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** "B (M20)": an option named by its committed label plus the start of its text. */
export function optionRef(q: OptionLayout, optionId: string): string {
  const text = shownOptionText(q, q.options.find((o) => o.id === optionId)?.text ?? "");
  const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return short ? `${optionLabel(q, optionId)} (${short})` : optionLabel(q, optionId);
}
