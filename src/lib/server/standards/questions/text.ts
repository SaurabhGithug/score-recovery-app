/**
 * Deterministic text checks for standard questions. No model is involved here: this is what stops
 * an invented or altered "quote" from becoming the proof of an answer key.
 *
 * Quote rule (truth path): a proof quote must be in the clause body word for word. The ONLY
 * normalisations are: whitespace collapsed, curly quotes made straight, dash/hyphen variants made
 * "-", and case ignored. No fuzzy matching: one changed word or digit ("shall" -> "should",
 * "15" -> "51") fails. What is stored and shown is the body's own text, never the model's copy.
 */

const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[‐‑‒–—―−﹘﹣－]/g;

/** One character of the body, normalised, mapped back to its position in the original string. */
function normaliseWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (/\s/.test(ch)) {
      if (norm.length && pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      norm += " ";
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    ch = ch.replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(DASHES, "-").toLowerCase();
    // toLowerCase never changes the length of the characters this text uses (Latin script);
    // guard anyway so the index map stays one-to-one.
    for (const c of ch) {
      norm += c;
      map.push(i);
    }
  }
  return { norm, map };
}

/** The quote normalisation, for comparing and de-duplicating quotes. */
export function normaliseQuote(text: string): string {
  return normaliseWithMap(text).norm;
}

/** Collapses whitespace for display, keeping the original characters. */
export function collapseSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  return collapseSpace(text).split(" ").filter(Boolean).length;
}

export interface QuoteMatch {
  /** Offset of the match in the original body. */
  start: number;
  end: number;
  /** The body's own text for the match, whitespace collapsed. */
  text: string;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Every place the quote occurs verbatim (under the allowed normalisations) in the body. A match
 * must start and end on word boundaries: "5 days" is not in "15 days", "15 day" is not "15 days".
 */
export function findVerbatim(body: string, quote: string): QuoteMatch[] {
  const q = normaliseQuote(quote);
  if (!q) return [];
  const { norm, map } = normaliseWithMap(body);
  const out: QuoteMatch[] = [];
  let from = 0;
  for (;;) {
    const at = norm.indexOf(q, from);
    if (at < 0) break;
    from = at + 1;
    const cutStart = at > 0 && WORD_CHAR.test(norm[at - 1]) && WORD_CHAR.test(q[0]);
    const cutEnd = at + q.length < norm.length && WORD_CHAR.test(norm[at + q.length]) && WORD_CHAR.test(q[q.length - 1]);
    if (cutStart || cutEnd) continue;
    const start = map[at];
    const end = map[at + q.length - 1] + 1;
    out.push({ start, end, text: collapseSpace(body.slice(start, end)) });
  }
  return out;
}

/**
 * Loose normalisation for "is this the same text" checks (duplicate stems, distinct options,
 * answer-in-stem): lower-case words of letters and digits, punctuation ignored.
 */
export function normaliseWords(text: string): string {
  return (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

/** True when `needle`'s words occur as a whole-word run inside `haystack`. */
export function containsWords(haystack: string, needle: string): boolean {
  const n = normaliseWords(needle);
  if (!n) return false;
  return ` ${normaliseWords(haystack)} `.includes(` ${n} `);
}

// ---------------------------------------------------------------- numbered paragraphs

const PARAGRAPH_NO = /^[ \t]*((?:\d+|[A-Z])(?:\.\d+)+)[ \t]/gm;

export interface NumberedParagraph {
  no: string;
  start: number;
}

/**
 * Numbered requirement paragraphs inside a unit's body (a line that starts with e.g. "6.4.7 " or
 * "A.2.1 "), limited to numbers below the unit itself so a stray number is never taken for one.
 */
export function numberedParagraphs(unitNo: string, body: string): NumberedParagraph[] {
  const out: NumberedParagraph[] = [];
  for (const m of body.matchAll(PARAGRAPH_NO)) {
    const no = m[1];
    if (no.startsWith(`${unitNo}.`)) out.push({ no, start: m.index! + m[0].indexOf(no) });
  }
  return out;
}

/** The numbered paragraph a body offset falls in, or the unit itself when it precedes them all. */
export function paragraphAt(unitNo: string, body: string, offset: number): string {
  let found = unitNo;
  for (const p of numberedParagraphs(unitNo, body)) {
    if (p.start <= offset) found = p.no;
    else break;
  }
  return found;
}

// ---------------------------------------------------------------- clause references in AI text

/** Clause-like numbers ("6.4.7", "7.8", "A.2.1") mentioned in a text. */
export function clauseReferences(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])((?:[1-8]|[AB])(?:\.\d+)+)(?![\w]|\.\d)/g)) out.push(m[1]);
  return out;
}

/** Does the text cite a requirement by number ("6.4.7", "clause 5", "Annex A")? */
export function citesClause(text: string): boolean {
  return clauseReferences(text).length > 0 || /\b(?:[Cc]lause|[Ss]ection)\s+[1-8]\b/.test(text) || /\bAnnex\s+[AB]\b/.test(text);
}

// ---------------------------------------------------------------- letter references

// Names in the standard that look like option letters and are allowed: "Annex A", "Type B"
// (uncertainty), and the management system options of clause 8, written as the prompt asks.
// The letters themselves are matched case-sensitively everywhere: "the key is a record" is not a
// letter reference, "the key is A" is.
const ALLOWED_LETTER_NAMES = [
  /\bAnnex(?:es)?\s+[A-D]\b(?:\s*(?:,|and|or)\s*[A-D]\b)*/g,
  /\bType\s+[AB]\b(?:\s*(?:,|and|or)\s*[AB]\b)*/g,
  /\b[Mm]anagement[- ]system\s+Options?\s+[AB]\b(?:\s*(?:,|and|or)\s*[AB]\b)*/g,
  /\bOptions?\s+[AB]\s*\(8\.1(?:\.[23])?\)/g,
  /\bOptions?\s+A\s+(?:and|or)\s+B\s*\(8\.1(?:\.[123])?\)/g,
];

const LETTER_REFERENCES = [
  /\b(?:[Oo]ptions?|[Cc]hoices?|[Aa]lternatives?|[Aa]nswers?)\s*\(?[A-D]\b(?!\.\d)/,
  /\(\s*[A-D]\s*\)/,
  /(?:^|[\s,;:(])[A-D]\)/,
  /\b[A-D]\s*(?:,|and|or|&|\/)\s*[A-D]\b(?!\.\d)/,
  /\b(?:[Aa]nswer|[Kk]ey)\s+(?:is|was|=)\s*\(?[A-D]\b(?!\.\d)/,
  /(?:^|[\s(])[A-D]\s+(?:is|was|would be)\s+(?:correct|incorrect|wrong|right|true|false)\b/,
];

function maskAllowed(text: string): string {
  return ALLOWED_LETTER_NAMES.reduce((t, re) => t.replace(re, " · "), text);
}

/**
 * True when an explanation or note refers to an option by its letter ("option B", "(C)",
 * "A and D"). Options are shuffled after generation, so a letter reference would point at the
 * wrong option.
 */
export function hasLetterReference(text: string): boolean {
  const masked = maskAllowed(text);
  return LETTER_REFERENCES.some((re) => re.test(masked));
}

/**
 * The narrower check for stems, which may legitimately say "a laboratory using Option B": only
 * explicit pointers to the answer choices count.
 */
export function stemHasLetterReference(text: string): boolean {
  const masked = maskAllowed(text);
  return (
    /\b(?:[Oo]ptions|[Cc]hoices|[Aa]lternatives)\s+[A-D]\b/.test(masked) ||
    /\b(?:[Oo]ption|[Cc]hoice)\s+[C-D]\b/.test(masked) ||
    /\(\s*[A-D]\s*\)/.test(masked) ||
    /\b(?:[Aa]nswer|[Kk]ey)\s+(?:is|was)\s+[A-D]\b/.test(masked)
  );
}
