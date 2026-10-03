"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parsePlan, planStorageKey, type PlanItem } from "@/lib/calendar/test-plan";

/**
 * The signed-in learner's test plan, kept in this browser under a key that includes their account id
 * (the same approach as the Made Easy drill progress), so Reema's and Saurabh's plans never mix.
 */
export function useTestPlan(userId: string | null | undefined) {
  const key = userId ? planStorageKey(userId) : null;
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const itemsRef = useRef<PlanItem[]>([]);

  useEffect(() => {
    if (!key) return;
    // localStorage is browser-only: read it after mount, outside the effect body.
    void Promise.resolve().then(() => {
      let loaded: PlanItem[] = [];
      try {
        const raw = window.localStorage.getItem(key);
        loaded = raw ? parsePlan(JSON.parse(raw)) : [];
      } catch {
        loaded = [];
      }
      itemsRef.current = loaded;
      setItems(loaded);
      setLoadedKey(key);
    });
  }, [key]);

  const ready = key !== null && loadedKey === key;

  /** Apply a change and save it. `update` may throw (for example on bad input); the caller shows the message. */
  const commit = useCallback((update: (current: PlanItem[]) => PlanItem[]): void => {
    if (!key || loadedKey !== key) throw new Error("The plan is still loading.");
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [key, loadedKey]);

  return { items, ready, commit, saveFailed };
}
