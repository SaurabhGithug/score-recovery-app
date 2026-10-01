"use client";

import { useState } from "react";
import { useUser } from "@/lib/user-context";
import type { FixedProfile } from "@/lib/user-context";

const PROFILES: { id: FixedProfile; name: string; initial: string; description: string }[] = [
  { id: "reema", name: "Reema", initial: "R", description: "Open Reema’s learning space" },
  { id: "saurabh", name: "Saurabh", initial: "S", description: "Open Saurabh’s learning space" },
];

export function UserProfileModal() {
  const { isProfileModalOpen, closeProfileModal, selectProfile } = useUser();
  const [submittingProfile, setSubmittingProfile] = useState<FixedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isProfileModalOpen) return null;

  async function handleSelect(profile: FixedProfile) {
    setSubmittingProfile(profile);
    setError(null);
    try {
      await selectProfile(profile);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open your account. Please try again.");
    } finally {
      setSubmittingProfile(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-8">
        <div className="text-center">
          <h2 id="account-title" className="text-2xl font-black text-slate-950">Choose your space</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Your progress and learning history stay separate.</p>
        </div>

        <div className="mt-6 grid gap-3">
          {PROFILES.map((profile, index) => {
            const isOpening = submittingProfile === profile.id;
            return <button
              key={profile.id}
              type="button"
              autoFocus={index === 0}
              onClick={() => void handleSelect(profile.id)}
              disabled={submittingProfile !== null}
              className="flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
            >
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-black text-white">{profile.initial}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black text-slate-950">{profile.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{isOpening ? "Opening…" : profile.description}</span>
              </span>
              <span aria-hidden="true" className="text-xl text-slate-400">→</span>
            </button>;
          })}
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}

        <button type="button" onClick={closeProfileModal} className="mt-4 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800">Close</button>
      </div>
    </div>
  );
}
