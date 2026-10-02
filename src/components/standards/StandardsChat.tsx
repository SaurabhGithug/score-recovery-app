"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { AiGeneratedBadge } from "@/components/ai/AiGeneratedBadge";
import { ReadingAnswer } from "./LessonPanel";
import { api, aiDetail, CheckNote, ChevronIcon, SearchSuggestions, SourcesDisclosure, type AnswerCheck, type LangCode, type Source } from "./shared";

interface AskResponse { answer: string; model: string; grounded: boolean; sources: Source[]; searchEntryPointHtml: string | null; check: { id: string | null; status: AnswerCheck["status"] } }
type Turn = { role: "user"; text: string; clauseNo: string } | { role: "model"; text: string; meta: AskResponse; check: AnswerCheck };

/** Two starters, shown only in the opened panel before the first question. */
const STARTERS = [
  { en: "Why does this clause exist?", hi: "यह क्लॉज़ क्यों है?" },
  { en: "Give a real lab example", hi: "प्रयोगशाला का असली उदाहरण दीजिए" },
];

/**
 * One quiet button that opens the question box. The conversation (and the clause each question was asked about)
 * is kept when the box is closed or the learner moves to another clause.
 */
export function StandardsChat({ standardId, clauseNo, lang }: { standardId: string; clauseNo: string; lang: LangCode }) {
  const { t } = useLang();
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Open for one clause at a time: moving to another clause folds the box away again.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === clauseNo;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const turnsRef = useRef(turns);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  const pendingKey = turns.map(x => (x.role === "model" && x.check.status === "pending" ? (x.meta.check.id ?? "") : "")).join("|");

  // Poll every pending check until the second AI finishes.
  useEffect(() => {
    if (!pendingKey.replace(/\|/g, "")) return;
    const timer = setInterval(async () => {
      for (const turn of turnsRef.current) {
        if (turn.role !== "model" || turn.check.status !== "pending" || !turn.meta.check.id) continue;
        const id = turn.meta.check.id;
        try {
          const check = await api<AnswerCheck>(`/api/standards/check?id=${encodeURIComponent(id)}`);
          if (check.status !== "pending") setTurns(prev => prev.map(x => x.role === "model" && x.meta.check.id === id ? { ...x, check } : x));
        } catch (e) {
          const message = e instanceof Error ? e.message : "failed";
          setTurns(prev => prev.map(x => x.role === "model" && x.meta.check.id === id ? { ...x, check: { status: "failed", error: message } } : x));
        }
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingKey]);

  // Opening the box brings it into view and puts the cursor in the question field.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    toggleRef.current?.scrollIntoView({ block: "start" });
  }, [open]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setDraft("");
    const history = turns.slice(-8).map(x => ({ role: x.role, text: x.text }));
    setTurns(prev => [...prev, { role: "user", text, clauseNo }]);
    try {
      const res = await api<AskResponse>(`/api/standards/${encodeURIComponent(standardId)}/ask`, { message: text, history, clauseNo, lang });
      setTurns(prev => [...prev, { role: "model", text: res.answer, meta: res, check: { status: res.check?.status ?? "unavailable" } }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <section>
      <button ref={toggleRef} type="button" onClick={() => setOpenFor(open ? null : clauseNo)} aria-expanded={open} aria-controls={panelId} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-base font-medium text-blue-700 hover:text-blue-900">
        <ChevronIcon className={`h-4 w-4 ${open ? "rotate-90" : ""}`} />
        {t({ en: "Ask a question about this clause", hi: "इस क्लॉज़ के बारे में प्रश्न पूछें" })}
      </button>
      {open && (
        <div id={panelId} className="mt-3">
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {STARTERS.map(c => <button key={c.en} type="button" disabled={busy} onClick={() => void send(t(c))} className="min-h-11 rounded-full border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t(c)}</button>)}
            </div>
          )}
          <div className="space-y-3">
            {turns.map((turn, i) => turn.role === "user" ? (
              <div key={i} className={i > 0 ? "pt-5" : undefined}>
                {turn.clauseNo !== clauseNo && <p className="text-sm text-slate-600">{t({ en: `About clause ${turn.clauseNo}`, hi: `क्लॉज़ ${turn.clauseNo} के बारे में` })}</p>}
                <p className="whitespace-pre-wrap break-words text-base font-semibold leading-7 text-slate-900">{turn.text}</p>
              </div>
            ) : (
              <div key={i} className="min-w-0">
                <AiGeneratedBadge detail={aiDetail(turn.meta.model, turn.meta.grounded, t)} />
                <div className="mt-3"><ReadingAnswer text={turn.text} /></div>
                <CheckNote check={turn.check} />
                <SourcesDisclosure sources={turn.meta.sources ?? []} />
                {turn.meta.searchEntryPointHtml && <SearchSuggestions html={turn.meta.searchEntryPointHtml} />}
              </div>
            ))}
            {busy && <p role="status" className="text-sm text-slate-600">{t({ en: "Thinking…", hi: "सोच रहा है…" })}</p>}
            {error && <p role="alert" className="text-base text-rose-700">{error}</p>}
          </div>
          <form onSubmit={e => { e.preventDefault(); void send(draft); }} className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] mt-4 flex gap-2 bg-white py-3 sm:bottom-0">
            <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1000} aria-label={t({ en: "Your question", hi: "आपका प्रश्न" })} placeholder={t({ en: "Ask a question…", hi: "प्रश्न पूछें…" })} className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-base" />
            <button type="submit" disabled={busy || !draft.trim()} className="min-h-12 rounded-xl bg-blue-600 px-5 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{t({ en: "Ask", hi: "पूछें" })}</button>
          </form>
        </div>
      )}
    </section>
  );
}
