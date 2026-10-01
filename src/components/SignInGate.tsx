"use client";

import { useUser } from "@/lib/user-context";
import { ProfileChoices } from "@/components/UserProfileModal";

/** Nothing in the app is shown until someone has signed in to a profile. */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useUser();

  if (isLoading) return <main className="flex-1" aria-busy="true" />;

  if (!currentUser) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 font-semibold text-slate-900">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm text-white">SR</span>
            <span className="text-lg">Score Recovery</span>
          </div>
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="text-center">
              <h1 className="text-2xl font-black text-slate-950">Sign in</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Choose your space. Your progress and learning history stay separate.</p>
            </div>
            <ProfileChoices />
          </div>
        </div>
      </main>
    );
  }

  return children;
}
