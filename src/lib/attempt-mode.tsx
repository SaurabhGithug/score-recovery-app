"use client";

import { createContext, useContext, useEffect, useState } from "react";

// What the learner is currently doing, when it isn't safe (or realistic) to show normal
// navigation/tools. Both the exam and repair pages render entirely on a single URL (they
// switch between intro/running/results-style phases via internal state, not routing), so
// SiteHeader can't tell from the pathname alone — it has to be told.
//
// "exam"  — a live test. Its runner owns its test-only tools, including the calculator.
// "drill" — an untimed repair drill/retest. Hides nav so a
//           mid-drill tap can't silently lose the "unseen retest" evidence trail.
export type AttemptKind = "exam" | "drill" | null;

type AttemptModeContextValue = {
  kind: AttemptKind;
  setKind: (kind: AttemptKind) => void;
};

const AttemptModeContext = createContext<AttemptModeContextValue | null>(null);

export function AttemptModeProvider({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = useState<AttemptKind>(null);
  return <AttemptModeContext.Provider value={{ kind, setKind }}>{children}</AttemptModeContext.Provider>;
}

export function useAttemptMode(): AttemptModeContextValue {
  const ctx = useContext(AttemptModeContext);
  if (!ctx) throw new Error("useAttemptMode must be used within AttemptModeProvider");
  return ctx;
}

/** Convenience hook for a page to declare its current attempt kind — sets it whenever `kind`
 *  changes and always clears it (back to null) on unmount, so navigating away by any means
 *  (back button, a link, closing the tab) can never leave the app stuck in attempt mode. */
export function useDeclareAttemptMode(kind: AttemptKind) {
  const { setKind } = useAttemptMode();
  useEffect(() => {
    setKind(kind);
    return () => setKind(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
}
