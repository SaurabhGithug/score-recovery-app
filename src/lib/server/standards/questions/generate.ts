/**
 * Builds the MCQ bank for a standard, one unit at a time (sequential, each unit committed as it
 * finishes, so a run can stop and resume).
 *
 * Per unit: Gemini writes quota + a few extra questions from the unit's verbatim text and an
 * outline of the standard -> deterministic gates (gates.ts) -> a model from ANOTHER company
 * (DeepSeek, via followup.ts runCheck) answers each survivor blind, seeing only the unit text, the
 * outline, the stem and the options -> options are re-lettered to balance the key letters -> stored.
 *
 * Truth rules: "verified" needs agreement from an other-provider checker; agreement from a Google
 * model only (same vendor or same model) is stored as "needs_review" and never shown; a
 * disagreement, a NONE, or any checker failure drops the question (reported). Money: every model
 * call goes through callGemini / runCheck (reserve the worst case, settle the actual). A run also
 * has its own cap: before each call, this run's ledger spend plus that call's worst case must fit.
 */
import { getDatabase } from "../../db";
import { HttpError } from "../../bank/http";
import { SpendRepository } from "../../repositories/spend-repo";
import { callGemini, checkers, geminiWorstUsd, runCheck, type FollowUpDeps } from "../../followup/followup";
import type { GeminiRequest } from "../../followup/gemini";
import { costUsd, geminiRate } from "../../generation/pricing";
import { DEEPSEEK_MAX_ATTEMPTS } from "../../llm/deepseek";
import { StandardsRepository, type ClauseRow, type StandardRow } from "../repo";
import { QuizRepository, clauseFingerprint, type NewQuestion } from "../quiz-repo";
import { OPTION_IDS, type CheckIndependence, type OptionId, type QuestionExportFile, type StandardQuestion } from "../../../standards/quiz-types";
import { checkAgainstText, dedupe, draftFromModel, questionId, type DraftQuestion, type RejectReason, type Rejection } from "./gates";
import { CHECK_SYSTEM, GENERATION_SYSTEM, PROMPT_VERSION, checkUser, generationUser } from "./prompts";
import { countLetters, emptyCounts, shuffleQuestion, type LetterCounts } from "./shuffle";
import { knownClauseNumbers, outline, planUnits, surplusFor, type PlannedUnit } from "./units";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Thinking plus up to ~10 questions of JSON; Gemini's cap is 65,536. */
export const GENERATION_MAX_OUTPUT_TOKENS = 32768;
/** What followup.ts askJson allows a check reply (its MAX_OUTPUT_TOKENS); used only for this run's own cap. */
const CHECK_MAX_OUTPUT_TOKENS = 8192;
const GOOGLE_RATE_LIMIT_WAIT_MS = 20_000;
/**
 * Live samples 2026-10-01 (gemini-3.8-flash, 4-10 questions a unit): HIGH thinking cost ~$0.068 a
 * unit, MEDIUM ~$0.046, LOW ~$0.012, with no clear quality difference on review of a few units;
 * HIGH would take the whole standard past a $3 run. LOW is the cheap option (--thinking LOW).
 */
export const DEFAULT_THINKING: GeminiRequest["thinkingLevel"] = "MEDIUM";

export type ThinkingLevel = GeminiRequest["thinkingLevel"];

export interface GenerateOptions {
  userId: string;
  code: string;
  /** The database dialect the caller expects (the CLI's --target); every write asserts it. */
  target: "sqlite" | "postgres";
  clauses?: string[];
  perClause?: number;
  maxUsd: number;
  dryRun?: boolean;
  force?: boolean;
  thinkingLevel?: ThinkingLevel;
  log?: (line: string) => void;
  /** Tests only: no waiting before a retry after Google's rate limit. */
  rateLimitWaitMs?: number;
}

export interface CheckRecord {
  stem: string;
  options: { id: OptionId; text: string }[];
  key: OptionId;
  checkerAnswer: OptionId | "NONE";
  reason: string;
  checkedBy: string;
  independence: CheckIndependence;
}

export interface UnitReport {
  clauseNo: string;
  title: string;
  chars: number;
  quota: number;
  requested: number;
  existingVerified: number;
  status: "skipped_enough" | "done" | "generation_failed" | "not_reached";
  generated: number;
  rejected: Partial<Record<RejectReason, number>>;
  rejections: Rejection[];
  passedGates: number;
  checked: number;
  verified: number;
  needsReview: number;
  disagreed: CheckRecord[];
  noneAnswers: CheckRecord[];
  checkFailed: { stem: string; error: string }[];
  /** Survivors not sent to the checker: the quota was already met, or the run hit its cap. */
  notChecked: number;
  stored: "replaced" | "stored_review_only" | "kept_old" | "nothing";
  storedVerified: number;
  storedReview: number;
  spendUsd: number;
  error?: string;
}

export interface BankStats {
  verified: number;
  needsReview: number;
  letters: LetterCounts;
  letterShare: Record<OptionId, number>;
  /** Share of verified questions whose correct option is the (strictly) longest: ~25% means no length cue. */
  correctLongestShare: number;
  levels: Record<string, number>;
  perUnit: { clauseNo: string; quota: number; verified: number; needsReview: number }[];
}

export interface RunReport {
  standard: { id: string; code: string; contentFp: string };
  promptVersion: string;
  generationModel: string;
  thinkingLevel: ThinkingLevel;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  force: boolean;
  maxUsd: number;
  /** min(maxUsd, what the 24-hour server limit had left at the start). */
  budgetUsd: number;
  plan: { units: { clauseNo: string; title: string; chars: number; quota: number; requested: number }[]; skipped: { clauseNo: string; title: string; reason: string }[]; unknown: string[] };
  estimate: { generationUsd: number; checkUsdOffPeak: number; checkUsdPeak: number; totalUsdOffPeak: number; totalUsdPeak: number; note: string } | null;
  units: UnitReport[];
  totals: {
    requested: number;
    generated: number;
    rejected: Partial<Record<RejectReason, number>>;
    rejectedTotal: number;
    passedGates: number;
    checked: number;
    disagreed: number;
    none: number;
    checkFailed: number;
    notChecked: number;
    verified: number;
    needsReview: number;
    storedVerified: number;
    storedReview: number;
  };
  checkers: Record<string, number>;
  spendUsd: number;
  stopReason: null | "run_cap" | "daily_cap" | "fatal";
  stopDetail: string | null;
  bank: BankStats;
}

class StopRun extends Error {
  constructor(readonly reason: "run_cap" | "daily_cap" | "fatal", message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- loading

export async function loadStandard(userId: string, code: string): Promise<{ standard: StandardRow; clauses: ClauseRow[] }> {
  const standard = await getDatabase().prepare("SELECT * FROM standards WHERE owner_user_id = ? AND code = ?").get<StandardRow>(userId, code);
  if (!standard) throw new HttpError(404, `No standard "${code}" for account ${userId}.`);
  return { standard, clauses: await StandardsRepository.clauses(standard.id) };
}

function assertTarget(target: string): void {
  const dialect = getDatabase().dialect;
  if (dialect !== target) throw new Error(`Refusing to write: expected a ${target} database, connected to ${dialect}.`);
}

/** What this run has put on the ledger so far (reservations not yet settled count at their worst case). */
async function spentSince(userId: string, since: string): Promise<number> {
  const row = await getDatabase()
    .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_spend WHERE user_id = ? AND created_at >= ?")
    .get<{ total: number | string }>(userId, since);
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------- cost bounds

function generationRequest(deps: FollowUpDeps, user: string, thinkingLevel: ThinkingLevel): GeminiRequest {
  return { model: deps.geminiModel, system: GENERATION_SYSTEM, turns: [{ role: "user", text: user }], grounded: false, json: true, maxOutputTokens: GENERATION_MAX_OUTPUT_TOKENS, thinkingLevel };
}

/**
 * The most one checker attempt can bill (the dearest checker in the fallback chain, at its worst
 * case). If the first checker fails and runCheck falls back, each fallback reserves its own worst
 * case against the reservation cap, which this run sets to its own budget: a fallback that would
 * pass the cap is refused there, and a refused check is a failed check, never agreement.
 */
export function checkWorstUsd(deps: FollowUpDeps, user: string): number {
  const peak = new Date(Date.UTC(2026, 0, 5, 7));
  return Math.max(
    0,
    ...checkers(deps, "google").map((c) => {
      if (c.provider === "deepseek") {
        const tokens = Math.ceil((CHECK_SYSTEM.length + user.length) / 3);
        return DEEPSEEK_MAX_ATTEMPTS * costUsd(deps.deepseekModel, { promptCacheHitTokens: 0, promptCacheMissTokens: tokens, completionTokens: CHECK_MAX_OUTPUT_TOKENS, reasoningTokens: 0 }, peak, true);
      }
      return geminiWorstUsd(c.model ?? deps.geminiModel, { system: CHECK_SYSTEM, turns: [{ role: "user", text: user }], grounded: false, maxOutputTokens: CHECK_MAX_OUTPUT_TOKENS });
    })
  );
}

// ---------------------------------------------------------------- check replies

export function parseVerdict(json: unknown): { answer: OptionId | "NONE"; reason: string } | null {
  const j = (json ?? {}) as Record<string, unknown>;
  if (typeof j.answer !== "string") return null;
  const raw = j.answer.trim().toUpperCase().replace(/^OPTION\s+/, "").replace(/[.)\s]+$/, "");
  if (raw !== "NONE" && !(OPTION_IDS as string[]).includes(raw)) return null;
  const reason = typeof j.reason === "string" ? j.reason.trim().slice(0, 400) : "";
  return { answer: raw as OptionId | "NONE", reason };
}

/** Recall, understanding and application interleaved, so stopping at the quota keeps the mix. */
function interleaveByLevel<T extends { level: string }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const q of items) groups.set(q.level, [...(groups.get(q.level) ?? []), q]);
  const order = ["application", "understanding", "recall"].map((l) => groups.get(l) ?? []);
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) for (const g of order) if (g[i]) out.push(g[i]);
  return out;
}

function addCounts(into: Partial<Record<RejectReason, number>>, rejections: Rejection[]): void {
  for (const r of rejections) into[r.reason] = (into[r.reason] ?? 0) + 1;
}

// ---------------------------------------------------------------- bank statistics and export

async function bankStats(standard: StandardRow, clauses: ClauseRow[], quotas: Map<string, number>): Promise<BankStats> {
  const verified = await QuizRepository.listVerified(standard.id, clauses);
  const counts = await QuizRepository.counts(standard.id);
  const letters = countLetters(verified.map((q) => q.answer));
  const total = verified.length || 1;
  const letterShare = Object.fromEntries(OPTION_IDS.map((l) => [l, Math.round((letters[l] / total) * 1000) / 10])) as Record<OptionId, number>;
  const longest = verified.filter((q) => {
    const len = (id: OptionId) => q.options.find((o) => o.id === id)!.text.length;
    return OPTION_IDS.every((id) => id === q.answer || len(q.answer) > len(id));
  }).length;
  const levels: Record<string, number> = {};
  for (const q of verified) levels[q.level ?? "unknown"] = (levels[q.level ?? "unknown"] ?? 0) + 1;
  const byUnit = new Map<string, number>();
  for (const q of verified) byUnit.set(q.clauseNo, (byUnit.get(q.clauseNo) ?? 0) + 1);
  const perUnit = clauses
    .filter((c) => quotas.has(c.clause_no) || byUnit.has(c.clause_no))
    .map((c) => ({ clauseNo: c.clause_no, quota: quotas.get(c.clause_no) ?? 0, verified: byUnit.get(c.clause_no) ?? 0, needsReview: counts[c.clause_no]?.needsReview ?? 0 }));
  return {
    verified: verified.length,
    needsReview: Object.values(counts).reduce((n, c) => n + c.needsReview, 0),
    letters,
    letterShare,
    correctLongestShare: verified.length ? Math.round((longest / verified.length) * 1000) / 10 : 0,
    levels,
    perUnit,
  };
}

/** The bank as a portable file: verified questions on the current text (plus needs_review if asked). */
export async function exportQuestions(userId: string, code: string, includeReview = false): Promise<QuestionExportFile> {
  const { standard, clauses } = await loadStandard(userId, code);
  const order = new Map(clauses.map((c) => [c.clause_no, c.ord]));
  const fps = new Map(clauses.map((c) => [c.clause_no, clauseFingerprint(c)]));
  let questions: StandardQuestion[] = await QuizRepository.listVerified(standard.id, clauses);
  if (includeReview) {
    const ids = await getDatabase().prepare("SELECT id FROM standard_questions WHERE standard_id = ? AND status = 'needs_review'").all<{ id: string }>(standard.id);
    const review = (await QuizRepository.getMany(standard.id, ids.map((r) => r.id))).filter((q) => fps.get(q.clauseNo) === q.clauseFp);
    questions = [...questions, ...review];
  }
  questions.sort((a, b) => (order.get(a.clauseNo) ?? 0) - (order.get(b.clauseNo) ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return {
    version: 1,
    standardCode: standard.code,
    contentFp: standard.content_fp,
    generatedAt: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    questions: questions.map(({ id, standardId, ...rest }) => rest),
  };
}

// ---------------------------------------------------------------- the run

function emptyUnit(u: PlannedUnit, requested: number): UnitReport {
  return {
    clauseNo: u.clause.clause_no,
    title: u.clause.title,
    chars: u.clause.body.trim().length,
    quota: u.quota,
    requested,
    existingVerified: 0,
    status: "not_reached",
    generated: 0,
    rejected: {},
    rejections: [],
    passedGates: 0,
    checked: 0,
    verified: 0,
    needsReview: 0,
    disagreed: [],
    noneAnswers: [],
    checkFailed: [],
    notChecked: 0,
    stored: "nothing",
    storedVerified: 0,
    storedReview: 0,
    spendUsd: 0,
  };
}

function estimate(deps: FollowUpDeps, units: PlannedUnit[], outlineText: string): RunReport["estimate"] {
  // Assumptions: ~4 characters per token; ~450 output tokens per question written plus ~4,000
  // thinking tokens per unit; a check reads its prompt once and writes ~1,500 tokens (reasoning).
  let generationUsd = 0;
  let checkOff = 0;
  let checkPeak = 0;
  const now = new Date();
  for (const u of units) {
    const requested = u.quota + surplusFor(u.quota);
    const gen = generationUser(u.clause, outlineText, requested);
    const rate = geminiRate(deps.geminiModel, now);
    generationUsd += (((GENERATION_SYSTEM.length + gen.length) / 4) * rate.input + (requested * 450 + 4000) * rate.output) / 1_000_000;
    const check = checkUser(u.clause, outlineText, { stem: "x".repeat(250), options: OPTION_IDS.map((id) => ({ id, text: "x".repeat(80) })) });
    const usage = { promptCacheHitTokens: 0, promptCacheMissTokens: (CHECK_SYSTEM.length + check.length) / 4, completionTokens: 1500, reasoningTokens: 1300 };
    checkOff += u.quota * 1.1 * costUsd(deps.deepseekModel, usage, new Date(Date.UTC(2026, 0, 4, 7)));
    checkPeak += u.quota * 1.1 * costUsd(deps.deepseekModel, usage, new Date(Date.UTC(2026, 0, 5, 7)));
  }
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    generationUsd: r(generationUsd),
    checkUsdOffPeak: r(checkOff),
    checkUsdPeak: r(checkPeak),
    totalUsdOffPeak: r(generationUsd + checkOff),
    totalUsdPeak: r(generationUsd + checkPeak),
    note: "Rough: ~450 output tokens per question + 4,000 thinking tokens per unit (Gemini, current rate); ~1,500 reasoning+answer tokens per DeepSeek check, 1.1 checks per stored question. Reservations hold far more (the worst case) until each call settles.",
  };
}

export async function generateStandardQuestions(options: GenerateOptions, deps: FollowUpDeps): Promise<RunReport> {
  const log = options.log ?? (() => {});
  const thinkingLevel = options.thinkingLevel ?? DEFAULT_THINKING;
  const { standard, clauses } = await loadStandard(options.userId, options.code);
  const plan = planUnits(clauses, { only: options.clauses, perClause: options.perClause });
  if (plan.unknown.length) throw new HttpError(400, `Not units of ${standard.code}: ${plan.unknown.join(", ")}`);
  const outlineText = outline(clauses);
  const known = knownClauseNumbers(clauses);
  const startedAt = new Date();
  const quotas = new Map(plan.units.map((u) => [u.clause.clause_no, u.quota]));

  const spent24h = await SpendRepository.totalSince(new Date(startedAt.getTime() - DAY_MS));
  const budgetUsd = Math.max(0, Math.min(options.maxUsd, deps.capUsd - spent24h));
  // The reservation itself also refuses anything past this run's cap (and the server's daily cap).
  const runDeps: FollowUpDeps = { ...deps, capUsd: Math.min(deps.capUsd, spent24h + options.maxUsd) };

  const report: RunReport = {
    standard: { id: standard.id, code: standard.code, contentFp: standard.content_fp },
    promptVersion: PROMPT_VERSION,
    generationModel: deps.geminiModel,
    thinkingLevel,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    maxUsd: options.maxUsd,
    budgetUsd: Math.round(budgetUsd * 10000) / 10000,
    plan: {
      units: plan.units.map((u) => ({ clauseNo: u.clause.clause_no, title: u.clause.title, chars: u.clause.body.trim().length, quota: u.quota, requested: u.quota + surplusFor(u.quota) })),
      skipped: plan.skipped,
      unknown: plan.unknown,
    },
    estimate: estimate(deps, plan.units, outlineText),
    units: [],
    totals: { requested: 0, generated: 0, rejected: {}, rejectedTotal: 0, passedGates: 0, checked: 0, disagreed: 0, none: 0, checkFailed: 0, notChecked: 0, verified: 0, needsReview: 0, storedVerified: 0, storedReview: 0 },
    checkers: {},
    spendUsd: 0,
    stopReason: null,
    stopDetail: null,
    bank: { verified: 0, needsReview: 0, letters: emptyCounts(), letterShare: { A: 0, B: 0, C: 0, D: 0 }, correctLongestShare: 0, levels: {}, perUnit: [] },
  };

  if (!options.dryRun) {
    if (!deps.googleKey) throw new HttpError(503, "GOOGLE_GENERATIVE_AI_API_KEY is not set: questions are written by Gemini.");
    if (!checkers(deps, "google").length) throw new HttpError(503, "No second AI is set up to check the questions.");
    if (!deps.deepseek) log("WARNING: DEEPSEEK_API_KEY is not set: no checker from another company, so nothing can become verified (needs_review only).");
    const runStart = startedAt.toISOString();
    const spent = () => spentSince(options.userId, runStart);
    const afford = async (worst: number, what: string) => {
      const s = await spent();
      if (s + worst > budgetUsd) {
        const daily = budgetUsd < options.maxUsd;
        throw new StopRun(daily ? "daily_cap" : "run_cap", `${what} could cost up to $${worst.toFixed(4)}; this run has spent $${s.toFixed(4)} of its $${budgetUsd.toFixed(2)} ${daily ? "(the server's 24-hour limit)" : "run cap"}.`);
      }
    };

    const generate = async (user: string): Promise<{ json: unknown }> => {
      const request = generationRequest(runDeps, user, thinkingLevel);
      await afford(geminiWorstUsd(request.model, request), "The generation call");
      for (let attempt = 1; ; attempt++) {
        try {
          const result = await callGemini(runDeps, options.userId, request, false);
          try {
            return { json: JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, "")) };
          } catch {
            throw new HttpError(502, `Gemini's reply was not valid JSON (finish reason ${result.finishReason}).`);
          }
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          if (/spending limit/i.test(err.message)) throw new StopRun(budgetUsd < options.maxUsd ? "daily_cap" : "run_cap", err.message);
          if (err.status === 503) throw new StopRun("fatal", err.message);
          if (err.status === 429 && attempt === 1) {
            log(`  Google rate limit; waiting ${Math.round((options.rateLimitWaitMs ?? GOOGLE_RATE_LIMIT_WAIT_MS) / 1000)} s and trying once more`);
            await new Promise((r) => setTimeout(r, options.rateLimitWaitMs ?? GOOGLE_RATE_LIMIT_WAIT_MS));
            continue;
          }
          throw err;
        }
      }
    };

    const processUnit = async (ur: UnitReport, planned: PlannedUnit, requested: number): Promise<void> => {
      const unit = planned.clause;
      log(`[${unit.clause_no}] ${unit.title}: quota ${planned.quota}, asking for ${requested}`);
      let json: unknown;
      try {
        json = (await generate(generationUser(unit, outlineText, requested))).json;
      } catch (err) {
        if (err instanceof HttpError) {
          ur.status = "generation_failed";
          ur.error = err.message;
          ur.stored = "kept_old";
          log(`  generation failed: ${err.message}`);
          return;
        }
        throw err;
      }
      ur.status = "done";

      // Gates (a)-(f).
      const list = Array.isArray((json as { questions?: unknown })?.questions) ? (json as { questions: unknown[] }).questions : [];
      if (!list.length) ur.rejections.push({ reason: "shape", detail: "no questions list in the reply", stem: "" });
      ur.generated = list.length;
      const passed: DraftQuestion[] = [];
      for (const raw of list) {
        const shaped = draftFromModel(raw);
        if (!shaped.ok) {
          ur.rejections.push(shaped.rejection);
          continue;
        }
        const grounded = checkAgainstText(shaped.draft, unit, known);
        if (!grounded.ok) ur.rejections.push(grounded.rejection);
        else passed.push(grounded.draft);
      }
      const unique = dedupe(passed);
      ur.rejections.push(...unique.rejections);
      addCounts(ur.rejected, ur.rejections);
      ur.passedGates = unique.kept.length;

      // Blind re-solve by the other company's model, until the quota is verified.
      const verified: (DraftQuestion & { checkedBy: string; independence: CheckIndependence })[] = [];
      const review: (DraftQuestion & { checkedBy: string; independence: CheckIndependence })[] = [];
      const queue = interleaveByLevel(unique.kept);
      let stop: StopRun | null = null;
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i];
        if (verified.length >= planned.quota) {
          ur.notChecked = queue.length - i;
          break;
        }
        const user = checkUser(unit, outlineText, q);
        try {
          await afford(checkWorstUsd(runDeps, user), "A blind check");
        } catch (err) {
          if (!(err instanceof StopRun)) throw err;
          stop = err;
          ur.notChecked = queue.length - i;
          break;
        }
        ur.checked++;
        let checked: Awaited<ReturnType<typeof runCheck>>;
        try {
          checked = await runCheck(runDeps, "google", options.userId, CHECK_SYSTEM, async () => ({ user, images: [] }));
        } catch (err) {
          // A failed check is never agreement: the question is dropped.
          const message = err instanceof Error ? err.message : String(err);
          ur.checkFailed.push({ stem: q.stem.slice(0, 200), error: message.slice(0, 300) });
          if (err instanceof HttpError && /spending limit/i.test(err.message)) {
            stop = new StopRun(budgetUsd < options.maxUsd ? "daily_cap" : "run_cap", err.message);
            ur.notChecked = queue.length - i - 1;
            break;
          }
          continue;
        }
        report.checkers[`${checked.model} (${checked.independence})`] = (report.checkers[`${checked.model} (${checked.independence})`] ?? 0) + 1;
        const verdict = parseVerdict(checked.json);
        if (!verdict) {
          ur.checkFailed.push({ stem: q.stem.slice(0, 200), error: `unexpected reply from ${checked.model}` });
          continue;
        }
        const record: CheckRecord = { stem: q.stem, options: q.options, key: q.answer, checkerAnswer: verdict.answer, reason: verdict.reason, checkedBy: checked.model, independence: checked.independence };
        if (verdict.answer === "NONE") ur.noneAnswers.push(record);
        else if (verdict.answer !== q.answer) ur.disagreed.push(record);
        else if (checked.independence === "other_provider") verified.push({ ...q, checkedBy: checked.model, independence: checked.independence });
        else review.push({ ...q, checkedBy: checked.model, independence: checked.independence });
      }

      // Re-letter (after verification), balancing the key letters across the whole bank.
      const others = (await QuizRepository.listVerified(standard.id, clauses)).filter((x) => x.clauseNo !== unit.clause_no);
      const counts = countLetters(others.map((x) => x.answer));
      const keepVerified = verified.slice(0, planned.quota).map((q) => shuffleQuestion(q, unit.clause_no, counts));
      const keepReview = review.slice(0, Math.max(0, planned.quota - keepVerified.length)).map((q) => shuffleQuestion(q, unit.clause_no, counts, false));
      ur.verified = keepVerified.length;
      ur.needsReview = keepReview.length;

      const fp = clauseFingerprint(unit);
      const toNew = (q: (typeof keepVerified)[number], status: "verified" | "needs_review"): NewQuestion => ({
        id: questionId(standard.id, unit.clause_no, q.stem, q.options.find((o) => o.id === q.answer)!.text),
        clauseNo: unit.clause_no,
        clauseFp: fp,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        optionNotes: q.optionNotes,
        proofQuote: q.proofQuote,
        proofClauseNo: q.proofClauseNo,
        difficulty: q.difficulty,
        level: q.level,
        status,
        generatedBy: runDeps.geminiModel,
        checkedBy: q.checkedBy,
        checkIndependence: q.independence,
      });
      const anyStored = await getDatabase().prepare("SELECT COUNT(*) AS n FROM standard_questions WHERE standard_id = ? AND clause_no = ?").get<{ n: number | string }>(standard.id, unit.clause_no);
      if (keepVerified.length && (options.force || keepVerified.length > ur.existingVerified)) {
        assertTarget(options.target);
        await QuizRepository.replaceClauseQuestions(standard.id, unit.clause_no, [...keepVerified.map((q) => toNew(q, "verified")), ...keepReview.map((q) => toNew(q, "needs_review"))]);
        ur.stored = "replaced";
        ur.storedVerified = keepVerified.length;
        ur.storedReview = keepReview.length;
      } else if (!keepVerified.length && keepReview.length && Number(anyStored?.n ?? 0) === 0) {
        assertTarget(options.target);
        await QuizRepository.replaceClauseQuestions(standard.id, unit.clause_no, keepReview.map((q) => toNew(q, "needs_review")));
        ur.stored = "stored_review_only";
        ur.storedReview = keepReview.length;
      } else {
        ur.stored = Number(anyStored?.n ?? 0) ? "kept_old" : "nothing";
      }
      const rejectedSummary = Object.entries(ur.rejected).map(([k, v]) => `${k} ${v}`).join(", ");
      log(
        `  generated ${ur.generated}, passed gates ${ur.passedGates}${rejectedSummary ? ` (rejected: ${rejectedSummary})` : ""}; checked ${ur.checked}: verified ${verified.length}, needs_review ${review.length}, disagreed ${ur.disagreed.length}, NONE ${ur.noneAnswers.length}, check failed ${ur.checkFailed.length}; stored ${ur.stored} (${ur.storedVerified} verified, ${ur.storedReview} review)`
      );
      if (stop) throw stop;
    };

    for (const planned of plan.units) {
      const unit = planned.clause;
      const requested = planned.quota + surplusFor(planned.quota);
      const ur = emptyUnit(planned, requested);
      report.units.push(ur);
      const before = await spent();
      try {
        ur.existingVerified = (await QuizRepository.listVerified(standard.id, clauses, new Set([unit.clause_no]))).length;
        if (!options.force && ur.existingVerified >= planned.quota) {
          ur.status = "skipped_enough";
          ur.stored = "kept_old";
          log(`[${unit.clause_no}] skipped: already ${ur.existingVerified} verified (quota ${planned.quota}); --force regenerates`);
          continue;
        }
        await processUnit(ur, planned, requested);
      } catch (err) {
        if (err instanceof StopRun) {
          report.stopReason = err.reason;
          report.stopDetail = err.message;
          log(`STOP (${err.reason}): ${err.message}`);
          break;
        }
        throw err;
      } finally {
        ur.spendUsd = Math.round(((await spent()) - before) * 1_000_000) / 1_000_000;
      }
    }
    report.spendUsd = Math.round((await spent()) * 1_000_000) / 1_000_000;
  }

  // Totals and the bank as it now stands.
  const t = report.totals;
  for (const u of report.units) {
    t.requested += u.status === "skipped_enough" ? 0 : u.requested;
    t.generated += u.generated;
    addCounts(t.rejected, u.rejections);
    t.rejectedTotal += u.rejections.length;
    t.passedGates += u.passedGates;
    t.checked += u.checked;
    t.disagreed += u.disagreed.length;
    t.none += u.noneAnswers.length;
    t.checkFailed += u.checkFailed.length;
    t.notChecked += u.notChecked;
    t.verified += u.verified;
    t.needsReview += u.needsReview;
    t.storedVerified += u.storedVerified;
    t.storedReview += u.storedReview;
  }
  // Units the run never reached (stopped early) are listed too, so the report shows what is left.
  for (const planned of plan.units) {
    if (!options.dryRun && !report.units.some((u) => u.clauseNo === planned.clause.clause_no)) report.units.push(emptyUnit(planned, planned.quota + surplusFor(planned.quota)));
  }
  report.bank = await bankStats(standard, clauses, quotas);
  report.finishedAt = new Date().toISOString();
  return report;
}
