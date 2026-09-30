import { DeepSeekProvider } from "./deepseek";
import { GeminiProvider } from "./gemini-provider";
import { MixedProvider } from "./mixed-provider";
import { MockProvider } from "./mock";
import { LlmProvider } from "./types";

/**
 * Server-side LLM configuration, read from environment variables (.env.local, never committed):
 *   LLM_PROVIDER                mixed | deepseek | google | mock. When unset: mixed when both keys
 *                               have values, else whichever of deepseek / google has a key.
 *                               mixed: Gemini writes explanations and questions and blind-solves
 *                               past-paper questions (anchored to their source key); DeepSeek
 *                               (DEEPSEEK_CHECK_MODEL) re-solves AI-generated questions, which have
 *                               no source key. DEEPSEEK_GENERATION_MODEL is not used in mixed mode.
 *   GOOGLE_GENERATIVE_AI_API_KEY  required for google
 *   GEMINI_GENERATION_MODEL     default gemini-3.8-flash (writes explanations and questions)
 *   GEMINI_EXPLAIN_CHECK_MODEL  default gemini-3.8-flash, thinking HIGH (re-solves blind; an
 *                               explanation is kept only if this agrees with the source key)
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
  /** Re-solves AI-generated questions blind (no source key to anchor them: another vendor when possible). */
  checkModel: string;
  /**
   * Blind-solves past-paper questions for AI explanations. Those have a source key (SSC, a
   * publisher), which is the anchor, so the most accurate model is used: a note is kept only when
   * this solve agrees with that key.
   */
  explainCheckModel: string;
  checkEffort: "low" | "high" | "max" | undefined;
  maxUsdPerRun: number;
  maxUsdPerDay: number;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getLlmSetup(): LlmSetup {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() || "";
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase() || "";
  const providerName = explicit || (deepseekKey && googleKey ? "mixed" : deepseekKey ? "deepseek" : googleKey ? "google" : "deepseek");
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
      explainCheckModel: "mock",
      ...limits,
    };
  }

  if (providerName === "mixed") {
    const generationModel = process.env.GEMINI_GENERATION_MODEL?.trim() || "gemini-3.8-flash";
    const checkModel = process.env.DEEPSEEK_CHECK_MODEL?.trim() || "deepseek-v4-pro";
    if (!googleKey || !deepseekKey) {
      return {
        configured: false,
        unavailableReason: "LLM_PROVIDER=mixed needs both GOOGLE_GENERATIVE_AI_API_KEY and DEEPSEEK_API_KEY in .env.local.",
        provider: null,
        generationModel,
        checkModel,
        explainCheckModel: checkModel,
        ...limits,
      };
    }
    const provider = new MixedProvider(new GeminiProvider(googleKey), new DeepSeekProvider(deepseekKey));
    // Explanations are anchored to a source key, so the more accurate model solves them (63/64 vs
    // 59/64 in the 2026-09-30 test); generated questions have no anchor, so DeepSeek re-solves them.
    const explainCheckModel = process.env.GEMINI_EXPLAIN_CHECK_MODEL?.trim() || "gemini-3.8-flash";
    return { configured: true, unavailableReason: null, provider, generationModel, checkModel, explainCheckModel, ...limits };
  }

  if (providerName === "google") {
    const generationModel = process.env.GEMINI_GENERATION_MODEL?.trim() || "gemini-3.8-flash";
    const checkModel = process.env.GEMINI_EXPLAIN_CHECK_MODEL?.trim() || "gemini-3.8-flash";
    if (!googleKey) {
      return {
        configured: false,
        unavailableReason: "AI is not set up on this server yet: GOOGLE_GENERATIVE_AI_API_KEY is missing from .env.local.",
        provider: null,
        generationModel,
        checkModel,
        explainCheckModel: checkModel,
        ...limits,
      };
    }
    return { configured: true, unavailableReason: null, provider: new GeminiProvider(googleKey), generationModel, checkModel, explainCheckModel: checkModel, ...limits };
  }

  const generationModel = process.env.DEEPSEEK_GENERATION_MODEL?.trim() || "deepseek-flash";
  const checkModel = process.env.DEEPSEEK_CHECK_MODEL?.trim() || "deepseek-v4-pro";

  if (providerName !== "deepseek") {
    return {
      configured: false,
      unavailableReason: `Unknown LLM_PROVIDER "${providerName}". Use "mixed", "deepseek", "google" or "mock".`,
      provider: null,
      generationModel,
      checkModel,
      explainCheckModel: checkModel,
      ...limits,
    };
  }

  const apiKey = deepseekKey;
  if (!apiKey) {
    return {
      configured: false,
      unavailableReason: "AI is not set up on this server yet: DEEPSEEK_API_KEY is missing from .env.local.",
      provider: null,
      generationModel,
      checkModel,
      explainCheckModel: checkModel,
      ...limits,
    };
  }

  return {
    configured: true,
    unavailableReason: null,
    provider: new DeepSeekProvider(apiKey),
    generationModel,
    checkModel,
    explainCheckModel: checkModel,
    ...limits,
  };
}
