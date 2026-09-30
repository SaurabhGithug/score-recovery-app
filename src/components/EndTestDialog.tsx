"use client";

import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n";

/** Native dialog traps focus and restores the trigger on close. */
export function EndTestDialog({ answered, total, busy = false, error, warning, onCancel, onSubmit }: {
  answered: number; total: number; busy?: boolean; error?: string; warning?: string;
  onCancel: () => void; onSubmit: (returnToMenu: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { t } = useLang();
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    cancel.current?.focus();
    return () => { dialog?.close(); if (trigger instanceof HTMLElement) trigger.focus(); };
  }, []);
  return <dialog ref={ref} className="install-dialog w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl" aria-labelledby="end-test-title" onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="end-test-title" className="text-lg font-bold">{t({ en: "End this test?", hi: "यह टेस्ट समाप्त करें?" })}</h2>
    <p className="mt-3 text-sm text-slate-600">{answered}/{total} {t({ en: "answered. Your attempt will be finalized. You cannot change these answers after submitting.", hi: "उत्तरित। सबमिट करने के बाद उत्तर नहीं बदल सकेंगे।" })}</p>
    {warning && <p className="mt-3 text-sm text-amber-800">{warning}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 flex flex-col gap-2">
      <button type="button" disabled={busy} onClick={() => onSubmit(true)} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{t({ en: busy ? "Saving…" : "End & return to menu", hi: busy ? "सहेज रहे हैं…" : "समाप्त करें और मेन्यू पर जाएँ" })}</button>
      <button type="button" disabled={busy} onClick={() => onSubmit(false)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50">{t({ en: "End & view results", hi: "समाप्त करें और परिणाम देखें" })}</button>
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className="rounded-xl px-4 py-3 text-sm text-slate-600">{t({ en: "Continue test", hi: "टेस्ट जारी रखें" })}</button>
    </div>
  </dialog>;
}
