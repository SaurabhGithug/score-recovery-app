import { DeepSeekProvider } from "./deepseek";
import { MockProvider } from "./mock";
import { LlmProvider } from "./types";

/**
 * Server-side LLM configuration, read from environment variables (.env.local, never committed):
 *   LLM_PROVIDER                deepseek (default) | mock
 *   DEEPSEEK_API_KEY            required for deepseek
 *   DEEPSEEK_GENERATION_MODEL   default deepseek-flash, thinking off (writes the questions)
 *   DEEPSEEK_CHECK_MODEL        default deepseek-v4-pro, thinking on (re-solves them blind)
 *   DEEPSEEK_CHECK_EFFORT       low | high | max (default: DeepSeek's default, high)
 *   GENERATION_MAX_USD_PER_RUN  default 2 — a run stops once its spend reaches this
 *   GENERATION_MAX_USD_PER_DAY  default 5 — across all runs and users, rolling 24 hours
 *
 * Runs execute in-process after the HTTP response (see jobs/generation-queue.ts), so this needs
 * a long-lived Node server (`next start` / `next dev`), not a serverless deployment.
 */

export interface LlmSetup {
  configured: boolean;
  /** Why generation is unavailable, when it is. Safe to show in the UI (never contains the key). */
  unavailableReason: string | null;
  provider: LlmProvider | null;
  generationModel: string;
  checkModel: string;
  checkEffort: "low" | "high" | "max" | undefined;
  maxUsdPerRun: number;
  maxUsdPerDay: number;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getLlmSetup(): LlmSetup {
  const providerName = (process.env.LLM_PROVIDER || "deepseek").trim().toLowerCase();
  const maxUsdPerRun = positiveNumber(process.env.GENERATION_MAX_USD_PER_RUN, 2);
  const maxUsdPerDay = positiveNumber(process.env.GENERATION_MAX_USD_PER_DAY, 5);
  const effort = process.env.DEEPSEEK_CHECK_EFFORT?.trim().toLowerCase();
  const checkEffort: LlmSetup["checkEffort"] =
    effort === "low" || effort === "high" || effort === "max" ? effort : undefined;
  const limits = { checkEffort, maxUsdPerRun, maxUsdPerDay };

  if (providerName === "mock") {
    return {
      configured: true,
      unavailableReason: null,
      provider: new MockProvider(),
      generationModel: "mock",
      checkModel: "mock",
      ...limits,
    };
  }

  const generationModel = process.env.DEEPSEEK_GENERATION_MODEL?.trim() || "deepseek-flash";
  const checkModel = process.env.DEEPSEEK_CHECK_MODEL?.trim() || "deepseek-v4-pro";

  if (providerName !== "deepseek") {
    return {
      configured: false,
      unavailableReason: `Unknown LLM_PROVIDER "${providerName}". Use "deepseek" or "mock".`,
      provider: null,
      generationModel,
      checkModel,
      ...limits,
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      unavailableReason: "AI is not set up on this server yet: DEEPSEEK_API_KEY is missing from .env.local.",
      provider: null,
      generationModel,
      checkModel,
      ...limits,
    };
  }

  return {
    configured: true,
    unavailableReason: null,
    provider: new DeepSeekProvider(apiKey),
    generationModel,
    checkModel,
    ...limits,
  };
}
