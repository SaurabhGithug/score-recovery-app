/**
 * Minimal Gemini Developer API client (REST generateContent) for follow-up answers.
 * Facts checked 2026-09-30 on ai.google.dev (models, pricing, google-search, terms):
 * - POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent, key in
 *   the x-goog-api-key header (never in the URL, so it stays out of logs).
 * - Grounding: tools: [{ google_search: {} }]. Needs a billed project for Gemini 3.x; the terms
 *   require showing groundingMetadata.searchEntryPoint.renderedContent next to a grounded answer.
 * - thinkingConfig.thinkingLevel (LOW | MEDIUM | HIGH); temperature is deprecated, so not sent.
 * - Billing: thoughts are billed as output (usageMetadata.thoughtsTokenCount) and count inside
 *   maxOutputTokens (verified 2026-09-30 on gemini-3.8-flash: thoughts + candidates stayed within
 *   a 64- and a 200-token cap, finishReason MAX_TOKENS). A reply cut off mid-thought is billed.
 */

export interface GeminiTurn {
  role: "user" | "model";
  text: string;
}

export interface GeminiRequest {
  model: string;
  system: string;
  turns: GeminiTurn[];
  grounded: boolean;
  /** Ask for a JSON reply (application/json). Not combined with grounding. */
  json?: boolean;
  maxOutputTokens: number;
  thinkingLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface GeminiUsage {
  promptTokens: number;
  /** Answer plus thinking tokens: everything billed at the output rate. */
  outputTokens: number;
  searchQueries: number;
}

export interface GeminiSource {
  title: string;
  uri: string;
}

export interface GeminiResult {
  text: string;
  finishReason: string;
  usage: GeminiUsage;
  grounded: boolean;
  sources: GeminiSource[];
  /** Google's Search Suggestions HTML; must be displayed with a grounded answer. */
  searchEntryPointHtml: string | null;
  /** false when the reply carried no usageMetadata: what was billed is unknown. */
  usageKnown: boolean;
}

export class GeminiError extends Error {
  /**
   * @param billingUnknown the request may have been accepted and billed but we can't tell what
   *   (a timeout, a dropped connection, an unreadable 200 body): callers keep the worst case.
   */
  constructor(message: string, readonly status: number, readonly usage: GeminiUsage | null = null, readonly billingUnknown = false) {
    super(message);
    this.name = "GeminiError";
  }

  /** Google refused the key itself (invalid, deleted, or not allowed for this API). */
  get keyRejected(): boolean {
    return this.status === 401 || this.status === 403 || /api key/i.test(this.message);
  }

  /** The error concerns the Google Search tool (e.g. not available without billing). */
  get groundingUnavailable(): boolean {
    return this.status === 400 && /search|ground|tool/i.test(this.message);
  }
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface RawResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      searchEntryPoint?: { renderedContent?: string };
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number };
  error?: { message?: string; status?: string };
}

function usageOf(raw: RawResponse): GeminiUsage {
  const u = raw.usageMetadata ?? {};
  const queries = raw.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length ?? 0;
  return {
    promptTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    searchQueries: queries,
  };
}

export async function geminiGenerate(apiKey: string, request: GeminiRequest, signal?: AbortSignal): Promise<GeminiResult> {
  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    ...(request.grounded ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens,
      thinkingConfig: { thinkingLevel: request.thinkingLevel },
      ...(request.json && !request.grounded ? { responseMimeType: "application/json" } : {}),
    },
  };
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(request.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(90_000),
    });
  } catch (err) {
    // A timeout or dropped connection may come after Google accepted (and billed) the request.
    throw new GeminiError(`Could not reach Google: ${err instanceof Error ? err.message : String(err)}`, 0, null, true);
  }
  let raw: RawResponse;
  try {
    raw = (await res.json()) as RawResponse;
  } catch {
    throw new GeminiError(`Google returned HTTP ${res.status} without a readable body.`, res.status, null, res.ok);
  }
  if (!res.ok) {
    // Never echo the request; Google's error text does not contain the key.
    throw new GeminiError(raw.error?.message?.slice(0, 300) || `Google returned HTTP ${res.status}.`, res.status);
  }
  const candidate = raw.candidates?.[0];
  const usage = usageOf(raw);
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
  const finishReason = candidate?.finishReason ?? "UNKNOWN";
  if (!text) throw new GeminiError(`Google returned no answer (finish reason ${finishReason}).`, 502, usage);
  const grounding = candidate?.groundingMetadata;
  const seen = new Set<string>();
  const sources: GeminiSource[] = [];
  for (const chunk of grounding?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri) || !/^https:\/\//.test(uri)) continue;
    seen.add(uri);
    sources.push({ uri, title: (chunk.web?.title || uri).slice(0, 200) });
  }
  return {
    text,
    finishReason,
    usage,
    grounded: Boolean(grounding && (sources.length || grounding.webSearchQueries?.length)),
    sources,
    searchEntryPointHtml: grounding?.searchEntryPoint?.renderedContent ?? null,
    usageKnown: raw.usageMetadata !== undefined,
  };
}
