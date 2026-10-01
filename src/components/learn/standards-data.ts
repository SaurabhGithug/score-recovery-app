"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Clause } from "@/components/standards/shared";
import type { QuizOverview } from "@/lib/standards/quiz-types";
import type { useLang } from "@/lib/i18n";

/** One row of GET /api/standards. */
export interface StandardRow { id: string; code: string; title: string; source_name: string; clauses: number; lessons: number }

/** A timed test needs at least this many verified questions to be worth starting. */
export const MIN_TEST_QUESTIONS = 5;

// ---------------------------------------------------------------- fetching

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

interface Settled<T> { url: string; data: T | null; error: string }

/**
 * GET a JSON endpoint. `loading` is true until the first answer for the current `url` arrives;
 * `reload()` goes back to loading and asks again. A `null` url means "do not fetch".
 */
export function useFetched<T>(url: string | null) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    getJson<T>(url, controller.signal)
      .then(data => setSettled({ url, data, error: "" }))
      .catch(e => { if (!controller.signal.aborted) setSettled({ url, data: null, error: e instanceof Error ? e.message : "Request failed." }); });
    return () => controller.abort();
  }, [url, attempt]);
  const reload = useCallback(() => { setSettled(null); setAttempt(n => n + 1); }, []);
  const current = settled && settled.url === url ? settled : null;
  return { loading: url !== null && current === null, data: current?.data ?? null, error: current?.error ?? "", reload };
}

export function useStandardsList() {
  const list = useFetched<{ standards?: StandardRow[] }>("/api/standards");
  return { rows: list.data ? (list.data.standards ?? []) : null, loading: list.loading, error: list.error, reload: list.reload };
}

/** The standard's clauses in reading order. `failed` is true when they could not be loaded (callers just omit what depends on them). */
export function useClauses(standardId: string) {
  const detail = useFetched<{ clauses?: Clause[] }>(`/api/standards/${encodeURIComponent(standardId)}`);
  const clauses = useMemo(() => detail.data?.clauses ? [...detail.data.clauses].sort((a, b) => a.ord - b.ord) : null, [detail.data]);
  return { clauses, loading: detail.loading, failed: !detail.loading && clauses === null };
}

export type QuizState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; overview: QuizOverview };

function isOverview(value: unknown): value is QuizOverview {
  const v = value as Partial<QuizOverview> | null;
  return !!v && typeof v === "object" && !!v.available && typeof v.available.total === "number" && Array.isArray(v.history);
}

/** Quiz status for the learner. Any failure (including the endpoint not existing) is "unavailable": callers then show the test link without stats. */
export function useQuizOverview(standardId: string): QuizState {
  const quiz = useFetched<unknown>(`/api/standards/${encodeURIComponent(standardId)}/quiz`);
  if (quiz.loading) return { status: "loading" };
  if (quiz.error || !isOverview(quiz.data)) return { status: "unavailable" };
  return { status: "ready", overview: quiz.data };
}

// ---------------------------------------------------------------- learned marks (this browser only)

/** The study page keeps "learned" marks in localStorage under this key. */
export function learnedKey(userId: string, standardId: string): string {
  return `standards-learned:${userId}:${standardId}`;
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Defensive parse: anything that is not a JSON array of strings counts as "nothing learned". */
export function parseLearned(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

/** Clause numbers this learner has marked as learned (empty on the server and before sign-in). Follows changes made in other tabs. */
export function useLearned(userId: string, standardId: string): string[] {
  const key = userId ? learnedKey(userId, standardId) : "";
  const raw = useSyncExternalStore(subscribeToStorage, () => (key ? readRaw(key) : null), () => null);
  return useMemo(() => parseLearned(raw), [raw]);
}

// ---------------------------------------------------------------- derived values

export interface Progress {
  total: number;
  done: number;
  percent: number;
  /** First clause (reading order) not yet learned; null while the clause list is unknown or when everything is learned. */
  next: Clause | null;
  allDone: boolean;
}

export function computeProgress(totalFromList: number, learned: string[], clauses: Clause[] | null): Progress {
  const marks = new Set(learned);
  const total = clauses ? clauses.length : totalFromList;
  const done = clauses ? clauses.filter(c => marks.has(c.clause_no)).length : Math.min(marks.size, total);
  const next = clauses ? clauses.find(c => !marks.has(c.clause_no)) ?? null : null;
  return { total, done, percent: total > 0 ? Math.round((100 * done) / total) : 0, next, allDone: total > 0 && done >= total };
}

type Translate = ReturnType<typeof useLang>["t"];

/** "6.4 Equipment", or a friendly name for the two front-matter entries. */
export function clauseLabel(c: Clause, t: Translate): string {
  const k = c.clause_no.toLowerCase();
  if (k === "nf") return t({ en: "National Foreword (BIS)", hi: "राष्ट्रीय प्रस्तावना (BIS)" });
  if (k === "intro") return t({ en: "Introduction", hi: "प्रस्तावना" });
  return `${c.clause_no} ${c.title}`.trim();
}

export function studyHref(standardId: string, next: Clause | null): string {
  return `/standards/${encodeURIComponent(standardId)}${next ? `#cl-${encodeURIComponent(next.clause_no)}` : ""}`;
}

export function testHref(standardId: string): string {
  return `/standards/${encodeURIComponent(standardId)}/test`;
}
