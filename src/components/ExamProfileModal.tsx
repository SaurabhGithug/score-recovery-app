"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@/lib/user-context";
import { broPreferenceError, validBirthDate, ELIGIBILITY_NOTICE } from "@/lib/ssc-je/eligibility";

interface ExamProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const DEPARTMENTS = [
  ["CPWD", "Central Public Works Department (CPWD)"],
  ["BRO", "Border Roads Organisation (BRO)"],
  ["MES", "Military Engineer Services (MES)"],
  ["CWC", "Central Water Commission (CWC)"],
  ["CWPRS", "Central Water & Power Research Station"],
  ["DGQA", "Directorate General of Quality Assurance (Naval)"],
  ["NTRO", "National Technical Research Organisation (NTRO)"],
  ["FBP", "Farakka Barrage Project"],
];
const DEFAULTS = { category: "UR", dateOfBirth: "", gender: "", pwbdStatus: false, pwbdType: "", exServicemanStatus: false, targetPosts: [] as string[] };

export function ExamProfileModal({ isOpen, onClose, onSaved }: ExamProfileModalProps) {
  const { activeContext, openOnboardingModal } = useUser();
  const contextId = activeContext?.id;
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState(DEFAULTS);
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !contextId) return;
    const controller = new AbortController();
    // Load once per open/context; stale requests must never overwrite edits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("loading");
    setError("");
    fetch(`/api/contexts/${contextId}/profile`, { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load your profile.");
        if (controller.signal.aborted) return;
        const p = data.profile;
        const posts = typeof p?.target_posts === "string" ? JSON.parse(p.target_posts) : p?.target_posts;
        setProfile(p ? {
          category: p.category || "UR", dateOfBirth: p.date_of_birth || "",
          gender: p.gender || "",
          pwbdStatus: Boolean(p.pwbd_status), pwbdType: p.pwbd_type || "",
          exServicemanStatus: Boolean(p.ex_serviceman_status),
          targetPosts: Array.isArray(posts) ? posts : [],
        } : { ...DEFAULTS, targetPosts: [] });
        setPhase("ready");
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Could not load your profile.");
        setPhase("error");
      });
    return () => controller.abort();
  }, [isOpen, contextId, retry]);

  if (!isOpen) return null;
  const validationError = profile.dateOfBirth && !validBirthDate(profile.dateOfBirth)
    ? "Enter a real date of birth that is not in the future."
    : broPreferenceError(profile.gender, profile.targetPosts);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!contextId || phase !== "ready") return;
    if (validationError) { setError(validationError); return; }
    setPhase("saving");
    setError("");
    try {
      const res = await fetch(`/api/contexts/${contextId}/profile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, gender: profile.gender || null, dateOfBirth: profile.dateOfBirth || null, pwbdType: profile.pwbdStatus ? profile.pwbdType || null : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save. Please try again.");
      window.dispatchEvent(new Event("exam-profile-changed"));
      onSaved?.();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Please try again.");
      setPhase("ready");
    }
  }
  const field = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3";
  return <dialog ref={dialog} className="install-dialog rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl"
    aria-labelledby="exam-profile-title" onCancel={event => { event.preventDefault(); if (phase !== "saving") onClose(); }}>
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="exam-profile-title" className="text-xl font-semibold">Exam preferences</h2><p className="mt-2 text-sm text-slate-500">Save your preferences. Eligibility must be checked against the official notice.</p></div>
      <button type="button" aria-label="Close exam preferences" disabled={phase === "saving"} onClick={onClose} className="min-h-11 min-w-11 rounded-lg border border-slate-200">✕</button>
    </div>
    {!contextId ? <div className="mt-5"><p className="text-sm">Choose a preparation goal before saving preferences.</p><button onClick={() => { onClose(); openOnboardingModal(); }} className="mt-4 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white">Choose goal</button></div> : <>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {phase === "error" && <button type="button" onClick={() => setRetry(n => n + 1)} className="mt-3 rounded-lg border px-4 py-2">Retry loading</button>}
      {phase === "loading" && <p role="status" className="mt-4 text-sm">Loading saved preferences…</p>}
      <form onSubmit={save} className="mt-5">
        <fieldset disabled={phase !== "ready"} className="space-y-5 disabled:opacity-60">
          <fieldset><legend className="mb-2 text-sm font-medium">Category</legend><div className="flex flex-wrap gap-2">
            {["UR", "EWS", "OBC", "SC", "ST"].map(category => <button key={category} type="button" aria-pressed={profile.category === category}
              onClick={() => setProfile(p => ({ ...p, category }))}
              className={"min-h-11 rounded-lg border px-3 text-sm " + (profile.category === category ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300")}>{category}</button>)}
          </div></fieldset>
          <label className="block text-sm font-medium">Date of birth (optional)<input type="date" min="0001-01-01" max={new Date().toISOString().slice(0, 10)} value={profile.dateOfBirth} onChange={e => setProfile(p => ({ ...p, dateOfBirth: e.target.value }))} className={field}/></label>
          <label className="block text-sm font-medium">Gender (required only for BRO preference)<select value={profile.gender} onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))} className={field}><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={profile.pwbdStatus} onChange={e => setProfile(p => ({ ...p, pwbdStatus: e.target.checked, pwbdType: e.target.checked ? p.pwbdType : "" }))} className="h-5 w-5 shrink-0"/>Person with Benchmark Disability (PwBD)</label>
          {profile.pwbdStatus && <label className="block text-sm">Disability category<select value={profile.pwbdType} onChange={e => setProfile(p => ({ ...p, pwbdType: e.target.value }))} className={field}><option value="">Not specified</option><option value="OH">Locomotor (OH)</option><option value="HH">Hard of hearing (HH)</option><option value="VH">Visual (VH)</option><option value="Others">Others / multiple disabilities</option></select></label>}
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={profile.exServicemanStatus} onChange={e => setProfile(p => ({ ...p, exServicemanStatus: e.target.checked }))} className="h-5 w-5 shrink-0"/>Ex-serviceman (ESM)</label>
          <fieldset><legend className="mb-2 text-sm font-medium">Preferred departments (optional)</legend><div className="space-y-2">
            {DEPARTMENTS.map(([id, name]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <input type="checkbox" disabled={id === "BRO" && profile.gender !== "male" && !profile.targetPosts.includes(id)} checked={profile.targetPosts.includes(id)} onChange={() => setProfile(p => ({ ...p, targetPosts: p.targetPosts.includes(id) ? p.targetPosts.filter(x => x !== id) : [...p.targetPosts, id] }))} className="h-5 w-5 shrink-0"/><span>{name}{id === "BRO" && <small className="mt-1 block text-slate-500">Male candidates only. Other eligibility conditions still apply.</small>}</span>
            </label>)}
          </div><a href={ELIGIBILITY_NOTICE + "#page=7"} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-700 underline">SSC JE 2026 notice, paragraph 5.3</a></fieldset>
          {validationError && <p role="alert" className="text-sm text-rose-800">{validationError}</p>}
        </fieldset>
        <div className="sticky bottom-0 mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3">
          <button type="button" disabled={phase === "saving"} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-3 text-sm">Cancel</button>
          <button type="submit" disabled={phase !== "ready" || Boolean(validationError)} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{phase === "saving" ? "Saving…" : "Save preferences"}</button>
        </div>
      </form>
    </>}
  </dialog>;
}
