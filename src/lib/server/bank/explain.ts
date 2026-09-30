/**
 * AI explanations for the shared question bank (DECISION-002).
 *
 * Per question:
 *  1. Skip, honestly, anything whose text is incomplete without its figure or is not clean text.
 *  2. Resolve the key. Unscored (disputed / dropped / no_key) → no explanation: an AI solve can
 *     never make a question scored, so nothing is spent on it.
 *  3. Blind solve with the check model (thinking on): section, stem and options only — never the
 *     key, source solution or other evidence. A valid answer is stored as ai_blind_solve evidence
 *     (one row per model per question, bound to the question's content fingerprint); a
 *     null/invalid answer stores nothing and ends the question: the solver's null means the text
 *     is incomplete or ambiguous, so no note is written.
 *  4. Re-resolve through resolveAnswerKey(). If the blind solve disputed a non-SSC key, stop.
 *     A note needs the blind solve to AGREE with the key: when it disagrees even with SSC's key
 *     (which still stands and is still scored), no note is written, so a note never rationalises
 *     a key an independent solve rejected. A key that is the learner's own resolution of a
 *     dispute ('reviewed') is never explained: it is their choice, not a verified key.
 *  5. Teaching note with the generation model against the LOCKED key, passed through the
 *     deterministic gate in explain-gate.ts; only a note that passes is stored, with the content
 *     fingerprint it was written for.
 *
 * Money: before every call the worst case it can bill (every provider attempt reading the whole
 * prompt and writing maxTokens, at peak prices) is reserved atomically against the rolling
 * 24-hour limit (SpendRepository.reserve) and the run's own limit, then settled to the billed
 * usage — including failed and cut-off calls (LlmError.usage). Concurrent requests therefore can
 * never overshoot the limit. One batch runs at a time.
 */
import crypto from "node:crypto";
import { isScored, type ResolvedKey } from "../../bank/answer-key";
import type { BankExplanation } from "../../bank/api-types";
import { costUsd } from "../generation/pricing";
import { getLlmSetup } from "../llm";
import { DEEPSEEK_MAX_ATTEMPTS } from "../llm/deepseek";
import { LlmError, type JsonCompletionRequest, type LlmProvider, type LlmUsage } from "../llm/types";
import { BankRepository, currentEvidence, type BankEvidenceRecord, type BankQuestionRecord } from "../repositories/bank-repo";
import { learnerCommitted } from "./commitment";
import { contentFingerprint } from "./content-fp";
import { SpendRepository } from "../repositories/spend-repo";
import { gateTeachingNote, parseBlindSolve, type TeachingNoteFields } from "./explain-gate";
import {
  BLIND_SOLVE_SYSTEM_PROMPT,
  blindSolveUserPrompt,
  EXPLAIN_PROMPT_VERSION,
  TEACHING_NOTE_SYSTEM_PROMPT,
  teachingNoteUserPrompt,
  type BlindSolvePayload,
  type TeachingNotePayload,
} from "./explain-prompts";
import { HttpError, validId } from "./http";
import { questionsInScope } from "./scoring";
import { explanationFor } from "./views";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Thinking tokens count as output; a cut-off reply is billed and wasted, so leave headroom. */
const BLIND_MAX_TOKENS = 12_000;
const NOTE_MAX_TOKENS = 3_000;

export const SKIP = {
  needsFigure: "needs the figure/clean text — not explained",
  alreadyExplained: "already explained",
  disputedByAi: "disputed by the AI blind solve — not explained",
  blindSolveFailed: "blind solve request failed — not explained",
  noteFailed: "teaching note request failed — not explained",
  noteRejected: "teaching note failed the check — not explained",
  noScoredKey: (status: string) => `no scored key (${status}) — not explained`,
  blindSolveNoAnswer: "the blind solve found the question incomplete or ambiguous — not explained",
  noAgreeingSolve: "the independent blind solve does not agree with the key — not explained",
  learnerReviewedKey: "the key is the learner's own resolution of a dispute, not a verified key — not explained",
} as const;

export interface ExplainDeps {
  provider: LlmProvider;
  checkModel: string;
  checkEffort?: "low" | "high" | "max";
  generationModel: string;
  /** Stop once this run has spent this much. */
  budgetUsd: number;
  /** Rolling 24-hour limit across every run and user (llm_spend ledger). */
  maxUsdPerDay: number;
  /** Written to llm_spend.user_id. */
  spendUserId: string;
}

export interface RunMoney {
  spentUsd: number;
  /** Set when the run must not make another call (limit reached or a fatal provider error). */
  stop: { reason: string; kind: "run_limit" | "daily_limit" | "fatal" } | null;
}

export type ExplainOutcome =
  | { result: "explained"; note: TeachingNoteFields; model: string; createdAt: string; stored: boolean; aiDissent: boolean }
  | { result: "cached"; key: ResolvedKey }
  | { result: "skipped"; reason: string; detail?: string; disputedByAi?: boolean }
  | { result: "stopped"; reason: string; kind: NonNullable<RunMoney["stop"]>["kind"] };

interface QuestionRun {
  question: BankQuestionRecord;
  /** '' for batch runs (global evidence only); a learner id for that learner's own key. */
  evidenceUserId: string;
  deps: ExplainDeps;
  money: RunMoney;
  /** Report a blind solve that gave no usable answer (stored nothing). */
  onBlindNoAnswer?: (why: string) => void;
}

// ------------------------------------------------------------------ helpers
export function blindSolveLabel(model: string): string {
  return `${model} blind solve`;
}

/**
 * Figure-dependent or unclean text is never sent to a model. Text-layer text qualifies, and so
 * does `bilingual_en`: the intact English half of a text-layer block whose Hindi was mis-encoded.
 * OCR text does not (two engines can agree on the same misread, e.g. m³ → m3).
 */
const MODEL_SAFE_TEXT: ReadonlySet<unknown> = new Set(["text_layer", "bilingual_en"]);
export function needsFigureOrCleanText(q: BankQuestionRecord): boolean {
  return q.hasVisual || !MODEL_SAFE_TEXT.has(q.metadata.text_quality);
}

export function blindSolvePayload(q: BankQuestionRecord): BlindSolvePayload {
  return {
    exam: "SSC JE Civil",
    section: q.section,
    question: q.stem,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  };
}

/** The key and the evidence it rests on; content-bound rows made for other content are dropped. */
async function resolve(q: BankQuestionRecord, evidenceUserId: string): Promise<{ key: ResolvedKey; evidence: BankEvidenceRecord[] }> {
  const all = await BankRepository.loadEvidenceForQuestion(q.id, evidenceUserId);
  // Batch runs use global evidence only, whatever loadEvidenceForQuestion does with ''.
  const evidence = currentEvidence(q, evidenceUserId ? all : all.filter((e) => e.userId === ""));
  return { key: BankRepository.resolveFrom(q, evidence), evidence };
}

async function spentToday(): Promise<number> {
  return SpendRepository.totalSince(new Date(Date.now() - DAY_MS));
}

async function checkMoney(deps: ExplainDeps, money: RunMoney): Promise<boolean> {
  if (money.stop) return false;
  if (money.spentUsd >= deps.budgetUsd) {
    money.stop = { kind: "run_limit", reason: `Stopped at this run's $${deps.budgetUsd.toFixed(2)} spending limit.` };
    return false;
  }
  if ((await spentToday()) >= deps.maxUsdPerDay) {
    money.stop = { kind: "daily_limit", reason: `Stopped: the server's $${deps.maxUsdPerDay.toFixed(2)} 24-hour AI spending limit is used up.` };
    return false;
  }
  return true;
}

const PEAK_AT = new Date(Date.UTC(2026, 0, 5, 7)); // a Monday, 07:00 UTC: peak prices

/** The most one call can bill: every provider attempt reading the whole prompt (~3 chars/token) and writing maxTokens, at peak prices. */
export function worstCaseUsd(request: JsonCompletionRequest): number {
  const promptTokens = Math.ceil((request.system.length + request.user.length) / 3);
  const usage: LlmUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: promptTokens, completionTokens: request.maxTokens, reasoningTokens: 0 };
  return DEEPSEEK_MAX_ATTEMPTS * costUsd(request.model, usage, PEAK_AT, true);
}

/**
 * One billed call. Reserves its worst case against the run limit and, atomically, the rolling
 * 24-hour limit before sending; settles the ledger row to the billed usage afterwards. Costs are
 * charged at the requested model's price (the reply's model name may be a variant).
 */
async function callModel(
  deps: ExplainDeps,
  money: RunMoney,
  request: JsonCompletionRequest
): Promise<{ ok: true; json: unknown; usage: LlmUsage; model: string } | { ok: false; message: string }> {
  if (money.stop) return { ok: false, message: money.stop.reason };
  const worst = worstCaseUsd(request);
  if (money.spentUsd + worst > deps.budgetUsd) {
    money.stop = { kind: "run_limit", reason: `Stopped at this run's $${deps.budgetUsd.toFixed(2)} spending limit.` };
    return { ok: false, message: money.stop.reason };
  }
  const reservation = await SpendRepository.reserve({
    userId: deps.spendUserId,
    model: request.model,
    usd: worst,
    capUsd: deps.maxUsdPerDay,
    since: new Date(Date.now() - DAY_MS),
  });
  if (!reservation) {
    money.stop = { kind: "daily_limit", reason: `Stopped: the server's $${deps.maxUsdPerDay.toFixed(2)} 24-hour AI spending limit is used up.` };
    return { ok: false, message: money.stop.reason };
  }
  money.spentUsd += worst;
  const settle = async (usage: LlmUsage | null) => {
    const usd = usage ? costUsd(request.model, usage) : 0;
    await SpendRepository.settle(reservation, usd);
    money.spentUsd += usd - worst;
  };
  try {
    const result = await deps.provider.completeJson(request);
    await settle(result.usage);
    return { ok: true, json: result.json, usage: result.usage, model: result.model };
  } catch (err) {
    if (err instanceof LlmError) {
      await settle(err.usage);
      if (err.fatal) money.stop = { kind: "fatal", reason: err.message };
      return { ok: false, message: err.message };
    }
    // Unknown failure: we cannot know what was billed, so the reservation stays at the worst case.
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Stores a note unless it would displace a note that matches the global key with one written
 * against a single learner's own review (bank_explanations is shared by every learner).
 */
async function shouldStore(questionId: string, lockedAnswer: string, evidenceUserId: string): Promise<boolean> {
  if (!evidenceUserId) return true;
  const existing = await BankRepository.getExplanation(questionId);
  if (!existing || existing.lockedAnswer === lockedAnswer) return true;
  const question = await BankRepository.getQuestion(questionId);
  if (!question) return false;
  const global = (await resolve(question, "")).key;
  return !(isScored(global.status) && global.answer === existing.lockedAnswer);
}

// ------------------------------------------------------------------ one question
export async function explainQuestion(run: QuestionRun, options: { reuseFreshNote?: boolean } = {}): Promise<ExplainOutcome> {
  const { question: q, evidenceUserId, deps, money } = run;

  if (needsFigureOrCleanText(q)) return { result: "skipped", reason: SKIP.needsFigure };

  const before = await resolve(q, evidenceUserId);
  if (!isScored(before.key.status) || before.key.answer === null) {
    return { result: "skipped", reason: SKIP.noScoredKey(before.key.status) };
  }
  if (before.key.status === "reviewed") return { result: "skipped", reason: SKIP.learnerReviewedKey };
  const fp = contentFingerprint(q);
  const existingNote = await BankRepository.getExplanation(q.id);
  if (existingNote && existingNote.lockedAnswer === before.key.answer) {
    return options.reuseFreshNote ? { result: "cached", key: before.key } : { result: "skipped", reason: SKIP.alreadyExplained };
  }

  // ---- blind solve (skipped when this check model already solved it)
  const label = blindSolveLabel(deps.checkModel);
  const hasSolve = before.evidence.some((e) => e.authority === "ai_blind_solve" && e.userId === "" && e.sourceLabel === label);
  if (!hasSolve) {
    if (!(await checkMoney(deps, money))) return { result: "stopped", reason: money.stop!.reason, kind: money.stop!.kind };
    const call = await callModel(deps, money, {
      model: deps.checkModel,
      system: BLIND_SOLVE_SYSTEM_PROMPT,
      user: blindSolveUserPrompt(blindSolvePayload(q)),
      thinking: true,
      reasoningEffort: deps.checkEffort,
      maxTokens: BLIND_MAX_TOKENS,
    });
    if (!call.ok) {
      if (money.stop) return { result: "stopped", reason: money.stop.reason, kind: money.stop.kind };
      return { result: "skipped", reason: SKIP.blindSolveFailed, detail: call.message };
    }
    const parsed = parseBlindSolve(call.json, q.options.map((o) => o.id));
    if (parsed.ok) {
      await BankRepository.upsertGlobalEvidence({
        questionId: q.id,
        authority: "ai_blind_solve",
        sourceGroup: `ai:${deps.checkModel}`,
        sourceLabel: label,
        answer: parsed.value.answer,
        detail: {
          confidence: parsed.value.confidence,
          reasoning: parsed.value.reasoning,
          usage: call.usage,
          replyModel: call.model,
          promptVersion: EXPLAIN_PROMPT_VERSION,
          content_fp: fp,
        },
      });
    } else {
      run.onBlindNoAnswer?.(parsed.reason);
      return { result: "skipped", reason: SKIP.blindSolveNoAnswer, detail: parsed.reason };
    }
  }

  // ---- re-resolve: the blind solve may have disputed a non-SSC key
  const after = await resolve(q, evidenceUserId);
  if (!isScored(after.key.status) || after.key.answer === null) {
    const disputedByAi = after.key.status === "disputed" && after.key.dissent.some((e) => e.authority === "ai_blind_solve");
    return disputedByAi
      ? { result: "skipped", reason: SKIP.disputedByAi, disputedByAi: true }
      : { result: "skipped", reason: SKIP.noScoredKey(after.key.status) };
  }
  if (after.key.status === "reviewed") return { result: "skipped", reason: SKIP.learnerReviewedKey };
  const key = after.key.answer;
  const aiDissent = after.key.dissent.some((e) => e.authority === "ai_blind_solve");
  const agreeing = after.evidence.find(
    (e) => e.authority === "ai_blind_solve" && e.sourceLabel === label && e.answer === key && typeof e.detail.reasoning === "string"
  );
  // No note without an independent solve that reached the same key (see step 4 above).
  if (!agreeing || aiDissent) return { result: "skipped", reason: SKIP.noAgreeingSolve };

  // ---- teaching note against the locked key
  if (!(await checkMoney(deps, money))) return { result: "stopped", reason: money.stop!.reason, kind: money.stop!.kind };
  const payload: TeachingNotePayload = {
    ...blindSolvePayload(q),
    lockedAnswer: key,
    sourceSolution: q.sourceSolution,
    independentWorking: { note: "Independent working that reached the same answer.", reasoning: String(agreeing.detail.reasoning) },
  };
  const call = await callModel(deps, money, {
    model: deps.generationModel,
    system: TEACHING_NOTE_SYSTEM_PROMPT,
    user: teachingNoteUserPrompt(payload),
    thinking: false,
    maxTokens: NOTE_MAX_TOKENS,
  });
  if (!call.ok) {
    if (money.stop) return { result: "stopped", reason: money.stop.reason, kind: money.stop.kind };
    return { result: "skipped", reason: SKIP.noteFailed, detail: call.message };
  }
  const gated = gateTeachingNote(call.json, key, q.options.map((o) => o.id));
  if (!gated.ok) return { result: "skipped", reason: SKIP.noteRejected, detail: gated.reason };

  const createdAt = new Date().toISOString();
  const stored = await shouldStore(q.id, key, evidenceUserId);
  if (stored) {
    await BankRepository.saveExplanation({
      questionId: q.id,
      lockedAnswer: key,
      note: JSON.stringify(noteJson(gated.value)),
      model: deps.generationModel,
      createdAt,
      contentFp: fp,
    });
  }
  return { result: "explained", note: gated.value, model: deps.generationModel, createdAt, stored, aiDissent };
}

/** bank_explanations.note: exactly the teaching fields (lockedAnswer lives in its own column too). */
function noteJson(note: TeachingNoteFields): Omit<TeachingNoteFields, "lockedAnswer"> {
  return {
    topic: note.topic,
    concept: note.concept,
    steps: note.steps,
    whyCorrect: note.whyCorrect,
    options: note.options,
    traps: note.traps,
    examTip: note.examTip,
    verificationLimits: note.verificationLimits,
  };
}

// ------------------------------------------------------------------ batch
export type ExplainJobState = "running" | "done" | "stopped" | "failed";

/** GET /api/bank/papers/[id]/explain. Contains counts and reasons only — never a key. */
export interface ExplainJobProgress {
  jobId: string;
  paperId: string;
  state: ExplainJobState;
  done: number;
  total: number;
  explained: number;
  skipped: Record<string, number>;
  /** Questions whose only (non-SSC) key the blind solve disagreed with: now disputed, not scored. */
  disputedByAi: number;
  /** Scored keys (e.g. SSC official) that a blind solve disagreed with: still scored, dissent shown in review, no note written. */
  aiDissent: number;
  /** Blind solves that returned no usable answer (nothing stored). */
  blindSolveNoAnswer: number;
  spentUsd: number;
  budgetUsd: number;
  message: string | null;
  /** Per-question problems (position + reason), newest last, at most 50. No keys. */
  problems: { position: number; reason: string }[];
  startedAt: string;
  finishedAt: string | null;
}

export interface BatchOptions {
  limit?: number;
  onUpdate?: (progress: ExplainJobProgress) => void;
}

export function createProgress(paperId: string, total: number, budgetUsd: number): ExplainJobProgress {
  return {
    jobId: `bxj_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    paperId,
    state: "running",
    done: 0,
    total,
    explained: 0,
    skipped: {},
    disputedByAi: 0,
    aiDissent: 0,
    blindSolveNoAnswer: 0,
    spentUsd: 0,
    budgetUsd,
    message: null,
    problems: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

async function paperQuestions(paperId: string, limit?: number): Promise<BankQuestionRecord[]> {
  const all = questionsInScope(await BankRepository.listQuestions(paperId), "full", null);
  return limit && limit > 0 ? all.slice(0, limit) : all;
}

/** Runs a whole paper against global evidence. Used by the batch route and scripts/explain-bank.mjs. */
export async function runExplainBatch(
  paperId: string,
  deps: ExplainDeps,
  options: BatchOptions = {},
  progress?: ExplainJobProgress
): Promise<ExplainJobProgress> {
  const questions = await paperQuestions(paperId, options.limit);
  const p = progress ?? createProgress(paperId, questions.length, deps.budgetUsd);
  p.total = questions.length;
  const money: RunMoney = { spentUsd: 0, stop: null };
  const problem = (position: number, reason: string) => {
    p.problems.push({ position, reason });
    if (p.problems.length > 50) p.problems.shift();
  };
  const skip = (reason: string) => (p.skipped[reason] = (p.skipped[reason] ?? 0) + 1);

  for (const question of questions) {
    const outcome = await explainQuestion({
      question,
      evidenceUserId: "",
      deps,
      money,
      onBlindNoAnswer: (why) => {
        p.blindSolveNoAnswer += 1;
        problem(question.position, `blind solve stored nothing: ${why}`);
      },
    });
    p.spentUsd = money.spentUsd;
    if (outcome.result === "stopped") {
      p.state = "stopped";
      p.message = outcome.reason;
      break;
    }
    p.done += 1;
    if (outcome.result === "explained") {
      p.explained += 1;
      if (outcome.aiDissent) p.aiDissent += 1;
    } else if (outcome.result === "skipped") {
      skip(outcome.reason);
      if (outcome.disputedByAi) p.disputedByAi += 1;
      if (outcome.reason === SKIP.noAgreeingSolve) p.aiDissent += 1;
      if (outcome.detail) problem(question.position, `${outcome.reason}: ${outcome.detail}`);
    }
    options.onUpdate?.(p);
  }
  if (p.state === "running") {
    p.state = "done";
    p.message = `Explained ${p.explained} of ${p.total} question(s).`;
  }
  p.finishedAt = new Date().toISOString();
  options.onUpdate?.(p);
  return p;
}

/** Rough per-question cost before running (used by --dry-run). ~4 chars/token. */
export function estimateQuestionCostUsd(q: BankQuestionRecord, checkModel: string, generationModel: string): { offPeak: number; peak: number } {
  const tokens = (s: string) => Math.ceil(s.length / 4);
  const blindIn = tokens(BLIND_SOLVE_SYSTEM_PROMPT + blindSolveUserPrompt(blindSolvePayload(q)));
  const noteIn = tokens(TEACHING_NOTE_SYSTEM_PROMPT + blindSolveUserPrompt(blindSolvePayload(q)) + (q.sourceSolution ?? "")) + 300;
  // Assumptions: the blind solve thinks ~2,500 tokens and answers ~300; the note is ~1,000 tokens.
  const blind: LlmUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: blindIn, completionTokens: 2_800, reasoningTokens: 2_500 };
  const note: LlmUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: noteIn, completionTokens: 1_000, reasoningTokens: 0 };
  const peakAt = new Date(Date.UTC(2026, 0, 5, 7)); // a Monday, 07:00 UTC
  const offPeakAt = new Date(Date.UTC(2026, 0, 4, 7)); // a Sunday
  const at = (d: Date) => costUsd(checkModel, blind, d) + costUsd(generationModel, note, d);
  return { offPeak: at(offPeakAt), peak: at(peakAt) };
}

/** What a run would do without calling a model (no spend). */
export async function planPaper(paperId: string, limit?: number): Promise<{ position: number; questionId: string; action: string }[]> {
  const plan: { position: number; questionId: string; action: string }[] = [];
  for (const q of await paperQuestions(paperId, limit)) {
    if (needsFigureOrCleanText(q)) {
      plan.push({ position: q.position, questionId: q.id, action: SKIP.needsFigure });
      continue;
    }
    const { key } = await resolve(q, "");
    if (!isScored(key.status)) {
      plan.push({ position: q.position, questionId: q.id, action: SKIP.noScoredKey(key.status) });
      continue;
    }
    const note = await BankRepository.getExplanation(q.id);
    plan.push({
      position: q.position,
      questionId: q.id,
      action: note && note.lockedAnswer === key.answer ? SKIP.alreadyExplained : "send",
    });
  }
  return plan;
}

// ------------------------------------------------------------------ server-wide job registry
interface Registry {
  active: string | null;
  jobs: Map<string, ExplainJobProgress>;
}
// Kept on globalThis so dev-server module reloads don't lose track of a running job.
const holder = globalThis as unknown as { __bankExplainJobs?: Registry };
const registry = (holder.__bankExplainJobs ??= { active: null, jobs: new Map() });
const MAX_KEPT_JOBS = 20;

async function dailyRemainingUsd(maxUsdPerDay: number): Promise<number> {
  return Math.max(0, maxUsdPerDay - (await spentToday()));
}

export async function depsFromSetup(spendUserId: string): Promise<ExplainDeps> {
  const setup = getLlmSetup();
  if (!setup.configured || !setup.provider) {
    throw new HttpError(503, setup.unavailableReason ?? "AI is not configured on this server.");
  }
  const remaining = await dailyRemainingUsd(setup.maxUsdPerDay);
  if (remaining < 0.0001) {
    throw new HttpError(429, `Today's $${setup.maxUsdPerDay.toFixed(2)} AI spending limit is used up. It frees up over the next 24 hours.`);
  }
  return {
    provider: setup.provider,
    checkModel: setup.explainCheckModel,
    checkEffort: setup.checkEffort,
    generationModel: setup.generationModel,
    budgetUsd: Math.min(setup.maxUsdPerRun, remaining),
    maxUsdPerDay: setup.maxUsdPerDay,
    spendUserId,
  };
}

export class ExplainQueue {
  public static isRunning(): boolean {
    return registry.active !== null;
  }

  /** Starts a batch for a paper, or throws HttpError (404 / 503 / 409 / 429). */
  public static async start(paperId: string, userId: string, options: { limit?: number; deps?: ExplainDeps } = {}): Promise<ExplainJobProgress> {
    const paper = validId(paperId) ? await BankRepository.getPaperFor(paperId, userId) : null;
    if (!paper) throw new HttpError(404, "Paper not found.");
    // Batch runs resolve keys from shared evidence only; a private paper's keys belong to its owner.
    if (paper.ownerUserId !== "") {
      throw new HttpError(409, "This paper is private to you: explain its questions one at a time from the review.");
    }
    if (registry.active) {
      throw new HttpError(409, "Another explanation run is in progress. Try again when it finishes.");
    }
    const deps = options.deps ?? (await depsFromSetup(userId));
    const total = (await paperQuestions(paperId, options.limit)).length;
    const progress = createProgress(paperId, total, deps.budgetUsd);
    // Reserve the slot synchronously so a double-click can't start two runs.
    registry.active = progress.jobId;
    registry.jobs.set(progress.jobId, progress);
    while (registry.jobs.size > MAX_KEPT_JOBS) registry.jobs.delete(registry.jobs.keys().next().value!);

    setImmediate(() => {
      runExplainBatch(paperId, deps, { limit: options.limit }, progress)
        .catch((err) => {
          console.error(`[bank explain] Run ${progress.jobId} for ${paperId} crashed:`, err);
          progress.state = "failed";
          progress.message = "The explanation run crashed. Explanations saved so far are kept.";
          progress.finishedAt = new Date().toISOString();
        })
        .finally(() => {
          if (registry.active === progress.jobId) registry.active = null;
        });
    });
    return { ...progress };
  }

  /** A job by id, or the newest job for the paper. */
  public static get(paperId: string, jobId?: string | null): ExplainJobProgress | null {
    if (jobId) {
      const job = registry.jobs.get(jobId);
      return job && job.paperId === paperId ? { ...job, skipped: { ...job.skipped }, problems: [...job.problems] } : null;
    }
    const jobs = [...registry.jobs.values()].filter((j) => j.paperId === paperId);
    const job = jobs[jobs.length - 1];
    return job ? { ...job, skipped: { ...job.skipped }, problems: [...job.problems] } : null;
  }
}

// ------------------------------------------------------------------ single question (learner)
const inFlight = new Map<string, Promise<ExplainOutcome>>();

/**
 * POST /api/bank/questions/[id]/explain for one learner. Uses that learner's own evidence.
 * Only after the learner has committed to the question (the note reveals the key).
 */
export async function explainForLearner(questionId: string, userId: string, depsOverride?: ExplainDeps): Promise<{ explanation: BankExplanation }> {
  const question = validId(questionId) ? await BankRepository.getQuestionFor(questionId, userId) : null;
  if (!question) throw new HttpError(404, "Question not found.");
  if (!(await learnerCommitted(userId, question))) {
    throw new HttpError(403, "Explanations open once you have submitted this question or checked it in practice.");
  }
  const { key } = await resolve(question, userId);
  const cached = explanationFor(await BankRepository.getExplanation(question.id), key);
  if (cached) return { explanation: cached };

  const deps = depsOverride ?? (await depsFromSetup(userId)); // 503 unconfigured / 429 daily cap
  if (!isScored(key.status) || key.answer === null) {
    throw new HttpError(409, "This question has no scored answer key for you, so it cannot be explained.");
  }
  if (needsFigureOrCleanText(question)) {
    throw new HttpError(422, "This question needs its figure or clean text, so it is not explained by AI.");
  }

  const flightKey = `${question.id}:${key.answer}:${userId}`;
  let pending = inFlight.get(flightKey);
  if (!pending) {
    const money: RunMoney = { spentUsd: 0, stop: null };
    pending = explainQuestion({ question, evidenceUserId: userId, deps, money }, { reuseFreshNote: true }).finally(() =>
      inFlight.delete(flightKey)
    );
    inFlight.set(flightKey, pending);
  }
  const outcome = await pending;

  switch (outcome.result) {
    case "cached": {
      const explanation = explanationFor(await BankRepository.getExplanation(question.id), outcome.key);
      if (explanation) return { explanation };
      throw new HttpError(409, "The answer key changed while explaining. Try again.");
    }
    case "explained": {
      const now = (await resolve(question, userId)).key;
      const explanation = explanationFor(
        {
          questionId: question.id,
          lockedAnswer: outcome.note.lockedAnswer,
          note: JSON.stringify(noteJson(outcome.note)),
          model: outcome.model,
          createdAt: outcome.createdAt,
          contentFp: contentFingerprint(question),
        },
        now
      );
      if (!explanation) throw new HttpError(409, "The answer key changed while explaining. Try again.");
      return { explanation };
    }
    case "stopped":
      throw new HttpError(outcome.kind === "fatal" ? 502 : 429, outcome.reason);
    case "skipped":
      if (outcome.disputedByAi) {
        throw new HttpError(
          409,
          "An independent AI solve disagreed with this question's only source key, so it is now disputed and not scored. You can resolve it from the review."
        );
      }
      if (outcome.reason.startsWith("no scored key")) {
        throw new HttpError(409, "This question has no scored answer key for you, so it cannot be explained.");
      }
      if (outcome.reason === SKIP.learnerReviewedKey) {
        throw new HttpError(409, "The key for this question is your own resolution of a dispute, so AI does not explain it as if it were verified.");
      }
      if (outcome.reason === SKIP.blindSolveNoAnswer) {
        throw new HttpError(409, "An independent AI solve found this question incomplete or ambiguous as extracted, so no explanation is written. Check it against the original image.");
      }
      if (outcome.reason === SKIP.noAgreeingSolve) {
        throw new HttpError(409, "An independent AI solve did not reach the key, so no explanation is written: an explanation must not argue for a key an independent solve rejects. The key's sources are shown with the question.");
      }
      throw new HttpError(502, outcome.detail ? `${outcome.reason} (${outcome.detail})` : outcome.reason);
  }
}
