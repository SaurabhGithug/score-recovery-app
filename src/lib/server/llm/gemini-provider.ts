/**
 * Google Gemini behind the provider-neutral LlmProvider contract (JSON replies), so the AI
 * explanations, question generation and tutor can run on Gemini when DeepSeek isn't set up
 * (Saurabh, 2026-09-30: "do whatever is best").
 *
 * Choice of model rests on a blind test on 2026-09-30:
 * - Across 64 SSC JE past-paper questions with SSC's own key, gemini-3.8-flash got 63 right at
 *   MEDIUM and at HIGH thinking. The one miss was a plastering numerical that every Gemini setup
 *   got wrong the same way.
 * - gemini-3.1-pro-preview was no more accurate, and it hit this account's quota under load.
 *
 * Billing follows deepseek.ts: a reply we can't use, or a request whose outcome we can't see
 * (timeout, dropped connection, missing usage figures), is charged at its worst case.
 */
import { GeminiError, geminiGenerate, type GeminiRequest, type GeminiResult } from "../followup/gemini";
import { LlmError, type JsonCompletionRequest, type JsonCompletionResult, type LlmProvider, type LlmUsage } from "./types";

/** Gemini counts thinking inside maxOutputTokens (verified 2026-09-30), so thinking calls get headroom. */
const THINKING_HEADROOM = { LOW: 2048, MEDIUM: 8192, HIGH: 16384 } as const;
/** outputTokenLimit of gemini-3.8-flash and gemini-3.1-pro-preview (models.get, 2026-09-30). */
const GEMINI_MAX_OUTPUT = 65_536;

export class GeminiProvider implements LlmProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly generate: (apiKey: string, request: GeminiRequest) => Promise<GeminiResult> = geminiGenerate
  ) {}

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    // Small non-thinking requests (e.g. a 200-token selection) think LOW, or the thinking eats the answer.
    const level = request.thinking ? (request.reasoningEffort === "low" ? "LOW" : "HIGH") : request.maxTokens >= 2000 ? "MEDIUM" : "LOW";
    // Callers reserve 3 × maxTokens (the DeepSeek retry budget); a single Gemini attempt stays inside
    // it, and never above what the model can output (Google refuses larger limits).
    const maxOutputTokens = Math.min(3 * request.maxTokens, request.maxTokens + THINKING_HEADROOM[level], GEMINI_MAX_OUTPUT);
    const worstCase = (): LlmUsage => ({
      promptCacheHitTokens: 0,
      promptCacheMissTokens: Math.ceil((request.system.length + request.user.length) / 3),
      completionTokens: maxOutputTokens,
      reasoningTokens: 0,
    });

    let result: GeminiResult;
    try {
      result = await this.generate(this.apiKey, {
        model: request.model,
        system: request.system,
        turns: [{ role: "user", text: request.user }],
        grounded: false,
        json: true,
        maxOutputTokens,
        thinkingLevel: level,
      });
    } catch (err) {
      if (!(err instanceof GeminiError)) throw new LlmError(`Gemini request failed: ${String(err)}`, { retryable: false, usage: worstCase() });
      const usage = err.usage ? usageOf(err.usage) : err.billingUnknown ? worstCase() : null;
      if (err.keyRejected) throw new LlmError("Google rejected the API key (GOOGLE_GENERATIVE_AI_API_KEY).", { fatal: true, usage });
      // Fatal for the run: every further request would hit the same limit (a batch stops instead of skipping each question).
      if (err.status === 429) throw new LlmError(`Google's rate limit or quota was reached; try again later. (${err.message.slice(0, 120)})`, { fatal: true, usage });
      throw new LlmError(`Gemini: ${err.message}`, { retryable: false, usage });
    }

    const usage = result.usageKnown ? usageOf(result.usage) : worstCase();
    let json: unknown;
    try {
      json = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new LlmError(`Gemini returned a reply that was not JSON (finish reason ${result.finishReason}).`, { retryable: false, usage });
    }
    return { json, usage, model: request.model, finishReason: result.finishReason };
  }
}

function usageOf(u: { promptTokens: number; outputTokens: number }): LlmUsage {
  return { promptCacheHitTokens: 0, promptCacheMissTokens: u.promptTokens, completionTokens: u.outputTokens, reasoningTokens: 0 };
}
