"use client";

import { Attempt, Dispute, ErrorLedgerEntry, Lang, LearnerProfile, RecoveryReport } from "./types";
import type { QuestionOption } from "./types";

export type CheckpointQuestionState = {
  selectedOptionId: QuestionOption["id"] | null;
  answerChangeCount: number;
  visitCount: number;
  markedForReview: boolean;
  timeSpentSeconds: number;
};

export type ExamCheckpoint = {
  states: Record<string, CheckpointQuestionState>;
  index: number;
  startedAt: string;
};

const BASE_KEYS = {
  profile: "src.profile.v2",
  attempts: "src.attempts.v2",
  reports: "src.reports.v2",
  ledger: "src.ledger.v2",
  disputes: "src.disputes.v2",
} as const;

export function getActiveUserId(): string {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem("src.active_user.v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return parsed.id;
    }
  } catch {
    // fallback
  }
  return "default";
}

export function getActiveContextId(userId?: string): string | null {
  if (typeof window === "undefined") return null;
  const uid = userId || getActiveUserId();
  try {
    const raw = window.localStorage.getItem(`src.active_context.v2.${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return parsed.id;
    }
  } catch {
    // fallback
  }
  return null;
}

function getUserKey(baseKey: string, userId?: string): string {
  const uid = userId || getActiveUserId();
  return `${baseKey}.${uid}`;
}

function getContextKey(baseKey: string, userId?: string, contextId?: string | null): string {
  const uid = userId || getActiveUserId();
  const cid = contextId !== undefined ? contextId : getActiveContextId(uid);
  if (cid) {
    return `${baseKey}.${uid}.${cid}`;
  }
  return `${baseKey}.${uid}`;
}

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function genId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}-${rand}`;
}

// ---- Profile -----------------------------------------------------------

export function getProfile(userId?: string): LearnerProfile | null {
  return safeGet<LearnerProfile | null>(getUserKey(BASE_KEYS.profile, userId), null);
}

export function saveProfile(profile: LearnerProfile, userId?: string): void {
  safeSet(getUserKey(BASE_KEYS.profile, userId), profile);
}

export function getLanguage(userId?: string): Lang {
  return getProfile(userId)?.language ?? "en";
}

export function setLanguage(lang: Lang, userId?: string): void {
  const p = getProfile(userId);
  if (p) {
    saveProfile({ ...p, language: lang }, userId);
  } else {
    safeSet(getUserKey(BASE_KEYS.profile, userId), {
      name: "",
      language: lang,
      createdAt: new Date().toISOString(),
    });
  }
}

// ---- Attempts & reports (User- & Context-Scoped) ---------------------------

export function listAttempts(userId?: string, contextId?: string | null): Attempt[] {
  const uid = userId || getActiveUserId();
  const cid = contextId !== undefined ? contextId : getActiveContextId(uid);
  if (cid) {
    const contextAttempts = safeGet<Attempt[]>(getContextKey(BASE_KEYS.attempts, uid, cid), []);
    const baseAttempts = safeGet<Attempt[]>(getUserKey(BASE_KEYS.attempts, uid), []).filter(
      (a) => a.contextId === cid
    );
    const map = new Map<string, Attempt>();
    contextAttempts.forEach((a) => map.set(a.id, a));
    baseAttempts.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  }
  return safeGet<Attempt[]>(getUserKey(BASE_KEYS.attempts, uid), []);
}

export function getAttempt(id: string, userId?: string, contextId?: string | null): Attempt | null {
  const found = listAttempts(userId, contextId).find((a) => a.id === id);
  if (found) return found;
  const uid = userId || getActiveUserId();
  const base = safeGet<Attempt[]>(getUserKey(BASE_KEYS.attempts, uid), []).find((a) => a.id === id);
  if (base) return base;
  if (typeof window !== "undefined") {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${BASE_KEYS.attempts}.${uid}`)) {
        const item = safeGet<Attempt[]>(key, []).find((a) => a.id === id);
        if (item) return item;
      }
    }
  }
  return null;
}

export function saveAttempt(attempt: Attempt, userId?: string, contextId?: string | null): void {
  const uid = userId || getActiveUserId();
  const cid = contextId !== undefined ? contextId : (attempt.contextId || getActiveContextId(uid));
  attempt.userId = uid;
  if (cid) attempt.contextId = cid;

  const key = getContextKey(BASE_KEYS.attempts, uid, cid);
  const all = safeGet<Attempt[]>(key, []).filter((a) => a.id !== attempt.id);
  all.push(attempt);
  safeSet(key, all);
}

export function listReports(userId?: string, contextId?: string | null): RecoveryReport[] {
  const uid = userId || getActiveUserId();
  const cid = contextId !== undefined ? contextId : getActiveContextId(uid);
  if (cid) {
    const contextReports = safeGet<RecoveryReport[]>(getContextKey(BASE_KEYS.reports, uid, cid), []);
    const baseReports = safeGet<RecoveryReport[]>(getUserKey(BASE_KEYS.reports, uid), []).filter(
      (r) => r.contextId === cid
    );
    const map = new Map<string, RecoveryReport>();
    contextReports.forEach((r) => map.set(r.attemptId, r));
    baseReports.forEach((r) => map.set(r.attemptId, r));
    return Array.from(map.values());
  }
  return safeGet<RecoveryReport[]>(getUserKey(BASE_KEYS.reports, uid), []);
}

export function getReport(attemptId: string, userId?: string, contextId?: string | null): RecoveryReport | null {
  const found = listReports(userId, contextId).find((r) => r.attemptId === attemptId);
  if (found) return found;
  const uid = userId || getActiveUserId();
  const base = safeGet<RecoveryReport[]>(getUserKey(BASE_KEYS.reports, uid), []).find(
    (r) => r.attemptId === attemptId
  );
  if (base) return base;
  if (typeof window !== "undefined") {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${BASE_KEYS.reports}.${uid}`)) {
        const item = safeGet<RecoveryReport[]>(key, []).find((r) => r.attemptId === attemptId);
        if (item) return item;
      }
    }
  }
  return null;
}

export function saveReport(report: RecoveryReport, userId?: string, contextId?: string | null): void {
  const uid = userId || getActiveUserId();
  const cid = contextId !== undefined ? contextId : (report.contextId || getActiveContextId(uid));
  report.userId = uid;
  if (cid) report.contextId = cid;

  const key = getContextKey(BASE_KEYS.reports, uid, cid);
  const all = safeGet<RecoveryReport[]>(key, []).filter((r) => r.attemptId !== report.attemptId);
  all.push(report);
  safeSet(key, all);
}

// ---- Question disputes -----------------------------------------------------

export function listDisputes(userId?: string): Dispute[] {
  return safeGet<Dispute[]>(getUserKey(BASE_KEYS.disputes, userId), []);
}

export function saveDispute(dispute: Dispute, userId?: string): void {
  const key = getUserKey(BASE_KEYS.disputes, userId);
  const all = safeGet<Dispute[]>(key, []);
  all.push(dispute);
  safeSet(key, all);
}

export function disputeCountForQuestion(questionId: string, userId?: string): number {
  return listDisputes(userId).filter((d) => d.questionId === questionId).length;
}

// ---- Error ledger (User- & Context-Scoped) --------------------------------

export function getLedger(userId?: string, contextId?: string | null): ErrorLedgerEntry[] {
  const key = getContextKey(BASE_KEYS.ledger, userId, contextId);
  return safeGet<ErrorLedgerEntry[]>(key, []);
}

export function saveLedger(ledger: ErrorLedgerEntry[], userId?: string, contextId?: string | null): void {
  const key = getContextKey(BASE_KEYS.ledger, userId, contextId);
  safeSet(key, ledger);
}

// ---- In-progress attempt checkpoint ----------------------------------------

const CHECKPOINT_PREFIX = "src.checkpoint.v2.";

export function saveCheckpoint(examId: string, checkpoint: ExamCheckpoint, userId?: string): void {
  const uid = userId || getActiveUserId();
  safeSet(`${CHECKPOINT_PREFIX}${uid}.${examId}`, checkpoint);
}

export function getCheckpoint(examId: string, userId?: string): ExamCheckpoint | null {
  const uid = userId || getActiveUserId();
  return safeGet<ExamCheckpoint | null>(`${CHECKPOINT_PREFIX}${uid}.${examId}`, null);
}

export function clearCheckpoint(examId: string, userId?: string): void {
  if (typeof window === "undefined") return;
  const uid = userId || getActiveUserId();
  try {
    window.localStorage.removeItem(`${CHECKPOINT_PREFIX}${uid}.${examId}`);
  } catch {
    // ignore
  }
}

export function resetAllData(userId?: string): void {
  if (typeof window === "undefined") return;
  const uid = userId || getActiveUserId();
  Object.values(BASE_KEYS).forEach((k) => {
    window.localStorage.removeItem(`${k}.${uid}`);
    const prefix = `${k}.${uid}.`;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const keyName = window.localStorage.key(i);
      if (keyName && keyName.startsWith(prefix)) toRemove.push(keyName);
    }
    toRemove.forEach((kn) => window.localStorage.removeItem(kn));
  });

  const toRemove: string[] = [];
  const targetCheckPrefix = `${CHECKPOINT_PREFIX}${uid}.`;
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(targetCheckPrefix)) toRemove.push(k);
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
}
