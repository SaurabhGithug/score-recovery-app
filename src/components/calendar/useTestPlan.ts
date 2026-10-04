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
  /** Which version of the built-in plan this plan was last loaded or updated from ("built" date), or null if never. */
  const [presetStamp, setPresetStamp] = useState<string | null>(null);
  const stampKey = key ? `${key}:preset` : null;
  /** False after a save failed (private window, full storage), until one succeeds again. */
  const savedOk = useRef(true);

  useEffect(() => {
    if (!key) return;
    // localStorage is browser-only: read it after mount, outside the effect body.
    void Promise.resolve().then(() => {
      let loaded: PlanItem[] = [];
      let stamp: string | null = null;
      try {
        const raw = window.localStorage.getItem(key);
        loaded = raw ? parsePlan(JSON.parse(raw)) : [];
        stamp = window.localStorage.getItem(`${key}:preset`);
      } catch {
        loaded = [];
      }
      itemsRef.current = loaded;
      setItems(loaded);
      setPresetStamp(stamp);
      setLoadedKey(key);
    });
  }, [key]);

  // Another tab or window with the calendar open saved a change: show it here too.
  useEffect(() => {
    if (!key) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      let latest: PlanItem[] = [];
      try { latest = event.newValue ? parsePlan(JSON.parse(event.newValue)) : []; } catch { return; }
      itemsRef.current = latest;
      setItems(latest);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const ready = key !== null && loadedKey === key;

  /**
   * Apply a change and save it. `update` may throw (for example on bad input); the caller shows the message.
   * The change is applied to the plan as last saved, so a second open copy of the calendar cannot overwrite this one's progress.
   */
  const commit = useCallback((update: (current: PlanItem[]) => PlanItem[]): void => {
    if (!key || loadedKey !== key) throw new Error("The plan is still loading.");
    let base = itemsRef.current;
    // After a failed save the browser's copy is out of date, so keep working from the copy in memory.
    if (savedOk.current) {
      try {
        const raw = window.localStorage.getItem(key);
        base = raw ? parsePlan(JSON.parse(raw)) : base;
      } catch { /* keep the copy in memory */ }
    }
    const next = update(base);
    if (next === base) {
      // Nothing to save; still show the latest saved plan if another copy changed it.
      if (base !== itemsRef.current) { itemsRef.current = base; setItems(base); }
      return;
    }
    itemsRef.current = next;
    setItems(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      savedOk.current = true;
      setSaveFailed(false);
    } catch {
      savedOk.current = false;
      setSaveFailed(true);
    }
  }, [key, loadedKey]);

  /** Remember that the plan now matches this version of the built-in plan. */
  const markPresetSynced = useCallback((built: string) => {
    if (!stampKey) return;
    try { window.localStorage.setItem(stampKey, built); } catch { /* the notice may show again; harmless */ }
    setPresetStamp(built);
  }, [stampKey]);

  return { items, ready, commit, saveFailed, presetStamp, markPresetSynced };
}
