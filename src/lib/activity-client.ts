"use client";

import type { ActivityDetail, ActivityTargetKind, ClientEventType } from "./activity";

/**
 * Records a UI-only event in the activity log. Events are queued and sent together a moment later
 * (and when the tab is hidden), so tracking never slows the page. A failed send is dropped: the log
 * is useful, not essential. Server-side actions (practice answers, AI questions, marks) log themselves.
 */
interface Queued { type: ClientEventType; targetKind?: ActivityTargetKind; targetId?: string; detail?: ActivityDetail; queuedAt: number }

const FLUSH_MS = 2000;
/** The same event twice this close together is one action (React runs effects twice in development). */
const REPEAT_MS = 1500;
const queue: Queued[] = [];
let lastKey = "";
let lastAt = 0;
let timer: number | null = null;
let listening = false;

function flush() {
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const now = Date.now();
  const events = queue.splice(0, 50).map(({ queuedAt, ...event }) => ({ ...event, ageMs: now - queuedAt }));
  const body = JSON.stringify({ events });
  // keepalive lets the request finish while the page is being hidden or closed.
  fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  if (queue.length) timer = window.setTimeout(flush, FLUSH_MS);
}

export function track(type: ClientEventType, target?: { kind: ActivityTargetKind; id: string }, detail?: ActivityDetail) {
  if (typeof window === "undefined") return;
  const key = `${type}|${target?.kind ?? ""}|${target?.id ?? ""}|${JSON.stringify(detail ?? {})}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < REPEAT_MS) return;
  lastKey = key;
  lastAt = now;
  queue.push({ type, targetKind: target?.kind, targetId: target?.id, detail, queuedAt: Date.now() });
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }
  if (timer === null) timer = window.setTimeout(flush, FLUSH_MS);
}
