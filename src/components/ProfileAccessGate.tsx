"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessProfilePath, isLearningOnlyProfile, profileHome } from "@/lib/profile-access";
import { useUser } from "@/lib/user-context";

export function ProfileAccessGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !isLoading && !!currentUser && !canAccessProfilePath(currentUser, pathname);

  useEffect(() => {
    if (blocked) router.replace(profileHome(currentUser));
  }, [blocked, currentUser, router]);

  if (blocked) {
    return <main className="mx-auto w-full max-w-xl px-5 py-16 text-sm text-slate-600">{isLearningOnlyProfile(currentUser) ? "Opening the Mechanical learning space…" : "Opening…"}</main>;
  }

  return children;
}
