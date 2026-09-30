"use client";

import { useEffect, type ReactNode } from "react";

/** Keep PWA offline support; installation is handled entirely by the browser. */
export function InstallAppProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.isSecureContext && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        console.warn("Offline fallback is unavailable; the app can still be used online.");
      });
    }
  }, []);
  return children;
}
