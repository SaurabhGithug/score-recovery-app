/**
 * "Most asked subjects": the Paper-I Civil subjects ranked by how many questions each got per paper
 * in the last few exam years the bank holds. Pure counting over what the bank stores — no
 * prediction, no weighting, no guessed data. The confidence label says how much a subject's
 * count moved between those years, by the rule in HOT_RULE (shown on the page as written here).
 */

/** How many of the latest exam years to count, and the confidence thresholds (in questions per paper). */
export const HOT_RULE = {
  windowYears: 3,
  /** Every year's average within this many questions of every other year's → high. */
  highMaxSpread: 2,
  /** … within this many → medium; more → low. */
  mediumMaxSpread: 4,
  /** A year with fewer papers than this can't show a stable average → low. */
  minPapersPerYear: 2,
} as const;

export type HotConfidence = "high" | "medium" | "low";

export interface HotPaperInput {
  id: string;
  /** The bank's cycle_year (the exam's notice year). */
  year: number;
  examDate: string | null;
  shift: string | null;
  /** Questions in the paper's printed Civil section. */
  civilQuestions: number;
}

/** One primary subject tag on one Civil question. */
export interface HotTagInput {
  paperId: string;
  subjectId: string;
  reviewStatus: string;
}

export interface HotSubjectInput {
  id: string;
  name: string;
  position: number;
}

export interface HotSubjectRow {
  id: string;
  name: string;
  rank: number;
  /** Questions tagged with this subject ÷ papers counted. */
  perPaper: number;
  perYear: { year: number; perPaper: number }[];
  minInOnePaper: number;
  maxInOnePaper: number;
  /** Highest year average minus lowest year average. */
  spread: number;
  confidence: HotConfidence;
  reason: string;
}

export interface HotSubjectsResult {
  years: { year: number; label: string; papers: number }[];
  papers: { id: string; year: number; examDate: string | null; shift: string | null }[];
  subjects: HotSubjectRow[];
  totals: { papers: number; civilQuestions: number; counted: number; notCounted: number };
  tagReview: { status: string; count: number }[];
  rule: typeof HOT_RULE;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-11-14" → "Nov 2022"; no usable date → "2022 cycle". */
export function yearLabel(year: number, examDates: (string | null)[]): string {
  const first = examDates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0];
  if (!first) return `${year} cycle`;
  return `${MONTHS[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}`;
}

export function confidenceFor(yearAverages: number[], papersPerYear: number[], rule: typeof HOT_RULE = HOT_RULE): { confidence: HotConfidence; spread: number; reason: string } {
  const fmt = (n: number) => n.toFixed(1);
  // Work on the averages as shown (1 decimal), so the gap and the label always match the numbers on screen.
  const shown = yearAverages.map((v) => Number(fmt(v)));
  const lo = shown.length ? Math.min(...shown) : 0;
  const hi = shown.length ? Math.max(...shown) : 0;
  const spread = Number(fmt(hi - lo));
  if (yearAverages.length < rule.windowYears || papersPerYear.some((n) => n < rule.minPapersPerYear)) {
    return { confidence: "low", spread, reason: `Too few papers: ${papersPerYear.join(" + ")} across ${yearAverages.length} year(s).` };
  }
  const reason = `Year averages ran from ${fmt(lo)} to ${fmt(hi)}, a gap of ${fmt(spread)}.`;
  if (spread <= rule.highMaxSpread) return { confidence: "high", spread, reason };
  if (spread <= rule.mediumMaxSpread) return { confidence: "medium", spread, reason };
  return { confidence: "low", spread, reason };
}

export function computeHotSubjects(
  subjects: HotSubjectInput[],
  allPapers: HotPaperInput[],
  tags: HotTagInput[],
  rule: typeof HOT_RULE = HOT_RULE
): HotSubjectsResult {
  const windowYears = [...new Set(allPapers.map((p) => p.year))].sort((a, b) => b - a).slice(0, rule.windowYears).sort((a, b) => a - b);
  const papers = allPapers.filter((p) => windowYears.includes(p.year)).sort((a, b) => a.year - b.year || (a.examDate ?? "").localeCompare(b.examDate ?? "") || (a.shift ?? "").localeCompare(b.shift ?? "") || a.id.localeCompare(b.id));
  const paperIds = new Set(papers.map((p) => p.id));
  const subjectIds = new Set(subjects.map((s) => s.id));
  const windowTags = tags.filter((t) => paperIds.has(t.paperId) && subjectIds.has(t.subjectId));

  const perPaperCount = new Map<string, number>(); // `${subject}|${paper}` → n
  for (const t of windowTags) perPaperCount.set(`${t.subjectId}|${t.paperId}`, (perPaperCount.get(`${t.subjectId}|${t.paperId}`) ?? 0) + 1);
  const papersOfYear = new Map(windowYears.map((y) => [y, papers.filter((p) => p.year === y)]));

  const rows = subjects.map((s) => {
    const counts = papers.map((p) => perPaperCount.get(`${s.id}|${p.id}`) ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const perYear = windowYears.map((y) => {
      const ps = papersOfYear.get(y)!;
      const n = ps.reduce((a, p) => a + (perPaperCount.get(`${s.id}|${p.id}`) ?? 0), 0);
      return { year: y, perPaper: ps.length ? n / ps.length : 0 };
    });
    const c = confidenceFor(perYear.map((y) => y.perPaper), windowYears.map((y) => papersOfYear.get(y)!.length), rule);
    return {
      id: s.id,
      name: s.name,
      rank: 0,
      perPaper: papers.length ? total / papers.length : 0,
      perYear,
      minInOnePaper: counts.length ? Math.min(...counts) : 0,
      maxInOnePaper: counts.length ? Math.max(...counts) : 0,
      spread: c.spread,
      confidence: c.confidence,
      reason: c.reason,
    };
  });
  const position = new Map(subjects.map((s) => [s.id, s.position]));
  rows.sort((a, b) => b.perPaper - a.perPaper || position.get(a.id)! - position.get(b.id)!);
  const ranked: HotSubjectRow[] = rows.map((r, i) => ({ ...r, rank: i + 1 }));

  const civilQuestions = papers.reduce((a, p) => a + p.civilQuestions, 0);
  const review = new Map<string, number>();
  for (const t of windowTags) review.set(t.reviewStatus, (review.get(t.reviewStatus) ?? 0) + 1);
  return {
    years: windowYears.map((y) => ({ year: y, label: yearLabel(y, papersOfYear.get(y)!.map((p) => p.examDate)), papers: papersOfYear.get(y)!.length })),
    papers: papers.map(({ id, year, examDate, shift }) => ({ id, year, examDate, shift })),
    subjects: ranked,
    totals: { papers: papers.length, civilQuestions, counted: windowTags.length, notCounted: Math.max(0, civilQuestions - windowTags.length) },
    tagReview: [...review.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count })),
    rule,
  };
}
