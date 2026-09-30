/**
 * Thin fetch wrappers over the shared question-bank HTTP contract
 * (src/lib/bank/api-types.ts). Every call throws BankApiRequestError with the
 * server's { error } message and status on a non-2xx response so callers can
 * branch on status (401/404/409/503) without re-parsing bodies.
 */
import type {
  BankAiStatus,
  BankAttempt,
  BankAttemptMode,
  BankAttemptResult,
  BankCheckResult,
  BankExplanation,
  BankKeyView,
  BankPaperDetail,
  BankPaperKind,
  BankPaperCode,
  BankPaperSummary,
  BankResponses,
  BankReview,
  BankTestbookImportResult,
} from "@/lib/bank/api-types";

export class BankApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BankApiRequestError";
    this.status = status;
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no/invalid body — fall through to status-based message
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `Request failed (${res.status})`;
    throw new BankApiRequestError(res.status, message);
  }
  return body as T;
}

export function listPapers(params: { kind?: BankPaperKind; paper?: BankPaperCode } = {}) {
  const qs = new URLSearchParams();
  if (params.kind) qs.set("kind", params.kind);
  if (params.paper) qs.set("paper", params.paper);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return call<{ papers: BankPaperSummary[] }>(`/api/bank/papers${suffix}`, { cache: "no-store" });
}

export function getPaper(id: string) {
  return call<BankPaperDetail>(`/api/bank/papers/${id}`, { cache: "no-store" });
}

export function createAttempt(input: { paperId: string; mode: BankAttemptMode; section?: string }) {
  return call<{ attempt: BankAttempt }>("/api/bank/attempts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAttempt(id: string) {
  return call<{ attempt: BankAttempt; responses: BankResponses; result: BankAttemptResult | null }>(
    `/api/bank/attempts/${id}`,
    { cache: "no-store" }
  );
}

export function saveResponses(id: string, responses: BankResponses) {
  return call<{ ok: true }>(`/api/bank/attempts/${id}`, {
    method: "PUT",
    body: JSON.stringify({ responses }),
  });
}

export function submitAttempt(id: string, responses: BankResponses) {
  return call<{ result: BankAttemptResult }>(`/api/bank/attempts/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ responses }),
  });
}

export function checkAnswer(attemptId: string, questionId: string, answer: string) {
  return call<BankCheckResult>(`/api/bank/attempts/${attemptId}/check`, {
    method: "POST",
    body: JSON.stringify({ questionId, answer }),
  });
}

export function getReview(attemptId: string) {
  return call<BankReview>(`/api/bank/attempts/${attemptId}/review`, { cache: "no-store" });
}

export function resolveQuestion(questionId: string, answer: string | null, note?: string) {
  return call<{ key: BankKeyView }>(`/api/bank/questions/${questionId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ answer, note }),
  });
}

export function explainQuestion(questionId: string) {
  return call<{ explanation: BankExplanation }>(`/api/bank/questions/${questionId}/explain`, {
    method: "POST",
  });
}

export function getAiStatus() {
  return call<BankAiStatus>("/api/bank/ai-status", { cache: "no-store" });
}

export function importTestbookToServer(payload: unknown) {
  return call<BankTestbookImportResult>("/api/bank/import/testbook", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
