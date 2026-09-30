"use client";

import type { MadeEasyOverview, MadeEasyTestDetail } from "@/lib/madeeasy";

export class MadeEasyRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new MadeEasyRequestError(data.error || "Could not load the Made Easy tests.", res.status);
  return data;
}

export const getMadeEasyOverview = () => get<MadeEasyOverview>("/api/made-easy");
export const getMadeEasyTest = (code: string) => get<MadeEasyTestDetail>(`/api/made-easy/${encodeURIComponent(code)}`);

/** Drill progress stays in this browser, kept per account so two people on one device don't mix. */
export interface DrillProgressEntry {
  attempts: number;
  correct: number;
  bestCorrectSeconds: number | null;
  lastAttemptedAt: string;
}

const LEGACY_KEY = "score-recovery.madeeasy-lab.v2";

export function loadDrillProgress(userId: string): Record<string, DrillProgressEntry> {
  try {
    const own = window.localStorage.getItem(`${LEGACY_KEY}:${userId}`);
    // Before 2026-09-30 progress had no account in its key; only the owner can open these tests, so it is theirs.
    const saved = own ?? window.localStorage.getItem(LEGACY_KEY);
    return saved ? (JSON.parse(saved) as Record<string, DrillProgressEntry>) : {};
  } catch {
    return {};
  }
}

export function saveDrillProgress(userId: string, progress: Record<string, DrillProgressEntry>) {
  try {
    window.localStorage.setItem(`${LEGACY_KEY}:${userId}`, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable (private mode); the drill still works for this visit.
  }
}
