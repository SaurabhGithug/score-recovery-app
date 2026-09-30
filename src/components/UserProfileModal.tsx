"use client";

import { useState } from "react";
import { useUser } from "@/lib/user-context";

type Mode = "signin" | "register";

export function UserProfileModal() {
  const { isProfileModalOpen, closeProfileModal, signIn, register } = useUser();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isProfileModalOpen) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || password.length < 8) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "signin") await signIn(name, password);
      else await register(name, password);
      setName("");
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-8">
        <div className="text-center">
          <h2 id="account-title" className="text-2xl font-black text-slate-950">{mode === "signin" ? "Sign in" : "Create account"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Keep your learning history separate.</p>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-bold">
          <button type="button" onClick={() => { setMode("signin"); setError(null); }} className={`rounded-lg py-2 ${mode === "signin" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Sign in</button>
          <button type="button" onClick={() => { setMode("register"); setError(null); }} className={`rounded-lg py-2 ${mode === "register" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Create account</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Name</span>
            <input type="text" autoFocus autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Saurabh" maxLength={60} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" disabled={submitting} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Password</span>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"} minLength={8} maxLength={128} className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-24 text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" disabled={submitting} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {mode === "register" && <p className="mt-1.5 text-xs text-slate-500">Use 8–128 characters.</p>}
          </label>
          {mode === "register" && <details className="text-xs text-slate-500"><summary className="cursor-pointer">About older accounts</summary><p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 leading-5 text-amber-900">An older account without a password cannot be opened just by typing its name.</p></details>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          <button type="submit" disabled={submitting || name.trim().length < 2 || password.length < 8} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button type="button" onClick={closeProfileModal} className="mt-4 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800">Close</button>
      </div>
    </div>
  );
}
