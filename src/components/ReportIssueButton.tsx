"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { genId, saveDispute } from "@/lib/storage";
import { DISPUTE_REASON_LABEL, DisputeReason, Question } from "@/lib/types";
import { useUser } from "@/lib/user-context";

const REASONS: DisputeReason[] = ["wrong_answer", "ambiguous", "translation", "typo", "other"];

/**
 * "Report a problem with this question" — kept as its own dedicated action, entirely separate
 * from any personal-cause/confidence UI. A five-lens review of this product's diagnosis design
 * flagged that folding "the question was wrong" into the same menu as personal error causes
 * creates a motivated-reasoning bias (every wrong answer gets an incentive to blame the
 * question) that would both corrupt the cause-diagnosis data and silently inflate the
 * question-dispute-rate quality gate. This button intentionally has nothing to do with scoring,
 * diagnosis, or the repair loop — it only ever writes to the disputes log.
 */
export function ReportIssueButton({ question, className = "" }: { question: Question; className?: string }) {
  const { t } = useLang();
  const { currentUser, activeContext } = useUser();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>("wrong_answer");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!currentUser) return;
    setIsSending(true);
    setError("");
    saveDispute({
      id: genId("dispute"),
      questionId: question.id,
      questionVersion: question.version ?? 1,
      reason,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      status: "open",
    }, currentUser.id);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          category: "question_issue",
          questionId: question.id.startsWith("iq_") ? question.id : null,
          contextId: activeContext?.id,
          placement: "question_report",
          message: `${reason}${note.trim() ? `: ${note.trim()}` : ""}`,
          metadata: {
            questionId: question.id,
            questionVersion: question.version ?? 1,
            reason,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Report could not be sent");
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Report could not be sent");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`text-xs font-medium text-slate-400 underline decoration-dotted hover:text-slate-600 ${className}`}
      >
        {t({ en: "⚑ Report a problem with this question", hi: "⚑ इस प्रश्न में समस्या की सूचना दें" })}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            {submitted ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  {t({ en: "Thanks — logged for editorial review.", hi: "धन्यवाद — संपादकीय समीक्षा हेतु दर्ज किया गया।" })}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t({
                    en: "This does not change your score or diagnosis for this attempt.",
                    hi: "इससे इस प्रयास के आपके स्कोर या निदान में कोई बदलाव नहीं होता।",
                  })}
                </p>
                <button
                  onClick={() => {
                    setOpen(false);
                    setSubmitted(false);
                    setNote("");
                    setReason("wrong_answer");
                  }}
                  className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  {t({ en: "Close", hi: "बंद करें" })}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-slate-900">
                  {t({ en: "What's wrong with this question?", hi: "इस प्रश्न में क्या समस्या है?" })}
                </h3>
                <div className="mt-3 flex flex-col gap-1.5">
                  {REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50">
                      <input type="radio" name="dispute-reason" checked={reason === r} onChange={() => setReason(r)} />
                      {t(DISPUTE_REASON_LABEL[r])}
                    </label>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t({ en: "Optional details", hi: "वैकल्पिक विवरण" })}
                  className="mt-3 w-full rounded-md border border-slate-200 p-2 text-sm"
                  rows={2}
                />
                {error && <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
                    {t({ en: "Cancel", hi: "रद्द करें" })}
                  </button>
                  <button disabled={isSending} onClick={submit} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {isSending ? t({ en: "Sending…", hi: "भेज रहे हैं…" }) : t({ en: "Submit report", hi: "रिपोर्ट सबमिट करें" })}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
