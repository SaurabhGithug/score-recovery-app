/**
 * Provider-neutral contract for the LLM calls the question generator makes.
 * Every call asks for a single JSON object back; callers validate its shape themselves.
 */

export interface LlmUsage {
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  /** Includes reasoning tokens — the whole completion is billed as output. */
  completionTokens: number;
  reasoningTokens: number;
}

export interface JsonCompletionRequest {
  model: string;
  system: string;
  user: string;
  thinking: boolean;
  /** Only used when thinking is on. Provider default when omitted. */
  reasoningEffort?: "low" | "high" | "max";
  maxTokens: number;
}

export interface JsonCompletionResult {
  json: unknown;
  /** Everything billed for this call, including earlier failed attempts that were retried. */
  usage: LlmUsage;
  model: string;
  finishReason: string;
}

export interface LlmProvider {
  readonly name: string;
  completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult>;
}

export class LlmError extends Error {
  /** Stop the whole run: no request can succeed (bad key, no balance, invalid request). */
  readonly fatal: boolean;
  /** Sending the identical request again may succeed (rate limit, overload, empty reply). */
  readonly retryable: boolean;
  /**
   * Tokens billed for the failed call(s), when the provider reported or we had to assume them.
   * A 200 reply that we can't use (cut off, empty, not JSON) is still billed, so callers must
   * record this against their budget.
   */
  usage: LlmUsage | null;

  constructor(message: string, options: { fatal?: boolean; retryable?: boolean; usage?: LlmUsage | null } = {}) {
    super(message);
    this.name = "LlmError";
    this.fatal = options.fatal ?? false;
    this.retryable = !this.fatal && (options.retryable ?? false);
    this.usage = options.usage ?? null;
  }
}

export function emptyUsage(): LlmUsage {
  return { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0, reasoningTokens: 0 };
}

export function addUsage(into: LlmUsage, add: LlmUsage): void {
  into.promptCacheHitTokens += add.promptCacheHitTokens;
  into.promptCacheMissTokens += add.promptCacheMissTokens;
  into.completionTokens += add.completionTokens;
  into.reasoningTokens += add.reasoningTokens;
}
