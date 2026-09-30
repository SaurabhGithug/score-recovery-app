import fs from "node:fs";
import path from "node:path";
import { DocumentRepository } from "../repositories/document-repo";
import { QuestionRepository } from "../repositories/question-repo";
import { LlmProvider, LlmUsage, LlmError, addUsage, emptyUsage } from "../llm/types";
import { chunkPages, MaterialChunk, SourcePage } from "./chunker";
import { checkGrounding, normalizeForMatch } from "./grounding";
import { parseCandidates, parseVerdicts, QuestionCandidate } from "./candidates";
import {
  BlindQuestion,
  generationSystemPrompt,
  generationUserPrompt,
  PROMPT_VERSION,
  VERIFICATION_SYSTEM_PROMPT,
  verificationUserPrompt,
} from "./prompts";
import { costUsd } from "./pricing";

/**
 * Generates practice questions from a document's parsed pages:
 *   split into sections → model writes questions with a proof quote → deterministic checks
 *   → proof quote must exist on the page → a second model re-solves each question without
 *   the answer key → agreement = ready for practice, disagreement = student review queue.
 * Questions are written to the library per section, so progress survives a crash.
 */

export type GenerationStatus = "RUNNING" | "DONE" | "FAILED" | "BUDGET_REACHED" | "INTERRUPTED";

export interface GenerationSummary {
  status: GenerationStatus;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  pageFrom: number;
  pageTo: number;
  questionsPerPage: number;
  sectionsTotal: number;
  sectionsDone: number;
  sectionsFailed: number;
  ready: number;
  needsReview: number;
  rejected: number;
  duplicates: number;
  rejectionReasons: Record<string, number>;
  rejectedSamples: { stem: string; reason: string }[];
  provider: string;
  generationModel: string;
  checkModel: string;
  promptVersion: string;
  usage: { generation: LlmUsage; check: LlmUsage };
  costUsd: number;
  budgetUsd: number;
}

export interface GenerationRequest {
  documentId: string;
  userId: string;
  preparationContextId: string | null;
  examName: string | null;
  pageFrom: number;
  pageTo: number;
  questionsPerPage: number;
}

export interface GenerationDeps {
  provider: LlmProvider;
  generationModel: string;
  checkModel: string;
  checkEffort?: "low" | "high" | "max";
  budgetUsd: number;
  onUpdate?: (summary: GenerationSummary) => void;
  /** Called with the dollar cost of every billed call, including failed ones. */
  onSpend?: (model: string, usd: number) => void;
}

const CONCURRENCY = 3;
const MAX_QUESTIONS_PER_SECTION = 15;
/** Questions per blind-check call: keeps each thinking call short and well under max_tokens. */
const CHECK_BATCH_SIZE = 5;
/** A typical printed book page holds ~2,000-2,500 characters. */
const CHARS_PER_BOOK_PAGE = 2500;
const MAX_REJECTED_SAMPLES = 8;

export async function loadSourcePages(documentId: string, pageFrom: number, pageTo: number): Promise<SourcePage[]> {
  return (await DocumentRepository.getPages(documentId))
    .filter((p) => p.page_number >= pageFrom && p.page_number <= pageTo)
    .map((p) => ({
      pageNumber: p.page_number,
      text: (p.raw_text || p.markdown || "").trim(),
      confidence: p.confidence ?? 1,
    }));
}

/** How many questions to ask for from one section, scaled by how much text it holds. */
export function questionTarget(chunk: MaterialChunk, questionsPerPage: number): number {
  const distinctPages = new Set(chunk.pages.map((p) => p.pageNumber)).size;
  const equivalentPages = Math.max(distinctPages, Math.round(chunk.charCount / CHARS_PER_BOOK_PAGE));
  return Math.min(MAX_QUESTIONS_PER_SECTION, Math.max(1, Math.round(equivalentPages * questionsPerPage)));
}

function cropFor(documentId: string, page: number): string | null {
  const name = `${documentId}_p${page}.png`;
  return fs.existsSync(path.resolve(process.cwd(), "data", "storage", "crops", name)) ? name : null;
}

export function createSummary(
  req: GenerationRequest,
  deps: Omit<GenerationDeps, "onUpdate">,
  sectionsTotal: number
): GenerationSummary {
  return {
    status: "RUNNING",
    message: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pageFrom: req.pageFrom,
    pageTo: req.pageTo,
    questionsPerPage: req.questionsPerPage,
    sectionsTotal,
    sectionsDone: 0,
    sectionsFailed: 0,
    ready: 0,
    needsReview: 0,
    rejected: 0,
    duplicates: 0,
    rejectionReasons: {},
    rejectedSamples: [],
    provider: deps.provider.name,
    generationModel: deps.generationModel,
    checkModel: deps.checkModel,
    promptVersion: PROMPT_VERSION,
    usage: { generation: emptyUsage(), check: emptyUsage() },
    costUsd: 0,
    budgetUsd: deps.budgetUsd,
  };
}

export async function runGeneration(req: GenerationRequest, deps: GenerationDeps): Promise<GenerationSummary> {
  const chunks = chunkPages(await loadSourcePages(req.documentId, req.pageFrom, req.pageTo));

  const summary = createSummary(req, deps, chunks.length);
  const publish = () => deps.onUpdate?.({ ...summary });

  if (chunks.length === 0) {
    summary.status = "FAILED";
    summary.message = "No readable text in the selected pages (pages may be blank, images only, or badly scanned).";
    summary.finishedAt = new Date().toISOString();
    publish();
    return summary;
  }
  publish();

  const existing = await QuestionRepository.listByDocumentId(req.documentId, req.userId);
  const seenStems = new Set(existing.map((q) => normalizeForMatch(q.question_text)));
  let nextNumber = existing.reduce((max, q) => Math.max(max, q.question_number ?? 0), 0) + 1;
  // Held in an object so closures and the final status read the same, un-narrowed values.
  const stop: { fatal: LlmError | null; budgetHit: boolean } = { fatal: null, budgetHit: false };

  const reject = (stem: string, reason: string) => {
    summary.rejected++;
    summary.rejectionReasons[reason] = (summary.rejectionReasons[reason] ?? 0) + 1;
    if (summary.rejectedSamples.length < MAX_REJECTED_SAMPLES) summary.rejectedSamples.push({ stem, reason });
  };

  const record = (model: string, usage: LlmUsage | null, bucket: LlmUsage) => {
    if (!usage) return;
    addUsage(bucket, usage);
    const usd = costUsd(model, usage);
    summary.costUsd += usd;
    deps.onSpend?.(model, usd);
  };

  /** Records what a failed call was billed, then rethrows. */
  const recordFailure = (model: string, bucket: LlmUsage, err: unknown): never => {
    if (err instanceof LlmError) record(model, err.usage, bucket);
    throw err;
  };

  const canSpend = () => {
    if (summary.costUsd >= deps.budgetUsd) stop.budgetHit = true;
    return !stop.budgetHit && !stop.fatal;
  };

  /** Returns false when the section was skipped because spending stopped before it began. */
  async function processSection(chunk: MaterialChunk): Promise<boolean> {
    if (!canSpend()) return false;

    // 1. Write questions
    const generated = await deps.provider
      .completeJson({
        model: deps.generationModel,
        system: generationSystemPrompt(req.examName),
        user: generationUserPrompt(chunk.pages, questionTarget(chunk, req.questionsPerPage)),
        thinking: false,
        // Room for 15 questions even in Devanagari, which uses 2-3x more tokens than English.
        maxTokens: 16000,
      })
      .catch((err) => recordFailure(deps.generationModel, summary.usage.generation, err));
    record(deps.generationModel, generated.usage, summary.usage.generation);

    // 2. Shape and style checks, 3. proof quote must exist on the page, 4. no repeats
    const { candidates, rejections } = parseCandidates(generated.json);
    rejections.forEach((r) => reject(r.stem, r.reason));

    const survivors: { candidate: QuestionCandidate; page: number; method: string; score: number; excerpt: string }[] = [];
    for (const candidate of candidates) {
      const grounding = checkGrounding(candidate.sourceQuote, candidate.sourcePage, chunk.pages);
      if (!grounding.grounded || !grounding.excerpt) {
        const why = grounding.reason ?? "";
        reject(
          candidate.stem,
          why.includes("too short")
            ? "Proof quote too short"
            : why.includes("differs from the material")
              ? "Proof quote changes a word or number from the material"
              : "Proof quote not found in the material"
        );
        continue;
      }
      const key = normalizeForMatch(candidate.stem);
      if (seenStems.has(key)) {
        summary.duplicates++;
        continue;
      }
      seenStems.add(key);
      survivors.push({
        candidate,
        page: grounding.page ?? candidate.sourcePage,
        method: grounding.method,
        score: grounding.score,
        excerpt: grounding.excerpt,
      });
    }
    if (survivors.length === 0) return true;

    // 5. Independent blind re-solve, in small batches
    const verdicts = new Map<string, { answer: string; reason: string }>();
    const checkErrors = new Map<string, string>();
    const blind: BlindQuestion[] = survivors.map((sv, i) => ({
      id: `q${i + 1}`,
      stem: sv.candidate.stem,
      options: Object.fromEntries(sv.candidate.options.map((o) => [o.id, o.text])),
    }));
    for (let b = 0; b < blind.length; b += CHECK_BATCH_SIZE) {
      const batch = blind.slice(b, b + CHECK_BATCH_SIZE);
      if (!canSpend()) {
        const why = stop.fatal ? stop.fatal.message : "Spending limit reached before the check could run";
        batch.forEach((q) => checkErrors.set(q.id, why));
        continue;
      }
      try {
        const checked = await deps.provider
          .completeJson({
            model: deps.checkModel,
            system: VERIFICATION_SYSTEM_PROMPT,
            user: verificationUserPrompt(chunk.pages, batch),
            thinking: true,
            reasoningEffort: deps.checkEffort,
            maxTokens: 64000,
          })
          .catch((err) => recordFailure(deps.checkModel, summary.usage.check, err));
        record(deps.checkModel, checked.usage, summary.usage.check);
        parseVerdicts(checked.json).forEach((v, id) => verdicts.set(id, v));
      } catch (err) {
        if (err instanceof LlmError && err.fatal) stop.fatal = err;
        const message = err instanceof Error ? err.message : String(err);
        batch.forEach((q) => checkErrors.set(q.id, message));
      }
    }

    // 6. Decide and store
    const rows = survivors.map((s, i) => {
      const c = s.candidate;
      const verdict = verdicts.get(`q${i + 1}`);
      const checkError = checkErrors.get(`q${i + 1}`);
      let status: "AUTO_ACCEPTED" | "NEEDS_REVIEW" = "NEEDS_REVIEW";
      let reviewReason: string;
      if (checkError) {
        reviewReason = `Independent check could not run: ${checkError}`;
      } else if (!verdict) {
        reviewReason = "Independent check skipped this question";
      } else if (verdict.answer === c.answer) {
        status = "AUTO_ACCEPTED";
        reviewReason = "";
      } else if (verdict.answer === "NONE") {
        reviewReason = `Independent check could not confirm any single answer: ${verdict.reason}`;
      } else {
        reviewReason = `Independent check chose ${verdict.answer}, not ${c.answer}: ${verdict.reason}`;
      }
      if (status === "AUTO_ACCEPTED") summary.ready++;
      else summary.needsReview++;

      return {
        documentId: req.documentId,
        userId: req.userId,
        preparationContextId: req.preparationContextId,
        questionNumber: nextNumber++,
        questionText: c.stem,
        questionType: "MCQ",
        options: c.options,
        correctAnswer: c.answer,
        explanation: c.explanation,
        subject: c.subject,
        topic: c.topic,
        difficulty: c.difficulty,
        sourcePage: s.page,
        sourceImageCrop: cropFor(req.documentId, s.page),
        sourceType: "GENERATED" as const,
        extractionConfidence: status === "AUTO_ACCEPTED" ? s.score : 0.5,
        verificationStatus: status,
        reviewReason: reviewReason || null,
        metadata: {
          generation: {
            // Shown to the student as proof: copied from the page, never the model's wording.
            sourceQuote: s.excerpt,
            modelQuote: c.sourceQuote,
            groundingMethod: s.method,
            groundingScore: Math.round(s.score * 100) / 100,
            level: c.level,
            checkerAnswer: verdict?.answer ?? null,
            checkerReason: verdict?.reason ?? null,
            generationModel: deps.generationModel,
            checkModel: deps.checkModel,
            promptVersion: PROMPT_VERSION,
            runStartedAt: summary.startedAt,
          },
        },
      };
    });

    await QuestionRepository.createMany(rows);
    await QuestionRepository.refreshDocumentCounts(req.documentId, req.userId);
    return true;
  }

  // Small worker pool: sections run CONCURRENCY at a time, each finishing independently.
  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length && canSpend()) {
      const chunk = chunks[cursor++];
      try {
        if (!(await processSection(chunk))) break;
      } catch (err) {
        summary.sectionsFailed++;
        if (err instanceof LlmError && err.fatal) stop.fatal = err;
        console.error(`[Generation] Section ${chunk.index} of ${req.documentId} failed:`, err);
      }
      summary.sectionsDone++;
      publish();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

  summary.finishedAt = new Date().toISOString();
  if (stop.fatal) {
    summary.status = "FAILED";
    summary.message = stop.fatal.message;
  } else if (stop.budgetHit) {
    summary.status = "BUDGET_REACHED";
    summary.message = `Stopped at the $${deps.budgetUsd.toFixed(2)} spending limit after ${summary.sectionsDone} of ${summary.sectionsTotal} sections. Questions made so far are saved.`;
  } else if (summary.sectionsFailed === summary.sectionsTotal) {
    summary.status = "FAILED";
    summary.message = "Every section failed. Check the server log for the provider error.";
  } else {
    summary.status = "DONE";
    summary.message =
      summary.sectionsFailed > 0 ? `${summary.sectionsFailed} of ${summary.sectionsTotal} sections failed and were skipped.` : null;
  }
  publish();
  return summary;
}
