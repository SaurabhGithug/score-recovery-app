"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { MARK_LABEL, MARK_LEVELS, type MarkLevel, type MarkedQuestion, type QuestionMark } from "@/lib/marks";
import { MarkQuestion } from "@/components/marks/MarkQuestion";
import { SendToChatGpt } from "@/components/ai/SendToChatGpt";
import { SourceHtml } from "@/components/madeeasy/SourceHtml";

const BADGE: Record<MarkLevel, string> = {
  super_important: "border-rose-200 bg-rose-50 text-rose-800",
  important: "border-amber-200 bg-amber-50 text-amber-900",
  revise: "border-sky-200 bg-sky-50 text-sky-800",
};

/** Every question this learner marked, most important first, each shown in full with its answer behind a tap. */
export default function MarkedPage() {
  const { currentUser } = useUser();
  return <MarkedList key={currentUser?.id ?? "guest"} />;
}

function MarkedList() {
  const { t } = useLang();
  const [marks, setMarks] = useState<MarkedQuestion[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<MarkLevel | "all">("all");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/marks", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { marks?: MarkedQuestion[]; error?: string };
        if (!res.ok || !data.marks) throw new Error(data.error || "Could not load your marked questions.");
        setMarks(data.marks);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load your marked questions."); });
    return () => controller.abort();
  }, []);

  function changed(item: MarkedQuestion, mark: QuestionMark | null) {
    setMarks((current) => current?.flatMap((m) => m.kind !== item.kind || m.id !== item.id ? [m] : mark ? [{ ...m, ...mark }] : []) ?? null);
  }

  const count = (level: MarkLevel) => marks?.filter((m) => m.level === level).length ?? 0;
  const shown = marks?.filter((m) => filter === "all" || m.level === filter) ?? [];
  const chip = (active: boolean) => `min-h-10 rounded-full border px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;

  return <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
    <header>
      <p className="text-sm text-slate-500">SSC JE · Civil Engineering</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{t({ en: "Marked questions", hi: "चिह्नित प्रश्न" })}</h1>
      <p className="mt-2 text-sm text-slate-600">{t({ en: "Questions you marked after answering them in Tests or Made Easy. Most important first. Try each one before you open its answer.", hi: "टेस्ट या Made Easy में उत्तर देने के बाद चिह्नित किए गए प्रश्न। सबसे महत्वपूर्ण पहले। उत्तर खोलने से पहले हर प्रश्न खुद हल करें।" })}</p>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {!marks && !error && <p role="status" className="text-sm text-slate-500">{t({ en: "Loading your marked questions…", hi: "चिह्नित प्रश्न लोड हो रहे हैं…" })}</p>}

    {marks && marks.length === 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600 sm:p-6">
      <p className="font-semibold text-slate-900">{t({ en: "Nothing marked yet", hi: "अभी कुछ चिह्नित नहीं है" })}</p>
      <p className="mt-1">{t({ en: "After you answer a question, tap Revise, Important or Super important under it. It will appear here.", hi: "किसी प्रश्न का उत्तर देने के बाद उसके नीचे दोहराना, महत्वपूर्ण या अति महत्वपूर्ण दबाएँ। वह यहाँ दिखेगा।" })}</p>
      <Link href="/papers" className="mt-3 inline-flex min-h-11 items-center font-medium text-blue-700 underline">{t({ en: "Go to Tests →", hi: "टेस्ट पर जाएँ →" })}</Link>
    </section>}

    {marks && marks.length > 0 && <>
      <div role="group" aria-label={t({ en: "Show", hi: "दिखाएँ" })} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>{t({ en: "All", hi: "सभी" })} · {marks.length}</button>
        {MARK_LEVELS.map((level) => <button key={level} type="button" aria-pressed={filter === level} onClick={() => setFilter(level)} className={chip(filter === level)}>{t(MARK_LABEL[level])} · {count(level)}</button>)}
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-500">{t({ en: "No questions with this mark.", hi: "इस निशान वाला कोई प्रश्न नहीं।" })}</p>}
      <ol className="space-y-4">
        {shown.map((item) => <li key={`${item.kind}:${item.id}`}><MarkedCard item={item} onChange={(mark) => changed(item, mark)} /></li>)}
      </ol>
    </>}
  </main>;
}

function MarkedCard({ item, onChange }: { item: MarkedQuestion; onChange: (mark: QuestionMark | null) => void }) {
  const { t } = useLang();
  const view = item.view;
  const mark: QuestionMark = { kind: item.kind, id: item.id, level: item.level, note: item.note, createdAt: item.createdAt, updatedAt: item.updatedAt };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`rounded-full border px-2.5 py-0.5 font-semibold ${BADGE[item.level]}`}>{t(MARK_LABEL[item.level])}</span>
      <span className="text-slate-500">{view?.heading ?? item.id}</span>
    </div>

    {view ? <>
      {view.incomplete && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{view.incomplete}</p>}
      <div className="mt-3 text-sm leading-6 text-slate-900">
        {view.imageUrl && <img src={view.imageUrl} alt={t({ en: "The question as printed", hi: "छपा हुआ प्रश्न" })} className="mb-2 max-h-[360px] w-full rounded-lg border border-slate-200 object-contain" />}
        {view.questionHtml ? <SourceHtml html={view.questionHtml} /> : view.question.trim() && <p className="whitespace-pre-wrap">{view.question}</p>}
      </div>
      <ol className="mt-3 space-y-1.5 text-sm text-slate-800">
        {view.options.map((o) => <li key={o.label} className="flex gap-2 rounded-lg border border-slate-100 px-3 py-2">
          <span className="font-semibold">{o.label}.</span>
          {o.html ? <SourceHtml html={o.html} className="min-w-0 flex-1" /> : <span className="min-w-0 flex-1 whitespace-pre-wrap">{o.text}</span>}
        </li>)}
      </ol>
      <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">{t({ en: "Show answer and explanation", hi: "उत्तर और व्याख्या दिखाएँ" })}</summary>
        <div className="mt-2 space-y-2 text-slate-700">
          <p><strong className="text-slate-900">{t({ en: "Answer:", hi: "उत्तर:" })}</strong> {view.key ?? t({ en: "no settled key", hi: "कोई तय उत्तर नहीं" })} <span className="text-xs text-slate-500">({view.keySource})</span></p>
          {view.answerImageUrl && <img src={view.answerImageUrl} alt={t({ en: "The original scan, with the answer key", hi: "मूल स्कैन, उत्तर कुंजी के साथ" })} className="max-h-[360px] w-full rounded-lg border border-slate-200 object-contain" />}
          {view.learnerAnswer && <p><strong className="text-slate-900">{t({ en: "Your answer in the test:", hi: "टेस्ट में आपका उत्तर:" })}</strong> {view.learnerAnswer}</p>}
          {view.explanationHtml ? <SourceHtml html={view.explanationHtml} className="leading-6" /> : view.explanation && <p className="whitespace-pre-wrap leading-6">{view.explanation}</p>}
        </div>
      </details>
    </> : <p className="mt-3 text-sm text-slate-500">{t({ en: "This question can no longer be shown:", hi: "यह प्रश्न अब नहीं दिखाया जा सकता:" })} {item.unavailable}</p>}

    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
      <MarkQuestion kind={item.kind} id={item.id} initial={mark} onChange={onChange} />
      {view && <SendToChatGpt kind={item.kind} id={item.id} />}
    </div>
  </article>;
}
