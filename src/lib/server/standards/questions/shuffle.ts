/**
 * Option order after verification. Models put the key in favourite positions, so every question's
 * options are re-ordered: deterministically (seeded by a hash of unit + stem), and with the key's
 * letter chosen to keep the letters balanced across the whole bank (running counts), not purely at
 * random. A small slack keeps the sequence from being predictable (max - min stays <= slack + 1).
 */
import crypto from "node:crypto";
import { OPTION_IDS, type OptionId, type QuizOption } from "../../../standards/quiz-types";
import { normaliseWords } from "./text";

export type LetterCounts = Record<OptionId, number>;

export function emptyCounts(): LetterCounts {
  return { A: 0, B: 0, C: 0, D: 0 };
}

export function countLetters(answers: OptionId[], into: LetterCounts = emptyCounts()): LetterCounts {
  for (const a of answers) into[a]++;
  return into;
}

/** mulberry32 seeded from a SHA-256 of the unit and the stem. */
function rng(clauseNo: string, stem: string): () => number {
  let s = crypto.createHash("sha256").update(`${clauseNo}\n${normaliseWords(stem)}`).digest().readUInt32BE(0);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Shufflable {
  stem: string;
  options: QuizOption[];
  answer: OptionId;
  optionNotes: Partial<Record<OptionId, string>>;
}

export const SHUFFLE_SLACK = 2;

/**
 * Returns the question with its options re-lettered, the answer and notes following their option
 * text, and adds the new answer letter to `counts` (when `count` is true). Throws if the key would
 * no longer point at the same text: that would be a fabricated key.
 */
export function shuffleQuestion<T extends Shufflable>(q: T, clauseNo: string, counts: LetterCounts, count = true): T {
  const random = rng(clauseNo, q.stem);
  const min = Math.min(...OPTION_IDS.map((l) => counts[l]));
  const weights = OPTION_IDS.map((l) => Math.max(0, min + SHUFFLE_SLACK + 1 - counts[l]));
  let pick = random() * weights.reduce((a, b) => a + b, 0);
  let target: OptionId = OPTION_IDS[0];
  for (let i = 0; i < OPTION_IDS.length; i++) {
    if (pick < weights[i]) {
      target = OPTION_IDS[i];
      break;
    }
    pick -= weights[i];
  }

  const correct = q.options.find((o) => o.id === q.answer);
  if (!correct) throw new Error(`shuffle: answer ${q.answer} is not an option`);
  const wrong = q.options.filter((o) => o.id !== q.answer);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  const order: QuizOption[] = [];
  let w = 0;
  for (const id of OPTION_IDS) order.push(id === target ? correct : wrong[w++]);

  const options = order.map((o, i) => ({ id: OPTION_IDS[i], text: o.text }));
  const optionNotes: Partial<Record<OptionId, string>> = {};
  order.forEach((o, i) => {
    const note = q.optionNotes[o.id];
    if (note !== undefined && o.id !== q.answer) optionNotes[OPTION_IDS[i]] = note;
  });
  const shuffled = { ...q, options, answer: target, optionNotes };
  assertSameQuestion(q, shuffled);
  if (count) counts[target]++;
  return shuffled;
}

/** The key, every option text and every note must survive a re-lettering unchanged. */
export function assertSameQuestion(before: Shufflable, after: Shufflable): void {
  const textOf = (q: Shufflable, id: OptionId) => q.options.find((o) => o.id === id)?.text;
  if (textOf(before, before.answer) === undefined || textOf(before, before.answer) !== textOf(after, after.answer)) {
    throw new Error("shuffle: the answer key no longer points at the same option text");
  }
  const sorted = (q: Shufflable) => q.options.map((o) => o.text).sort().join("\u0000");
  if (sorted(before) !== sorted(after) || after.options.length !== 4) throw new Error("shuffle: option texts changed");
  for (const o of before.options) {
    if (o.id === before.answer) continue;
    const moved = after.options.find((a) => a.text === o.text)!;
    if (after.optionNotes[moved.id] !== before.optionNotes[o.id]) throw new Error("shuffle: an option note did not follow its option");
  }
  if (after.optionNotes[after.answer] !== undefined) throw new Error("shuffle: the correct option has a 'why wrong' note");
}
