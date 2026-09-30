"use client";

import { useState } from "react";
import { useUser } from "@/lib/user-context";

type FeedbackCategory = "content" | "experience" | "technical" | "idea";

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "content", label: "Question or explanation" },
  { value: "experience", label: "Practice experience" },
  { value: "technical", label: "Something is not working" },
  { value: "idea", label: "Feature idea" },
];

export function FeedbackButton({
  documentId,
  placement,
  compact = false,
}: {
  documentId?: string;
  placement: string;
  compact?: boolean;
}) {
  const { currentUser, activeContext, openProfileModal } = useUser();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("experience");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  function openFeedback() {
    if (!currentUser) {
      openProfileModal();
      return;
    }
    setOpen(true);
  }

  async function submit() {
    if (!currentUser || message.trim().length < 3) return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          category,
          rating,
          message: message.trim(),
          documentId,
          contextId: activeContext?.id,
          placement,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Feedback could not be sent");
      setStatus("sent");
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Feedback could not be sent");
    }
  }

  function close() {
    setOpen(false);
    window.setTimeout(() => {
      setStatus("idle");
      setMessage("");
      setRating(null);
      setError("");
    }, 150);
  }

  return (
    <>
      <button
        type="button"
        onClick={openFeedback}
        className={
          compact
            ? "rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            : "shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:border-blue-300 hover:text-blue-700"
        }
      >
        💬 {compact ? "Feedback" : "Send feedback"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Send feedback">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            {status === "sent" ? (
              <div className="py-3 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700">✓</div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">Thank you</h2>
                <p className="mt-1 text-sm text-slate-500">Your feedback has been saved for the product team to review.</p>
                <button type="button" onClick={close} className="mt-5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">Done</button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Help us improve</h2>
                    <p className="mt-1 text-xs text-slate-500">Tell us what would make learning with MCQs better.</p>
                  </div>
                  <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close feedback">✕</button>
                </div>

                <label className="mt-5 block text-xs font-semibold text-slate-700">
                  Feedback about
                  <select value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800">
                    {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <fieldset className="mt-4">
                  <legend className="text-xs font-semibold text-slate-700">How was this experience? <span className="font-normal text-slate-400">(optional)</span></legend>
                  <div className="mt-2 flex gap-1" aria-label="Rating out of five">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" onClick={() => setRating(value)} className={`rounded-lg px-2 py-1 text-xl ${rating !== null && value <= rating ? "bg-amber-50 text-amber-500" : "text-slate-300 hover:bg-slate-50"}`} aria-label={`${value} star rating`}>★</button>
                    ))}
                  </div>
                </fieldset>

                <label className="mt-4 block text-xs font-semibold text-slate-700">
                  Your feedback
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={4} placeholder="What worked, what did not, or what should we add?" className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 p-3 text-sm font-normal text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </label>
                <div className="mt-1 text-right text-[11px] text-slate-400">{message.length}/2000</div>
                {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
                  <button type="button" disabled={message.trim().length < 3 || status === "sending"} onClick={submit} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{status === "sending" ? "Sending…" : "Send feedback"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
