import type { AnswerState, AttemptView, QuizOverview, QuizScope, ResultView } from "@/lib/standards/quiz-types";

/** A failed quiz request: the server's message, its HTTP status, and (409 on start) the running attempt. */
export class QuizApiError extends Error {
  constructor(message: string, readonly status: number, readonly activeAttemptId?: string) {
    super(message);
  }
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new QuizApiError("You appear to be offline.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; activeAttemptId?: string };
  if (!res.ok) throw new QuizApiError(data.error || `Request failed (${res.status})`, res.status, data.activeAttemptId);
  return data;
}

/** Where the server's clock stood at a moment we can measure locally (the midpoint of the request). */
export interface ClockAnchor {
  serverMs: number;
  perf: number;
  date: number;
}

/** Runs a request that returns serverNow and records the clock anchor around it. */
export async function withClock<T>(run: () => Promise<T>, serverNow: (value: T) => string | undefined): Promise<{ value: T; anchor: ClockAnchor | null }> {
  const t0 = Date.now();
  const p0 = performance.now();
  const value = await run();
  const now = serverNow(value);
  return { value, anchor: now ? { serverMs: Date.parse(now), perf: (p0 + performance.now()) / 2, date: (t0 + Date.now()) / 2 } : null };
}

const attemptUrl = (attemptId: string) => `/api/standards/quiz/attempt/${encodeURIComponent(attemptId)}`;

export const quizApi = {
  overview: (standardId: string) => request<QuizOverview>(`/api/standards/${encodeURIComponent(standardId)}/quiz`),
  start: (standardId: string, input: { scope: QuizScope; count: number; secondsPerQuestion?: number; limitSeconds?: number }) =>
    request<AttemptView>(`/api/standards/${encodeURIComponent(standardId)}/quiz`, input),
  get: (attemptId: string) => request<AttemptView | ResultView>(attemptUrl(attemptId)),
  save: (attemptId: string, responses: Record<string, AnswerState>) => request<{ saved: true; serverNow: string }>(attemptUrl(attemptId), { action: "save", responses }),
  submit: (attemptId: string, responses: Record<string, AnswerState>, auto: boolean) => request<ResultView>(attemptUrl(attemptId), { action: "submit", responses, auto }),
  /** Best effort while the page is going away (tab closed, app switched): the browser finishes it after unload. */
  saveOnExit(attemptId: string, responses: Record<string, AnswerState>): void {
    try {
      void fetch(attemptUrl(attemptId), { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", responses }) }).catch(() => {});
    } catch {
      /* the page is closing; nothing else to do */
    }
  },
};

export function isResult(v: AttemptView | ResultView): v is ResultView {
  return typeof (v as ResultView).submittedAt === "string";
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

/** 90 → "1 min 30 s"; 45 → "45 s"; 3600 → "1 h". */
export function formatDuration(totalSeconds: number, lang: "en" | "hi"): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(lang === "hi" ? `${h} घंटा` : `${h} h`);
  if (m) parts.push(lang === "hi" ? `${m} मिनट` : `${m} min`);
  if (sec || !parts.length) parts.push(lang === "hi" ? `${sec} सेकंड` : `${sec} s`);
  return parts.join(" ");
}
