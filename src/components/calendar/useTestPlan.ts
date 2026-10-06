"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergePreset, parsePlan, planStorageKey, type PlanInput, type PlanItem } from "@/lib/calendar/test-plan";
import preset from "@/lib/calendar/pyq-plan-preset.json";

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
  /** True on the visit that filled an empty plan with the built-in one (a new phone or browser). */
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    // localStorage is browser-only: read it after mount, outside the effect body.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      let raw: string | null = null;
      let loaded: PlanItem[] = [];
      let stamp: string | null = null;
      let failed = false;
      try {
        raw = window.localStorage.getItem(key);
        stamp = window.localStorage.getItem(`${key}:preset`);
      } catch { /* storage blocked: start from the built-in plan in memory */ }
      try {
        loaded = raw ? parsePlan(JSON.parse(raw)) : [];
      } catch {
        loaded = [];
      }
      // Saved text that holds no readable test: damaged, so it is kept aside below rather than lost.
      const unreadable = raw !== null && loaded.length === 0 && raw.trim() !== "[]";
      // A new phone, browser or profile shows its scheduled tests straight away, the same as pressing "Load PYQ plan".
      // A stamped empty plan was loaded and then cleared on purpose, so it stays empty.
      const fill = (loaded.length === 0 && !stamp) || unreadable;
      if (fill) {
        if (unreadable) {
          try { window.localStorage.setItem(`${key}:unreadable`, raw as string); } catch { /* best effort */ }
        }
        loaded = mergePreset([], preset.items as PlanInput[]).items;
        stamp = preset.built;
        try {
          window.localStorage.setItem(key, JSON.stringify(loaded));
        } catch {
          failed = true;
        }
        // Never persist the stamp without the plan: a failed first save must be
        // retried next visit, while this visit can still use the in-memory plan.
        if (!failed) {
          try { window.localStorage.setItem(`${key}:preset`, stamp); } catch { /* optional version marker */ }
        }
      }
      savedOk.current = !failed;
      setSaveFailed(failed);
      setAutoLoaded(fill);
      itemsRef.current = loaded;
      setItems(loaded);
      setPresetStamp(stamp);
      setLoadedKey(key);
    });
    return () => { cancelled = true; };
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
   * Returns false when the browser would not save it (the change still shows until the page is closed).
   */
  const commit = useCallback((update: (current: PlanItem[]) => PlanItem[]): boolean => {
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
      return savedOk.current;
    }
    itemsRef.current = next;
    setItems(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      savedOk.current = true;
      setSaveFailed(false);
      return true;
    } catch {
      savedOk.current = false;
      setSaveFailed(true);
      return false;
    }
  }, [key, loadedKey]);

  /** Remember that the plan now matches this version of the built-in plan. */
  const markPresetSynced = useCallback((built: string) => {
    if (!stampKey) return;
    try { window.localStorage.setItem(stampKey, built); } catch { /* the notice may show again; harmless */ }
    setPresetStamp(built);
  }, [stampKey]);

  return { items: ready ? items : [], ready, commit, saveFailed, presetStamp, markPresetSynced, autoLoaded: ready && autoLoaded };
}
