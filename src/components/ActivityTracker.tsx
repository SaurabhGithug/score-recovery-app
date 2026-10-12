"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@/lib/user-context";
import { track } from "@/lib/activity-client";

/** Logs each page a signed-in learner opens (path and query), once per change. Renders nothing. */
export function ActivityTracker() {
  const { currentUser } = useUser();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const last = useRef("");
  useEffect(() => {
    if (!currentUser) return;
    const page = `${pathname}${search ? `?${search}` : ""}`.slice(0, 300);
    const key = `${currentUser.id}:${page}`;
    if (key === last.current) return;
    last.current = key;
    track("page.view", { kind: "page", id: page });
  }, [currentUser, pathname, search]);
  return null;
}
