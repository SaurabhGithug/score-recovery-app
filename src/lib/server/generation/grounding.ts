/**
 * Deterministic proof check for generated questions: the model must quote the sentence(s)
 * from the student's material that prove the answer, and this module confirms the quote really
 * is in the material. No model is involved — this is what stops an invented "fact" from
 * becoming an answer key.
 *
 * What the student is shown as proof is always the matching text copied from the page
 * (`excerpt`), never the model's quote, so a slightly-off quote can't pose as verbatim.
 */

export interface GroundingResult {
  grounded: boolean;
  /** Page the proof starts on (may differ from the page the model cited). */
  page: number | null;
  method: "exact" | "fuzzy" | "none";
  /** Share of quote words found in the best-matching stretch of the material, 0..1. */
  score: number;
  /** The matching text as it appears in the material; null when not grounded. */
  excerpt: string | null;
  reason: string | null;
}

export const MIN_QUOTE_WORDS = 6;
export const FUZZY_THRESHOLD = 0.9;

/** NFKC, drop soft hyphens, re-join words hyphenated across a line break. Keeps case and spacing. */
function prepare(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/­/g, "")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2");
}

const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;

/** Lower-cased words of letters, marks and digits; punctuation and spacing are ignored. */
export function normalizeForMatch(text: string): string {
  return (prepare(text).match(TOKEN) ?? []).map((t) => t.toLowerCase()).join(" ");
}

interface Token {
  word: string;
  page: number;
  /** Index into `pages` of the source page, and character span in its prepared text. */
  pageIndex: number;
  start: number;
  end: number;
}

function tokenizePages(pages: { pageNumber: number; text: string }[]): { tokens: Token[]; prepared: string[] } {
  const tokens: Token[] = [];
  const prepared = pages.map((p) => prepare(p.text));
  prepared.forEach((text, pageIndex) => {
    for (const m of text.matchAll(TOKEN)) {
      tokens.push({
        word: m[0].toLowerCase(),
        page: pages[pageIndex].pageNumber,
        pageIndex,
        start: m.index!,
        end: m.index! + m[0].length,
      });
    }
  });
  return { tokens, prepared };
}

/** Original text covered by tokens [from, to], stitched across a page break if needed. */
function excerptOf(tokens: Token[], prepared: string[], from: number, to: number): string {
  const parts: string[] = [];
  let i = from;
  while (i <= to) {
    const pageIndex = tokens[i].pageIndex;
    let j = i;
    while (j + 1 <= to && tokens[j + 1].pageIndex === pageIndex) j++;
    parts.push(prepared[pageIndex].slice(tokens[i].start, tokens[j].end));
    i = j + 1;
  }
  return parts.join(" … ").replace(/\s+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Spelled-out numbers and ordinals: "fifty" vs "fifth" is a different fact, not a typo. */
const NUMBER_WORD =
  /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lakhs|crore|crores|million|millions|billion|billions|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|hundredth|thousandth|once|twice|thrice|half|halves|quarter|quarters|double|triple|single|dozen|dozens|\w+teenth|\w+tieth)$/;

function isFactWord(word: string): boolean {
  return /\p{N}/u.test(word) || NUMBER_WORD.test(word);
}

/**
 * Compares the quote and a same-length window word by word, in order. Allowed differences are
 * OCR/copying slips only: at most 10% of positions, each a near-spelling of the word in the same
 * place. Never allowed: any change to a number (digits or spelled out), any change to a word of
 * 3 letters or fewer (units like "g"/"kg", "not"/"nor"), swapped or inserted/deleted words (those
 * shift positions). Residual, by design: a near-spelling of a longer proper noun ("Nehru"/"Nehra")
 * can pass — the blind check and the page-text excerpt shown to the student cover it.
 */
function positionalMismatch(quoteWords: string[], windowWords: string[]): string | null {
  const allowed = Math.floor(quoteWords.length * 0.1);
  let mismatches = 0;
  for (let k = 0; k < quoteWords.length; k++) {
    const q = quoteWords[k];
    const w = windowWords[k];
    if (q === w) continue;
    if (++mismatches > allowed) return "the quote's words differ from the material or are in a different order";
    if (isFactWord(q) || isFactWord(w)) return `number "${q}" in the quote is not in the material`;
    if (q.length <= 3 || w.length <= 3) return `word "${q}" in the quote is not in the material`;
    if (editDistance(q, w) > (q.length >= 8 ? 2 : 1)) return `word "${q}" in the quote is not in the material`;
  }
  return null;
}

export function checkGrounding(
  quote: string,
  citedPage: number,
  pages: { pageNumber: number; text: string }[]
): GroundingResult {
  const quoteWords = normalizeForMatch(quote).split(" ").filter(Boolean);
  const none = (score: number, reason: string): GroundingResult => ({
    grounded: false,
    page: null,
    method: "none",
    score,
    excerpt: null,
    reason,
  });

  if (quoteWords.length < MIN_QUOTE_WORDS) {
    return none(0, `Proof quote is too short (${quoteWords.length} words, need ${MIN_QUOTE_WORDS})`);
  }

  // One token stream over the whole section, so a quote can run across a page break.
  const { tokens, prepared } = tokenizePages(pages);
  const n = quoteWords.length;
  if (tokens.length < n) return none(0, "Proof quote is longer than the material");

  // Exact: the quote's words appear consecutively. Prefer an occurrence on the cited page.
  let exactAt = -1;
  for (let i = 0; i + n <= tokens.length; i++) {
    let k = 0;
    while (k < n && tokens[i + k].word === quoteWords[k]) k++;
    if (k === n) {
      if (exactAt === -1 || tokens[i].page === citedPage) exactAt = i;
      if (tokens[i].page === citedPage) break;
    }
  }
  if (exactAt >= 0) {
    return {
      grounded: true,
      page: tokens[exactAt].page,
      method: "exact",
      score: 1,
      excerpt: excerptOf(tokens, prepared, exactAt, exactAt + n - 1),
      reason: null,
    };
  }

  // Fuzzy: a sliding multiset count (O(words)) finds windows sharing ≥90% of the quote's words;
  // each such window is then compared position by position. Prefer one on the cited page.
  const need = new Map<string, number>();
  for (const w of quoteWords) need.set(w, (need.get(w) ?? 0) + 1);
  const have = new Map<string, number>();
  let matched = 0;
  let bestScore = 0;
  const candidates: { start: number; score: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const add = tokens[i].word;
    const addHave = have.get(add) ?? 0;
    if (addHave < (need.get(add) ?? 0)) matched++;
    have.set(add, addHave + 1);
    if (i >= n) {
      const drop = tokens[i - n].word;
      const dropHave = have.get(drop)!;
      if (dropHave <= (need.get(drop) ?? 0)) matched--;
      have.set(drop, dropHave - 1);
    }
    if (i >= n - 1) {
      const score = matched / n;
      bestScore = Math.max(bestScore, score);
      if (score >= FUZZY_THRESHOLD) candidates.push({ start: i - n + 1, score });
    }
  }

  if (candidates.length === 0) {
    return none(bestScore, `Proof quote not found in the material (best match ${Math.round(bestScore * 100)}%)`);
  }
  candidates.sort(
    (a, b) => Number(tokens[b.start].page === citedPage) - Number(tokens[a.start].page === citedPage) || b.score - a.score
  );
  let best: { start: number; score: number } | null = null;
  let firstProblem = "";
  for (const c of candidates) {
    const problem = positionalMismatch(quoteWords, tokens.slice(c.start, c.start + n).map((t) => t.word));
    if (!problem) {
      best = c;
      break;
    }
    firstProblem ||= problem;
  }
  if (!best) return none(bestScore, `Proof quote differs from the material: ${firstProblem}`);

  return {
    grounded: true,
    page: tokens[best.start].page,
    method: "fuzzy",
    score: best.score,
    excerpt: excerptOf(tokens, prepared, best.start, best.start + n - 1),
    reason: null,
  };
}
