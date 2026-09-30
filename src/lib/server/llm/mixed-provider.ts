/**
 * Two vendors behind one LlmProvider: "gemini-*" models go to Google, everything else to DeepSeek.
 * With both keys set, explanations and generated questions are written by Gemini and re-solved
 * blind by DeepSeek. (Saurabh, 2026-09-30: "one AI to answer, one AI to verify").
 *
 * Why, from a blind test on 2026-09-30 (64 SSC JE past-paper questions, SSC's own key):
 * - gemini-3.8-flash got 63 right.
 * - deepseek-v4-pro (thinking) got 59: 1 real mistake, 3 blank answers, 1 badly formatted answer.
 * - The two missed different questions, so each catches the other's errors.
 * - deepseek-flash without thinking failed the answer format on most questions.
 */
import type { JsonCompletionRequest, JsonCompletionResult, LlmProvider } from "./types";

export class MixedProvider implements LlmProvider {
  readonly name = "google+deepseek";

  constructor(private readonly google: LlmProvider, private readonly deepseek: LlmProvider) {}

  completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    return (request.model.startsWith("gemini-") ? this.google : this.deepseek).completeJson(request);
  }
}
