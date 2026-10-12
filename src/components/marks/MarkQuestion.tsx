"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { MARK_LABEL, MARK_NOTE_MAX, type MarkLevel, type MarkSourceKind, type QuestionMark } from "@/lib/marks";

/** Shown left to right from least to most important. */
const CHOICES: MarkLevel[] = ["revise", "important", "super_important"];

const STYLE: Record<MarkLevel, { on: string; off: string }> = {
  revise: { on: "border-sky-600 bg-sky-600 text-white", off: "border-sky-200 bg-white text-sky-800 hover:bg-sky-50" },
  important: { on: "border-amber-500 bg-amber-500 text-white", off: "border-amber-200 bg-white text-amber-800 hover:bg-amber-50" },
  super_important: { on: "border-rose-600 bg-rose-600 text-white", off: "border-rose-200 bg-white text-rose-800 hover:bg-rose-50" },
};

async function save(kind: MarkSourceKind, id: string, level: MarkLevel | null, note?: string): Promise<QuestionMark | null> {
  const res = await fetch("/api/marks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note === undefined ? { kind, id, level } : { kind, id, level, note }),
  });
  const data = (await res.json().catch(() => ({}))) as { mark?: QuestionMark | null; error?: string };
  if (!res.ok) throw new Error(data.error || "Could not save the mark.");
  return data.mark ?? null;
}

/**
 * Revise / Important / Super important for one answered question, with an optional note. Tapping the
 * chosen level again clears the mark. Pass `initial` when the mark is already known (the marked list),
 * so the control does not fetch it again.
 */
export function MarkQuestion({ kind, id, initial, onChange }: {
  kind: MarkSourceKind;
  id: string;
  initial?: QuestionMark | null;
  onChange?: (mark: QuestionMark | null) => void;
}) {
  const { t } = useLang();
  const key = `${kind}:${id}`;
  const [loaded, setLoaded] = useState<{ key: string; mark: QuestionMark | null } | null>(initial !== undefined ? { key, mark: initial } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (initial !== undefined) return;
    const controller = new AbortController();
    fetch(`/api/marks?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { mark: null }))
      .then((data: { mark: QuestionMark | null }) => setLoaded({ key, mark: data.mark }))
      .catch(() => { if (!controller.signal.aborted) setLoaded({ key, mark: null }); });
    return () => controller.abort();
  }, [kind, id, key, initial]);

  const mark = loaded?.key === key ? loaded.mark : null;
  const ready = loaded?.key === key;

  async function apply(level: MarkLevel | null, note?: string) {
    setBusy(true);
    setError("");
    try {
      const next = await save(kind, id, level, note);
      setLoaded({ key, mark: next });
      onChange?.(next);
      if (note !== undefined || next === null) setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the mark.");
    } finally {
      setBusy(false);
    }
  }

  function choose(level: MarkLevel) {
    if (mark?.level !== level) { void apply(level); return; }
    if (mark.note && !window.confirm(t({ en: "Remove this mark and its note?", hi: "यह निशान और इसका नोट हटाएँ?" }))) return;
    void apply(null);
  }

  return (
    <div className="text-xs" aria-busy={busy || !ready}>
      <div role="group" aria-label={t({ en: "Mark this question", hi: "इस प्रश्न को चिह्नित करें" })} className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 font-semibold text-slate-600">{t({ en: "Mark:", hi: "चिह्न:" })}</span>
        {CHOICES.map((level) => {
          const on = mark?.level === level;
          return <button
            key={level}
            type="button"
            disabled={busy || !ready}
            aria-pressed={on}
            onClick={() => choose(level)}
            className={`min-h-9 rounded-full border px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:opacity-60 ${on ? STYLE[level].on : STYLE[level].off}`}
          >{on ? "✓ " : ""}{t(MARK_LABEL[level])}</button>;
        })}
        {mark && !editing && <button type="button" onClick={() => { setDraft(mark.note); setEditing(true); }} className="min-h-9 px-1.5 text-slate-600 underline">
          {mark.note ? t({ en: "Edit note", hi: "नोट बदलें" }) : t({ en: "Add note", hi: "नोट जोड़ें" })}
        </button>}
      </div>
      {mark?.note && !editing && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-700">{mark.note}</p>}
      {mark && editing && <div className="mt-2">
        <label className="block">
          <span className="sr-only">{t({ en: "Your note", hi: "आपका नोट" })}</span>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={MARK_NOTE_MAX} autoFocus
            placeholder={t({ en: "Why you marked it, e.g. forgot the formula, silly mistake", hi: "क्यों चिह्नित किया, जैसे सूत्र भूल गए, छोटी गलती" })}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900" />
        </label>
        <div className="mt-1 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void apply(mark.level, draft)} className="min-h-9 rounded-lg bg-slate-900 px-3 font-semibold text-white disabled:opacity-60">{t({ en: "Save note", hi: "नोट सहेजें" })}</button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-lg px-2 text-slate-600 underline">{t({ en: "Cancel", hi: "रद्द करें" })}</button>
        </div>
      </div>}
      {error && <p role="alert" className="mt-1 text-rose-700">{error}</p>}
    </div>
  );
}
