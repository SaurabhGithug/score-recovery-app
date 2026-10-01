"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { StructuredAnswer } from "@/components/ai/AskFollowUp";
import { AiGeneratedBadge } from "@/components/ai/AiGeneratedBadge";
import { api, aiDetail, CheckNote, SearchSuggestions, SourcesList, type AnswerCheck, type LangCode, type Source } from "./shared";

interface AskResponse { answer: string; model: string; grounded: boolean; sources: Source[]; searchEntryPointHtml: string | null; check: { id: string | null; status: AnswerCheck["status"] } }
type Turn = { role: "user"; text: string } | { role: "model"; text: string; meta: AskResponse; check: AnswerCheck };

const CHIPS = [
  { en: "Why does this clause exist?", hi: "यह क्लॉज़ क्यों है?" },
  { en: "Give a real lab example", hi: "प्रयोगशाला का असली उदाहरण दीजिए" },
  { en: "What would an NABL assessor ask here?", hi: "NABL असेसर यहाँ क्या पूछेगा?" },
  { en: "Difference between verification and validation?", hi: "वेरिफ़िकेशन और वैलिडेशन में अंतर?" },
];

export function StandardsChat({ standardId, clauseNo, lang }: { standardId: string; clauseNo: string; lang: LangCode }) {
  const { t } = useLang();
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

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setDraft("");
    const history = turns.slice(-8).map(x => ({ role: x.role, text: x.text }));
    setTurns(prev => [...prev, { role: "user", text }]);
    try {
      const res = await api<AskResponse>(`/api/standards/${encodeURIComponent(standardId)}/ask`, { message: text, history, clauseNo, lang });
      setTurns(prev => [...prev, { role: "model", text: res.answer, meta: res, check: { status: res.check?.status ?? "unavailable" } }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-label={t({ en: "Ask anything about this standard", hi: "इस मानक के बारे में कुछ भी पूछें" })} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">{t({ en: "Ask anything about this standard", hi: "इस मानक के बारे में कुछ भी पूछें" })}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{t({ en: `Questions are asked in the context of clause ${clauseNo}.`, hi: `प्रश्न क्लॉज़ ${clauseNo} के संदर्भ में पूछे जाते हैं।` })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map(c => <button key={c.en} type="button" disabled={busy} onClick={() => void send(t(c))} className="min-h-9 rounded-full border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50">{t(c)}</button>)}
      </div>
      <div className="mt-3 space-y-3">
        {turns.map((turn, i) => turn.role === "user" ? (
          <p key={i} className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-blue-600 px-3 py-2 text-sm text-white">{turn.text}</p>
        ) : (
          <div key={i} className="min-w-0 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
            <AiGeneratedBadge detail={aiDetail(turn.meta.model, turn.meta.grounded, t)} />
            <StructuredAnswer answer={turn.text} />
            <SourcesList sources={turn.meta.sources ?? []} />
            {turn.meta.searchEntryPointHtml && <SearchSuggestions html={turn.meta.searchEntryPointHtml} />}
            <CheckNote check={turn.check} />
          </div>
        ))}
        {busy && <p role="status" className="text-xs text-slate-500">{t({ en: "Thinking…", hi: "सोच रहा है…" })}</p>}
        {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </div>
      <form onSubmit={e => { e.preventDefault(); void send(draft); }} className="sticky bottom-14 mt-3 flex gap-2 bg-white pt-2 sm:bottom-0">
        <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={1000} placeholder={t({ en: "Ask a question…", hi: "प्रश्न पूछें…" })} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        <button type="submit" disabled={busy || !draft.trim()} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{t({ en: "Ask", hi: "पूछें" })}</button>
      </form>
    </section>
  );
}
