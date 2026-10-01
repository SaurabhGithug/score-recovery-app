"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessProfilePath, isLearningOnlyProfile } from "@/lib/profile-access";
import { useUser } from "@/lib/user-context";

export function ProfileAccessGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !isLoading && isLearningOnlyProfile(currentUser) && !canAccessProfilePath(currentUser, pathname);

  useEffect(() => {
    if (blocked) router.replace("/learn");
  }, [blocked, router]);

  if (blocked) {
    return <main className="mx-auto w-full max-w-xl px-5 py-16 text-sm text-slate-600">Opening the Mechanical learning space…</main>;
  }

  return children;
}
