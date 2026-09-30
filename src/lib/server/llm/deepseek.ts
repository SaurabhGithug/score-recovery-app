import { addUsage, emptyUsage, JsonCompletionRequest, JsonCompletionResult, LlmError, LlmProvider, LlmUsage } from "./types";

/**
 * DeepSeek chat completions over its OpenAI-format HTTP API (plain fetch, no SDK).
 * API reference: https://api-docs.deepseek.com/api/create-chat-completion
 *
 * Only the system prompt and the user message leave this server — callers must not put
 * user identifiers, file names or anything beyond the study material into either.
 *
 * Every 200 reply is billed even when we can't use it (cut off, empty, not JSON), so its usage
 * is always captured — on success in the result, on failure on the thrown LlmError — summed
 * across retries. Callers record it against their spending limit either way.
 */

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MAX_ATTEMPTS = 3;
/** Most requests one completeJson call can send (and be billed for): callers reserve budget for all of them. */
export const DEEPSEEK_MAX_ATTEMPTS = MAX_ATTEMPTS;
/**
 * Non-streaming requests stay open while DeepSeek sends blank keep-alive lines, and it drops
 * requests whose inference hasn't started within 10 minutes (docs: quick_start/rate_limit).
 * Thinking calls can run for many minutes, so they get a long timeout.
 */
const TIMEOUT_MS = { thinking: 15 * 60_000, plain: 5 * 60_000 };

interface DeepSeekResponse {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

function readUsage(usage: DeepSeekResponse["usage"]): LlmUsage {
  const u = usage ?? {};
  const hit = u.prompt_cache_hit_tokens ?? 0;
  return {
    promptCacheHitTokens: hit,
    promptCacheMissTokens: u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - hit),
    completionTokens: u.completion_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** Models sometimes wrap JSON in a ```json fence even in JSON mode. */
function stripFence(content: string): string {
  const m = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : content;
}

export class DeepSeekProvider implements LlmProvider {
  readonly name = "deepseek";
  private readonly apiKey: string;
  private readonly timeoutMs: { thinking: number; plain: number };
  private readonly backoffMs: number;

  constructor(apiKey: string, options: { timeoutMs?: { thinking: number; plain: number }; backoffMs?: number } = {}) {
    this.apiKey = apiKey;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    this.backoffMs = options.backoffMs ?? 1500;
  }

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens,
      thinking: { type: request.thinking ? "enabled" : "disabled" },
      stream: false,
    };
    if (request.thinking) {
      if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
    } else {
      body.temperature = 0.4;
    }

    const billed = emptyUsage();
    let lastError: LlmError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this.send(body, request);
        addUsage(billed, result.usage);
        return { ...result, usage: billed };
      } catch (err) {
        lastError = err instanceof LlmError ? err : new LlmError(String(err), { retryable: true });
        if (lastError.usage) addUsage(billed, lastError.usage);
        if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;
        await new Promise((resolve) => setTimeout(resolve, this.backoffMs * 2 ** (attempt - 1)));
      }
    }
    const error = lastError ?? new LlmError("DeepSeek request failed");
    error.usage = billed;
    throw error;
  }

  private async send(body: Record<string, unknown>, request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const timeoutMs = request.thinking ? this.timeoutMs.thinking : this.timeoutMs.plain;
    const isTimeout = (err: unknown) => err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    // Once DeepSeek has accepted a request it may be generating (and billing) even if we never see
    // the reply, so any failure after that point is charged as if the full max_tokens was used.
    const worstCase = (): LlmUsage => ({
      promptCacheHitTokens: 0,
      promptCacheMissTokens: Math.ceil((request.system.length + request.user.length) / 4),
      completionTokens: request.maxTokens,
      reasoningTokens: 0,
    });
    const timedOut = () =>
      new LlmError(`DeepSeek did not answer within ${Math.round(timeoutMs / 60_000)} minutes`, {
        retryable: false,
        usage: worstCase(),
      });

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) throw timedOut();
      // No response at all: the request most likely never started, so nothing is charged.
      throw new LlmError(`Could not reach DeepSeek: ${err instanceof Error ? err.message : String(err)}`, {
        retryable: true,
      });
    }

    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      if (!res.ok) {
        throw new LlmError(`DeepSeek error ${res.status} (reply unreadable)`, { retryable: true });
      }
      if (isTimeout(err)) throw timedOut();
      // Headers arrived (200) and the body broke mid-way, e.g. a dropped connection during inference.
      throw new LlmError(`DeepSeek connection broke while it was answering: ${err instanceof Error ? err.message : String(err)}`, {
        retryable: true,
        usage: worstCase(),
      });
    }

    if (!res.ok) {
      const detail = text.slice(0, 300);
      switch (res.status) {
        case 401:
          throw new LlmError("DeepSeek rejected the API key (401). Check DEEPSEEK_API_KEY.", { fatal: true });
        case 402:
          throw new LlmError("DeepSeek account has insufficient balance (402). Top up and retry.", { fatal: true });
        case 400:
        case 422:
          throw new LlmError(`DeepSeek rejected the request (${res.status}): ${detail}`, { fatal: true });
        default:
          // 429 rate limit, 500 server error, 503 overloaded
          throw new LlmError(`DeepSeek error ${res.status}: ${detail}`, { retryable: true });
      }
    }

    let data: DeepSeekResponse;
    try {
      data = JSON.parse(text) as DeepSeekResponse; // leading keep-alive blank lines are whitespace
    } catch {
      // A 200 we can't read may still have been billed; we can't see its usage, so assume the worst.
      throw new LlmError("DeepSeek sent a reply that could not be read", { retryable: true, usage: worstCase() });
    }

    // Read usage first: everything below is billed even when we reject it.
    const usage = readUsage(data.usage);
    const choice = data.choices?.[0];
    const finishReason = choice?.finish_reason ?? "unknown";
    const content = choice?.message?.content ?? "";

    if (finishReason === "length") {
      // The same request would be cut off again.
      throw new LlmError("DeepSeek output was cut off at max_tokens; the JSON is incomplete.", { retryable: false, usage });
    }
    if (finishReason === "content_filter") {
      throw new LlmError("DeepSeek withheld the output (content filter).", { retryable: false, usage });
    }
    if (finishReason === "insufficient_system_resource" || finishReason === "aborted") {
      throw new LlmError(`DeepSeek stopped early (${finishReason}).`, { retryable: true, usage });
    }
    if (!content.trim()) {
      // Documented JSON-mode behaviour: the API occasionally returns empty content.
      throw new LlmError("DeepSeek returned empty content", { retryable: true, usage });
    }

    let json: unknown;
    try {
      json = JSON.parse(stripFence(content));
    } catch {
      throw new LlmError("DeepSeek returned content that is not valid JSON", { retryable: true, usage });
    }

    return { json, model: data.model ?? String(body.model), finishReason, usage };
  }
}
