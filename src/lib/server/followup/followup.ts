/**
 * "Ask a follow-up question" and the AI study pack for a question the learner has already answered.
 *
 * Provider (Saurabh, 2026-09-30): Google answers by default; DeepSeek only if a comparison shows it
 * is better (FOLLOWUP_PROVIDER=deepseek). Every AI text is labelled AI-generated in the UI.
 *
 * Syllabus (Saurabh, 2026-09-30): answers stay within the SSC JE syllabus topic the question
 * belongs to, worked out from the previous-year papers (syllabus-context.ts), add the related facts
 * SSC asks, and come with a study pack: the topic, how often SSC asked it, its scope, points worth
 * remembering, and practice questions that a second AI must answer the same way to be shown.
 *
 * Truth rules kept here:
 * - Only after commitment: a bank question the learner has checked or submitted
 *   (learnerCommitted), or a Made Easy question from the owner's own completed tests.
 * - The source key is given to the model as fixed. The model may flag a suspected key error on a
 *   line of its own, but never becomes the key. A learner's own dispute resolution is called that.
 * - Incomplete source text (a missing table, figure or options) is flagged, and the model is told
 *   not to invent it.
 * - Every call reserves its worst case against the server's rolling 24-hour limit first; a call
 *   whose billing can't be known (timeout, unreadable reply) keeps the worst case.
 */
import crypto from "node:crypto";
import { getDatabase } from "../db";
import { BankRepository } from "../repositories/bank-repo";
import { SpendRepository } from "../repositories/spend-repo";
import { learnerCommitted } from "../bank/commitment";
import { contentFingerprint } from "../bank/content-fp";
import { toQuestionForAttempt } from "../bank/views";
import { HttpError } from "../bank/http";
import { isScored, type ResolvedKey } from "../../bank/answer-key";
import { optionLabel, textReliable } from "../../../components/bank/optionOrder";
import { canReadMadeEasy, madeEasyQuestion } from "../made-easy";
import { getLlmSetup } from "../llm";
import { DeepSeekProvider, DEEPSEEK_MAX_ATTEMPTS } from "../llm/deepseek";
import { costUsd } from "../generation/pricing";
import { LlmError, type LlmProvider, type LlmUsage } from "../llm/types";
import { GeminiError, geminiGenerate, type GeminiImage, type GeminiRequest, type GeminiResult, type GeminiTurn, type GeminiUsage } from "./gemini";
import { sourceHtmlImages } from "../source-html";
import { syllabusContext, type SyllabusContext, type TopicCandidate } from "./syllabus-context";

export type FollowUpContextKind = "made_easy" | "bank";
export type ProviderName = "google" | "deepseek";

export interface FollowUpTurn {
  role: "user" | "model";
  text: string;
}

export interface StudyPackQuestion {
  question: string;
  options: { id: string; text: string }[];
  answer: string;
  explanation: string;
  /** A second AI answered it the same way without seeing this answer. */
  crossChecked: boolean;
}

export interface StudyPack {
  topic: { nodeId: string; path: string; pypCount: number; years: number[] } | null;
  /** How the topic was found: the question's own tags, or similar past SSC questions. */
  topicBasis: "own_tags" | "similar_past_questions" | "none";
  similarPastQuestions: { count: number; years: number[] };
  scope: string;
  examPoints: string[];
  practice: StudyPackQuestion[];
  generatedBy: string;
  checkedBy: string | null;
  createdAt: string;
}

export interface FollowUpAnswer {
  answer: string;
  provider: ProviderName;
  model: string;
  grounded: boolean;
  sources: { title: string; uri: string }[];
  searchEntryPointHtml: string | null;
  aiGenerated: true;
  pack: StudyPack | null;
  /** The pack is still being made: poll /api/ai/study-pack. */
  packPending: boolean;
}

export const MAX_MESSAGE_CHARS = 1500;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 1_500_000;
/** Prompt tokens reserved per attached image (Gemini bills images as input; generous on purpose). */
const IMAGE_TOKENS = 2000;
export const MAX_HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 6000;
/** Thinking plus answer (verified: Gemini counts thoughts inside it); generous so a MEDIUM think doesn't cut the answer off. */
const MAX_OUTPUT_TOKENS = 8192;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- facts

interface Facts {
  kind: FollowUpContextKind;
  id: string;
  heading: string;
  question: string;
  options: { label: string; text: string }[];
  key: string | null;
  keySource: string;
  learnerAnswer: string | null;
  explanation: string | null;
  incomplete: string | null;
  /** What the study pack was made for: content, and for the bank also the key. */
  contentFp: string;
  subjectHint: string | undefined;
  ownQuestionId: string | undefined;
  /** Source images, in order, with where each appears ("in the question", "option B"...). */
  images: { url: string; where: string }[];
}

function sha(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

function madeEasyFacts(userId: string, id: string): Facts {
  if (!canReadMadeEasy(userId)) throw new HttpError(403, "These Made Easy results belong to another account.");
  const q = madeEasyQuestion(id);
  if (!q) throw new HttpError(404, "No such Made Easy question.");
  const options = q.options.map((o) => ({ label: o.id, text: o.text }));
  const keyText = options.find((o) => o.label === q.correctOption)?.text ?? "";
  return {
    kind: "made_easy",
    id,
    heading: `Made Easy ${q.testCode.replace("test-", "Test ")}, Q${q.number} (${q.testTitle})`,
    question: q.question,
    options,
    key: `${q.correctOption}${keyText ? ` (${keyText})` : ""}`,
    keySource: "the Made Easy test series' answer key",
    learnerAnswer: q.selectedOption,
    explanation: q.explanation.trim() || null,
    incomplete:
      q.sourceQuality === "visual_review_required"
        ? "Part of this question (a table, figure, formula or the option text) was an image that was not captured, so the text below is incomplete."
        : null,
    contentFp: sha(JSON.stringify([q.question, q.options, q.correctOption, q.explanation, q.sourceQuality, q.questionHtml ?? "", q.optionsHtml ?? []])),
    subjectHint: q.testTitle,
    ownQuestionId: undefined,
    images: [
      ...sourceHtmlImages(q.questionHtml ?? "").map((url) => ({ url, where: "in the question" })),
      ...(q.optionsHtml ?? []).flatMap((html, i) => sourceHtmlImages(html).map((url) => ({ url, where: `option ${q.options[i]?.id ?? i + 1}` }))),
      ...sourceHtmlImages(q.explanationHtml ?? "").map((url) => ({ url, where: "in the source explanation" })),
    ].slice(0, MAX_IMAGES),
  };
}

function bankFacts(userId: string, id: string): Facts {
  const q = BankRepository.getQuestionFor(id, userId);
  if (!q) throw new HttpError(404, "No such question.");
  if (!learnerCommitted(userId, q)) throw new HttpError(403, "Answer this question first; follow-up questions open after you check or submit it.");
  const key: ResolvedKey = BankRepository.resolveKeysForQuestions([q], userId).get(q.id)!;
  const view = toQuestionForAttempt(q, key, true);
  const label = (optionId: string) => optionLabel(view, optionId);
  const options = q.options.map((o) => ({ label: label(o.id), text: o.text }));
  const scored = isScored(key.status) && key.answer !== null;
  const keyText = scored ? options.find((o) => o.label === label(key.answer!))?.text ?? "" : "";
  const paper = BankRepository.getPaperFor(q.paperId, userId);
  const keySource = !scored
    ? `no settled key: ${key.status}`
    : key.status === "reviewed"
      ? "the learner's own resolution of a dispute between sources (not a verified source key)"
      : `the source key (${key.basis.map((b) => b.sourceLabel).join("; ") || key.status})`;
  return {
    kind: "bank",
    id,
    heading: `${paper?.title ?? "Question bank"}, ${q.section} Q${q.position}`,
    question: q.stem,
    options,
    key: scored ? `${label(key.answer!)}${keyText ? ` (${keyText})` : ""}` : null,
    keySource,
    learnerAnswer: null,
    explanation: q.sourceSolution?.trim() || null,
    incomplete: textReliable(view) ? null : "The typed text below was machine-read from a scanned page and may contain errors or gaps; the learner sees the printed image.",
    contentFp: `${contentFingerprint(q)}:${key.status}:${key.answer ?? ""}:${sha(q.sourceSolution ?? "")}`,
    subjectHint: undefined,
    ownQuestionId: q.id,
    images: [],
  };
}

function factsFor(userId: string, kind: unknown, id: unknown): Facts {
  if (kind !== "made_easy" && kind !== "bank") throw new HttpError(400, "Unknown question source.");
  if (typeof id !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) throw new HttpError(400, "Question id required.");
  return kind === "made_easy" ? madeEasyFacts(userId, id) : bankFacts(userId, id);
}

function factsBlock(f: Facts, imagesAttached = false): string {
  const imageNote = !f.images.length
    ? null
    : imagesAttached
      ? `IMAGES: ${f.images.length} source image(s) are attached, in order: ${f.images.map((img, i) => `${i + 1} = ${img.where}`).join("; ")}. "[image]" in the text marks where each appears. Read them; they are part of the question.`
      : `IMAGES: parts of this question are images you cannot see ("[image]"). If the answer depends on them, say so instead of guessing.`;
  const lines = [
    `QUESTION (${f.heading})`,
    f.incomplete ? `NOTE: ${f.incomplete}` : null,
    imageNote,
    f.question || "(question text missing)",
    "",
    "OPTIONS",
    ...f.options.map((o) => `${o.label}. ${o.text || "(text missing)"}`),
    "",
    f.key ? `ANSWER KEY: ${f.key}, from ${f.keySource}.` : `ANSWER KEY: none (${f.keySource}). Do not pick one as the key.`,
    f.learnerAnswer ? `The learner originally chose ${f.learnerAnswer}.` : null,
    f.explanation ? `SOURCE EXPLANATION: ${f.explanation}` : null,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function yearsText(years: number[]): string {
  if (!years.length) return "";
  return years.length === 1 ? ` in ${years[0]}` : ` in ${years[0]}–${years[years.length - 1]}`;
}

function syllabusBlock(ctx: SyllabusContext): string {
  if (!ctx.candidates.length) return "SSC JE SYLLABUS (2026): no matching topic was found in the previous-year papers.";
  return [
    "SSC JE SYLLABUS (2026 notice): likely topic(s), from the previous-year papers in the learner's app:",
    ...ctx.candidates.slice(0, 3).map((c) => `- ${c.path}: SSC asked about ${c.pypCount} question(s) on it${yearsText(c.years)}.`),
  ].join("\n");
}

const SYSTEM = [
  "You are a tutor for India's SSC JE Civil Engineering exam. The learner has already answered the question below and is asking a follow-up question about it.",
  "Rules:",
  "- Answer the learner's question directly and concisely, focused on what the SSC JE exam tests. For numericals, show the formula, units and steps.",
  "- Stay within the SSC JE syllabus topic given below. After answering, add a short part headed \"Also asked in the exam:\" with 2-4 closely related facts, values or distinctions SSC asks on this topic, so the learner can score on similar questions.",
  "- The answer key given is from the named source. Do not replace it. If you are confident it is wrong, add one separate line starting \"Possible key error:\" with your reason; never present your own choice as the key.",
  "- If the question is marked incomplete (a table, figure or options missing), say what is missing and do not invent it.",
  "- If you are not sure, say so rather than guess. Do not invent IS-code clause numbers, page numbers, book titles or quotations.",
  "- Reply in the language the learner writes in (English or Hindi). Plain text only, no Markdown tables. Keep it under about 300 words unless a derivation needs more.",
].join("\n");

// ---------------------------------------------------------------- money and providers

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
/** Listed for this key on 2026-09-30 (preview; $2/$12 per 1M tokens). */
const DEFAULT_GEMINI_CHECK_MODEL = "gemini-3.1-pro-preview";

/** USD per 1M tokens. Source: ai.google.dev/gemini-api/docs/pricing, checked 2026-09-30. */
const GEMINI_PRICES: Record<string, { input: number; output: number; introUntil?: string; intro?: { input: number; output: number } }> = {
  "gemini-3.8-flash": { input: 1.5, output: 7.5, introUntil: "2027-01-01", intro: { input: 0.75, output: 3.75 } },
  "gemini-3.7-flash": { input: 1.5, output: 7.5, introUntil: "2027-01-01", intro: { input: 0.75, output: 3.75 } },
  "gemini-3.6-flash": { input: 1.5, output: 7.5, introUntil: "2027-01-01", intro: { input: 0.75, output: 3.75 } },
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-pro-preview": { input: 2, output: 12 },
};
/** Unknown models are costed at the dearest listed rate (3.1 Pro above 200k tokens). */
const GEMINI_FALLBACK = { input: 4, output: 18 };
/** Grounding: 5,000 free searches a month, then $14 per 1,000; the free quota isn't tracked, so every search is charged. */
const SEARCH_USD = 0.014;
const WORST_CASE_SEARCHES = 10;

export function geminiCostUsd(model: string, usage: GeminiUsage, at: Date = new Date()): number {
  const p = GEMINI_PRICES[model];
  const rate = p ? (p.intro && p.introUntil && at < new Date(p.introUntil) ? p.intro : p) : GEMINI_FALLBACK;
  return (usage.promptTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000 + usage.searchQueries * SEARCH_USD;
}

/** The most one Gemini attempt can bill, at post-introductory rates: never under-reserve. */
export function geminiWorstUsd(model: string, request: Pick<GeminiRequest, "system" | "turns" | "grounded" | "maxOutputTokens">): number {
  const p = GEMINI_PRICES[model];
  const rate = p ? { input: p.input, output: p.output } : GEMINI_FALLBACK;
  const promptChars = request.system.length + request.turns.reduce((n, t) => n + t.text.length, 0);
  const imageTokens = request.turns.reduce((n, t) => n + (t.images?.length ?? 0), 0) * IMAGE_TOKENS;
  const outputTokens = request.maxOutputTokens;
  return ((Math.ceil(promptChars / 3) + imageTokens) * rate.input + outputTokens * rate.output) / 1_000_000 + (request.grounded ? WORST_CASE_SEARCHES * SEARCH_USD : 0);
}

function reserve(userId: string, model: string, usd: number, capUsd: number): string {
  const id = SpendRepository.reserve({ userId, model, usd, capUsd, since: new Date(Date.now() - DAY_MS) });
  if (!id) throw new HttpError(429, `The server's $${capUsd.toFixed(2)} 24-hour AI spending limit is used up. Try again later.`);
  return id;
}

export interface FollowUpDeps {
  provider: ProviderName;
  googleKey: string | null;
  geminiModel: string;
  deepseek: LlmProvider | null;
  deepseekModel: string;
  /** A second Google model that checks practice questions when DeepSeek isn't set up (null: none). */
  geminiCheckModel: string | null;
  capUsd: number;
  gemini: (apiKey: string, request: GeminiRequest) => Promise<GeminiResult>;
  /** Fetches one source image (allowlisted host only); null when it can't be used. */
  fetchImage: (url: string) => Promise<GeminiImage | null>;
}

/** The portal's public image host: the only place source images are fetched from. */
const IMAGE_HOST = /^https:\/\/cdnstatic\.madeeasyprime\.com\//;

async function fetchSourceImage(url: string): Promise<GeminiImage | null> {
  if (!IMAGE_HOST.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return { mimeType: type, data: bytes.toString("base64") };
  } catch {
    return null;
  }
}

async function loadImages(deps: FollowUpDeps, f: Facts): Promise<GeminiImage[] | null> {
  if (!f.images.length) return [];
  const images = await Promise.all(f.images.map((img) => deps.fetchImage(img.url)));
  // All or nothing: a partial set would shift the numbering the prompt describes.
  return images.every((img): img is GeminiImage => img !== null) ? images : null;
}

export function followUpDeps(): FollowUpDeps {
  const setup = getLlmSetup();
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() || null;
  return {
    provider: (process.env.FOLLOWUP_PROVIDER || "google").trim().toLowerCase() === "deepseek" ? "deepseek" : "google",
    googleKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || null,
    geminiModel: process.env.GEMINI_FOLLOWUP_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    deepseek: deepseekKey ? new DeepSeekProvider(deepseekKey) : null,
    deepseekModel: process.env.DEEPSEEK_FOLLOWUP_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
    geminiCheckModel: process.env.GEMINI_CHECK_MODEL?.trim() || DEFAULT_GEMINI_CHECK_MODEL,
    capUsd: setup.maxUsdPerDay,
    gemini: geminiGenerate,
    fetchImage: fetchSourceImage,
  };
}

function available(deps: FollowUpDeps, provider: ProviderName): boolean {
  return provider === "google" ? deps.googleKey !== null : deps.deepseek !== null;
}

function notSetUp(provider: ProviderName): HttpError {
  return provider === "google"
    ? new HttpError(503, "Follow-up answers use Google Gemini, which is not set up yet: add GOOGLE_GENERATIVE_AI_API_KEY (from a billed Google Cloud project) to .env.local and restart the app.")
    : new HttpError(503, "DeepSeek is not set up: DEEPSEEK_API_KEY is missing from .env.local.");
}

/**
 * One Gemini request, reserved and settled. With `retryWithoutSearch`, a refusal of the Search
 * tool (e.g. no billing) is answered once more without it.
 */
async function callGemini(deps: FollowUpDeps, userId: string, request: GeminiRequest, retryWithoutSearch: boolean): Promise<GeminiResult> {
  if (!deps.googleKey) throw notSetUp("google");
  const retry = retryWithoutSearch && request.grounded;
  const worst = geminiWorstUsd(request.model, request) + (retry ? geminiWorstUsd(request.model, { ...request, grounded: false }) : 0);
  const reservation = reserve(userId, request.model, worst, deps.capUsd);
  let usageKnown = true;
  let billed = 0;
  try {
    let result: GeminiResult;
    try {
      result = await deps.gemini(deps.googleKey, request);
    } catch (err) {
      if (!(err instanceof GeminiError) || !err.groundingUnavailable || !retry) throw err;
      billed += err.usage ? geminiCostUsd(request.model, err.usage) : 0;
      result = await deps.gemini(deps.googleKey, { ...request, grounded: false });
    }
    billed += geminiCostUsd(request.model, result.usage);
    usageKnown = result.usageKnown;
    // A reply without usage figures keeps the worst case: what it billed is unknown.
    if (usageKnown) SpendRepository.settle(reservation, billed);
    return result;
  } catch (err) {
    if (err instanceof GeminiError) {
      // Unknown billing (timeout, unreadable reply) keeps the worst case reserved.
      if (!err.billingUnknown) SpendRepository.settle(reservation, billed + (err.usage ? geminiCostUsd(request.model, err.usage) : 0));
      if (err.keyRejected) {
        throw new HttpError(503, "Google rejected the API key (it may be invalid, deleted, or not a Gemini API key). Create one at aistudio.google.com/app/apikey, put it in .env.local as GOOGLE_GENERATIVE_AI_API_KEY and restart the app.");
      }
      throw new HttpError(502, `Google could not answer: ${err.message}`);
    }
    throw err; // unknown failure: the reservation stays at the worst case
  }
}

/** One DeepSeek JSON request, reserved and settled like explain.ts callModel. */
async function callDeepSeek(deps: FollowUpDeps, userId: string, system: string, user: string): Promise<{ json: unknown; model: string }> {
  if (!deps.deepseek) throw notSetUp("deepseek");
  const request = { model: deps.deepseekModel, system, user, thinking: true, maxTokens: MAX_OUTPUT_TOKENS };
  const peak = new Date(Date.UTC(2026, 0, 5, 7));
  const worst: LlmUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: Math.ceil((system.length + user.length) / 3), completionTokens: MAX_OUTPUT_TOKENS, reasoningTokens: 0 };
  const reservation = reserve(userId, request.model, DEEPSEEK_MAX_ATTEMPTS * costUsd(request.model, worst, peak), deps.capUsd);
  try {
    const result = await deps.deepseek.completeJson(request);
    SpendRepository.settle(reservation, costUsd(request.model, result.usage));
    return { json: result.json, model: result.model };
  } catch (err) {
    if (err instanceof LlmError) {
      SpendRepository.settle(reservation, err.usage ? costUsd(request.model, err.usage) : 0);
      throw new HttpError(err.fatal ? 503 : 502, `DeepSeek could not answer: ${err.message}`);
    }
    throw err;
  }
}

/** A JSON reply from either provider (no web search). Images go to Gemini only. */
async function askJson(deps: FollowUpDeps, provider: ProviderName, userId: string, system: string, user: string, images: GeminiImage[] = [], model = deps.geminiModel): Promise<{ json: unknown; model: string }> {
  if (provider === "deepseek") return callDeepSeek(deps, userId, system, user);
  const result = await callGemini(deps, userId, { model, system, turns: [{ role: "user", text: user, images }], grounded: false, json: true, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingLevel: "MEDIUM" }, false);
  try {
    return { json: JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, "")), model };
  } catch {
    throw new HttpError(502, "Google returned a study pack that was not valid JSON.");
  }
}

// ---------------------------------------------------------------- study pack

const PACK_SYSTEM = [
  "You prepare study material for India's SSC JE Civil Engineering exam (2026 syllabus). Output JSON only.",
  "You get: a question the learner has answered (with its source key), the SSC JE syllabus topics it most likely belongs to (with how often SSC asked each in previous years), and similar previous-year SSC questions.",
  "Return exactly this JSON shape:",
  '{"topicId": "<one id copied from the TOPICS list, or null if none fits>", "scope": "<2-3 sentences: what this topic covers in the SSC JE syllabus and what kinds of questions SSC asks on it>", "examPoints": ["<3-6 short, exam-relevant facts, values, formulas or distinctions for this topic that are often asked>"], "practice": [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "A|B|C|D", "explanation": "<why the answer is right and the others wrong, briefly>"}]}',
  "Rules: exactly 3 practice questions, each with exactly 4 options and one correct answer, in SSC JE style and on the same topic but not copies of the given questions. Only facts you are sure of; standard values and textbook results only; no invented IS-code clause numbers. If the question is marked incomplete, do not invent the missing part.",
].join("\n");

const CHECK_SYSTEM = [
  "You are checking practice questions for India's SSC JE Civil Engineering exam. Answer each question yourself. Output JSON only:",
  '{"answers": ["A|B|C|D or null if no option is correct or more than one is"]}, one entry per question, in order.',
].join("\n");

function packPrompt(f: Facts, ctx: SyllabusContext, imagesAttached: boolean): string {
  const topics = ctx.candidates.length
    ? ctx.candidates.map((c: TopicCandidate) => `- id: ${c.nodeId}\n  path: ${c.path}\n  official wording: ${c.officialText || "(none)"}\n  SSC asked: ${c.pypCount} question(s)${yearsText(c.years)}`).join("\n")
    : "(no topics found)";
  const similar = ctx.similar.filter((s) => s.stem.trim()).slice(0, 4).map((s) => `- (${s.year ?? "year unknown"}) ${s.stem.replace(/\s+/g, " ").slice(0, 260)}`).join("\n");
  return `${factsBlock(f, imagesAttached)}\n\nTOPICS\n${topics}\n\nSIMILAR PREVIOUS-YEAR SSC QUESTIONS\n${similar || "(none found)"}`;
}

const LETTERS = ["A", "B", "C", "D"];

function asText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function parsePack(json: unknown, ctx: SyllabusContext): { topicId: string | null; scope: string; examPoints: string[]; practice: Omit<StudyPackQuestion, "crossChecked">[] } {
  const j = (json ?? {}) as Record<string, unknown>;
  const scope = asText(j.scope, 700);
  if (!scope) throw new HttpError(502, "The study pack came back without a scope.");
  const examPoints = (Array.isArray(j.examPoints) ? j.examPoints : []).map((p) => asText(p, 300)).filter((p): p is string => p !== null).slice(0, 6);
  const practice = (Array.isArray(j.practice) ? j.practice : [])
    .map((raw) => {
      const p = (raw ?? {}) as Record<string, unknown>;
      const question = asText(p.question, 800);
      const options = Array.isArray(p.options) ? p.options.map((o) => asText(o, 300)) : [];
      const answer = typeof p.answer === "string" ? p.answer.trim().toUpperCase() : "";
      const explanation = asText(p.explanation, 900);
      if (!question || options.length !== 4 || options.some((o) => o === null) || !LETTERS.includes(answer) || !explanation) return null;
      return { question, options: options.map((text, i) => ({ id: LETTERS[i], text: text! })), answer, explanation };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .slice(0, 3);
  const topicId = typeof j.topicId === "string" && ctx.candidates.some((c) => c.nodeId === j.topicId) ? j.topicId : null;
  return { topicId, scope, examPoints, practice };
}

function cachedPack(f: Facts): StudyPack | null {
  const row = getDatabase()
    .prepare("SELECT pack FROM ai_study_packs WHERE kind = ? AND question_id = ? AND content_fp = ?")
    .get(f.kind, f.id, f.contentFp) as { pack: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.pack) as StudyPack;
  } catch {
    return null;
  }
}

function contextFor(f: Facts): SyllabusContext {
  const text = `${f.question} ${f.options.map((o) => o.text).join(" ")} ${f.explanation ?? ""}`;
  return syllabusContext(text, f.ownQuestionId, f.subjectHint);
}

async function generatePack(deps: FollowUpDeps, userId: string, f: Facts, ctx: SyllabusContext): Promise<StudyPack> {
  const generator = deps.provider;
  if (!available(deps, generator)) throw notSetUp(generator);
  const images = generator === "google" ? await loadImages(deps, f) : null;
  const made = await askJson(deps, generator, userId, PACK_SYSTEM, packPrompt(f, ctx, images !== null && images.length > 0), images ?? []);
  const parsed = parsePack(made.json, ctx);

  // A second AI answers the practice questions blind; only questions it answers the same way stay.
  // The checker is the other provider; without it, a different Google model (less independent, still a second model).
  const checker: { provider: ProviderName; model?: string } | null =
    generator === "google"
      ? deps.deepseek ? { provider: "deepseek" } : deps.geminiCheckModel && deps.geminiCheckModel !== deps.geminiModel ? { provider: "google", model: deps.geminiCheckModel } : null
      : deps.googleKey ? { provider: "google" } : null;
  let practice: StudyPackQuestion[] = parsed.practice.map((p) => ({ ...p, crossChecked: false }));
  let checkedBy: string | null = null;
  if (parsed.practice.length && checker) {
    try {
      const questions = parsed.practice.map((p, i) => `Q${i + 1}. ${p.question}\n${p.options.map((o) => `${o.id}. ${o.text}`).join("\n")}`).join("\n\n");
      const checked = await askJson(deps, checker.provider, userId, CHECK_SYSTEM, questions, [], checker.model);
      const answers = (checked.json as { answers?: unknown })?.answers;
      if (Array.isArray(answers)) {
        practice = parsed.practice.filter((p, i) => answers[i] === p.answer).map((p) => ({ ...p, crossChecked: true }));
        checkedBy = checked.model;
      }
    } catch {
      // The checker failed: keep the questions, marked not cross-checked.
    }
  }

  const topic = parsed.topicId ? ctx.candidates.find((c) => c.nodeId === parsed.topicId)! : null;
  const years = [...new Set(ctx.similar.map((s) => s.year).filter((y): y is number => y !== null))].sort();
  const pack: StudyPack = {
    topic: topic ? { nodeId: topic.nodeId, path: topic.path, pypCount: topic.pypCount, years: topic.years } : null,
    topicBasis: topic ? (ctx.fromOwnTags ? "own_tags" : "similar_past_questions") : "none",
    similarPastQuestions: { count: ctx.similar.length, years },
    scope: parsed.scope,
    examPoints: parsed.examPoints,
    practice,
    generatedBy: made.model,
    checkedBy,
    createdAt: new Date().toISOString(),
  };
  // A pack with no usable practice questions is shown but not kept, so the next request tries again.
  if (practice.length) {
    getDatabase()
      .prepare("INSERT OR REPLACE INTO ai_study_packs (kind, question_id, content_fp, pack, model, checker, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(f.kind, f.id, f.contentFp, JSON.stringify(pack), made.model, checkedBy, pack.createdAt);
  }
  return pack;
}

// Packs are made in the background: the answer never waits for them, and one pack per content is
// made at a time (a second request joins the first). Failures are remembered briefly for polling.
const inFlight = new Map<string, Promise<StudyPack>>();
const recentFailures = new Map<string, { message: string; at: number }>();
const FAILURE_MEMORY_MS = 10 * 60 * 1000;

function packKey(f: Facts): string {
  return `${f.kind}|${f.id}|${f.contentFp}`;
}

/** What a learner may see of an error: our own messages, never internals. */
function publicMessage(err: unknown): string {
  return err instanceof HttpError ? err.message : "Could not prepare the topic and practice questions. Try again later.";
}

function startPack(deps: FollowUpDeps, userId: string, f: Facts, ctx?: SyllabusContext): Promise<StudyPack> {
  const k = packKey(f);
  const running = inFlight.get(k);
  if (running) return running;
  recentFailures.delete(k);
  const job = generatePack(deps, userId, f, ctx ?? contextFor(f))
    .catch((err: unknown) => {
      recentFailures.set(k, { message: publicMessage(err), at: Date.now() });
      if (!(err instanceof HttpError)) console.error("[study pack]", err);
      throw err;
    })
    .finally(() => inFlight.delete(k));
  job.catch(() => {}); // callers that don't wait must not cause an unhandled rejection
  inFlight.set(k, job);
  return job;
}

/** Waits for every pack being made (scripts and tests). */
export async function waitForStudyPacks(): Promise<void> {
  await Promise.allSettled([...inFlight.values()]);
}

export interface StudyPackStatus {
  pack: StudyPack | null;
  /** Being made now: ask again (without generate) in a few seconds. */
  pending: boolean;
  /** The last attempt failed (within the last 10 minutes). */
  error: string | null;
}

/**
 * The study pack for this question: the stored one (free), or, with `generate`, start making it
 * and return pending. `wait` (scripts and tests only) waits for the result instead.
 */
export async function studyPack(
  userId: string,
  input: { kind: unknown; id: unknown; generate?: unknown },
  deps: FollowUpDeps = followUpDeps(),
  options: { wait?: boolean } = {}
): Promise<StudyPackStatus> {
  const f = factsFor(userId, input.kind, input.id);
  const cached = cachedPack(f);
  if (cached) return { pack: cached, pending: false, error: null };
  const k = packKey(f);
  if (!inFlight.has(k) && input.generate === true) {
    if (!available(deps, deps.provider)) throw notSetUp(deps.provider);
    startPack(deps, userId, f);
  }
  const running = inFlight.get(k);
  if (running && options.wait) {
    try {
      return { pack: await running, pending: false, error: null };
    } catch (err) {
      return { pack: null, pending: false, error: publicMessage(err) };
    }
  }
  if (running) return { pack: null, pending: true, error: null };
  const failure = recentFailures.get(k);
  return { pack: null, pending: false, error: failure && Date.now() - failure.at < FAILURE_MEMORY_MS ? failure.message : null };
}

// ---------------------------------------------------------------- follow-up answer

function parseTurns(value: unknown): FollowUpTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_TURNS) throw new HttpError(400, `History must be a list of at most ${MAX_HISTORY_TURNS} turns.`);
  return value.map((t) => {
    const turn = t as Partial<FollowUpTurn>;
    if ((turn.role !== "user" && turn.role !== "model") || typeof turn.text !== "string" || !turn.text.trim() || turn.text.length > MAX_TURN_CHARS) {
      throw new HttpError(400, "Each history turn needs a role (user or model) and its text.");
    }
    return { role: turn.role, text: turn.text };
  });
}

async function answerWith(deps: FollowUpDeps, userId: string, turns: GeminiTurn[]): Promise<Omit<FollowUpAnswer, "pack" | "packPending">> {
  if (deps.provider === "deepseek") {
    const transcript = turns.map((t) => `${t.role === "user" ? "LEARNER" : "TUTOR"}:\n${t.text}`).join("\n\n");
    const { json, model } = await callDeepSeek(deps, userId, `${SYSTEM}\nReturn JSON: {"answer": "<your reply to the learner's last message>"}.`, transcript);
    const answer = typeof (json as { answer?: unknown })?.answer === "string" ? (json as { answer: string }).answer.trim() : "";
    if (!answer) throw new HttpError(502, "DeepSeek returned no answer.");
    return { answer, provider: "deepseek", model, grounded: false, sources: [], searchEntryPointHtml: null, aiGenerated: true };
  }
  const result = await callGemini(deps, userId, { model: deps.geminiModel, system: SYSTEM, turns, grounded: true, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingLevel: "MEDIUM" }, true);
  return {
    answer: result.text,
    provider: "google",
    model: deps.geminiModel,
    grounded: result.grounded,
    sources: result.sources,
    searchEntryPointHtml: result.grounded ? result.searchEntryPointHtml : null,
    aiGenerated: true,
  };
}

export async function askFollowUp(
  userId: string,
  input: { kind: unknown; id: unknown; message: unknown; history?: unknown },
  deps: FollowUpDeps = followUpDeps()
): Promise<FollowUpAnswer> {
  if (typeof input.message !== "string" || !input.message.trim()) throw new HttpError(400, "Type a question first.");
  if (input.message.length > MAX_MESSAGE_CHARS) throw new HttpError(400, `Keep the question under ${MAX_MESSAGE_CHARS} characters.`);
  const history = parseTurns(input.history);
  if (history.length % 2 !== 0 || history.some((t, i) => t.role !== (i % 2 === 0 ? "user" : "model"))) {
    throw new HttpError(400, "History must alternate learner and AI turns, starting with the learner.");
  }
  const facts = factsFor(userId, input.kind, input.id);
  if (!available(deps, deps.provider)) throw notSetUp(deps.provider);
  const ctx = contextFor(facts);

  // The source facts and syllabus ride on the first learner turn; the model never gets them from the browser.
  // Gemini also gets the question's source images (Made Easy tables and figures); DeepSeek is told it can't see them.
  const images = deps.provider === "google" ? await loadImages(deps, facts) : null;
  const attached = images !== null && images.length > 0;
  const asked = [...history, { role: "user" as const, text: input.message.trim() }];
  const turns: GeminiTurn[] = asked.map((t, i) =>
    i === 0
      ? { role: "user", text: `${factsBlock(facts, attached)}\n\n${syllabusBlock(ctx)}\n\nLEARNER'S QUESTION: ${t.text}`, images: attached ? images! : undefined }
      : t
  );

  // The study pack is made in the background the first time; the answer never waits for it.
  const existing = cachedPack(facts);
  if (!existing) startPack(deps, userId, facts, ctx);
  const answer = await answerWith(deps, userId, turns);
  return { ...answer, pack: existing, packPending: !existing && inFlight.has(packKey(facts)) };
}
