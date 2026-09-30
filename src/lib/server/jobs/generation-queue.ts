import { DocumentRepository } from "../repositories/document-repo";
import { SpendRepository } from "../repositories/spend-repo";
import { getLlmSetup } from "../llm";
import { createSummary, GenerationRequest, GenerationSummary, runGeneration } from "../generation/question-generator";

/**
 * Runs question generation out-of-band so the HTTP request returns immediately. One run at a
 * time across the whole server (bounds concurrent spend), each run capped by the smaller of the
 * per-run limit and what's left of the rolling 24-hour limit. Every billed call is written to
 * the llm_spend ledger as it happens.
 *
 * The latest summary is mirrored into study_documents.metadata.generation so it outlives the
 * process; a summary still marked RUNNING with no live job means the server restarted mid-run.
 */

const METADATA_KEY = "generation";
const DAY_MS = 24 * 60 * 60 * 1000;

// Kept on globalThis so dev-server module reloads don't lose track of a running job.
const registry = globalThis as unknown as { __questionGenerationJobs?: Map<string, GenerationSummary> };
const activeJobs = (registry.__questionGenerationJobs ??= new Map<string, GenerationSummary>());

export interface StartBlock {
  status: number;
  error: string;
}

export class GenerationQueue {
  public static isRunning(documentId: string): boolean {
    return activeJobs.has(documentId);
  }

  /** Dollars left under the rolling 24-hour limit. */
  public static async dailyRemainingUsd(): Promise<number> {
    const { maxUsdPerDay } = getLlmSetup();
    return Math.max(0, maxUsdPerDay - await SpendRepository.totalSince(new Date(Date.now() - DAY_MS)));
  }

  /** Why a run can't start right now, or null if it can. */
  public static async checkCanStart(documentId: string): Promise<StartBlock | null> {
    const setup = getLlmSetup();
    if (!setup.configured || !setup.provider) {
      return { status: 503, error: setup.unavailableReason ?? "Question generation is not configured" };
    }
    if (activeJobs.has(documentId)) {
      return { status: 409, error: "Questions are already being generated for this document" };
    }
    if (activeJobs.size > 0) {
      return { status: 409, error: "Another document is generating questions right now. Try again when it finishes." };
    }
    const remaining = await this.dailyRemainingUsd();
    if (remaining < 0.01) {
      return {
        status: 429,
        error: `Today's $${setup.maxUsdPerDay.toFixed(2)} generation limit is used up. It frees up over the next 24 hours.`,
      };
    }
    return null;
  }

  /** Live summary if a run is in progress, otherwise the last stored one (or null). */
  public static getSummary(documentId: string, storedMetadata: string | null): GenerationSummary | null {
    const live = activeJobs.get(documentId);
    if (live) return live;

    try {
      const stored = JSON.parse(storedMetadata || "{}")[METADATA_KEY] as GenerationSummary | undefined;
      if (!stored) return null;
      if (stored.status === "RUNNING") {
        return { ...stored, status: "INTERRUPTED", message: "The server restarted during this run. Questions made before that are saved; you can run it again." };
      }
      return stored;
    } catch {
      return null;
    }
  }

  /** Starts a run, or returns why it can't (re-checked here so concurrent requests can't both start). */
  public static async start(request: GenerationRequest): Promise<StartBlock | null> {
    const block = await this.checkCanStart(request.documentId);
    if (block) return block;

    const setup = getLlmSetup();
    const deps = {
      provider: setup.provider!,
      generationModel: setup.generationModel,
      checkModel: setup.checkModel,
      checkEffort: setup.checkEffort,
      budgetUsd: Math.min(setup.maxUsdPerRun, await this.dailyRemainingUsd()),
    };
    const persist = (summary: GenerationSummary) => {
      if (summary.status === "RUNNING") activeJobs.set(request.documentId, summary);
      void DocumentRepository.setMetadataKey(request.documentId, METADATA_KEY, summary);
    };
    const onSpend = (model: string, usd: number) =>
      void SpendRepository.add({ userId: request.userId, documentId: request.documentId, model, costUsd: usd });

    // Reserve the slot synchronously so a double-click can't start two runs.
    persist({ ...createSummary(request, deps, 0), message: "Starting…" });

    setImmediate(() => {
      runGeneration(request, { ...deps, onUpdate: persist, onSpend })
        .catch((err) => {
          console.error(`[Generation] Run for ${request.documentId} crashed:`, err);
          const current = activeJobs.get(request.documentId);
          void DocumentRepository.setMetadataKey(request.documentId, METADATA_KEY, {
            ...current,
            status: "FAILED",
            message: err instanceof Error ? err.message : "Generation crashed",
            finishedAt: new Date().toISOString(),
          });
        })
        .finally(() => {
          activeJobs.delete(request.documentId);
        });
    });
    return null;
  }
}
