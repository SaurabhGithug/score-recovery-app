"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { AiGeneratedBadge } from "@/components/ai/AiGeneratedBadge";
import type { ResultQuestion, ResultView } from "@/lib/standards/quiz-types";
import { formatClock } from "./api";

type Filter = "all" | "wrong" | "skipped" | "marked";

export function QuizResult({ result, standardId, busy, actionError, onRetake, onNewTest }: {
  result: ResultView;
  standardId: string;
  busy: boolean;
  actionError: React.ReactNode;
  onRetake: () => void;
  onNewTest: () => void;
}) {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<Filter>("all");
  const pct = result.total ? Math.round((100 * result.correct) / result.total) : 0;
  const studyHref = (clauseNo: string) => `/standards/${encodeURIComponent(standardId)}#cl-${encodeURIComponent(clauseNo)}`;
  const filters: { id: Filter; en: string; hi: string; count: number }[] = [
    { id: "all", en: "All", hi: "सभी", count: result.total },
    { id: "wrong", en: "Wrong", hi: "गलत", count: result.wrong },
    { id: "skipped", en: "Skipped", hi: "छोड़े गए", count: result.skipped },
    { id: "marked", en: "Marked", hi: "चिह्नित", count: result.questions.filter((q) => q.marked).length },
  ];
  const shown = result.questions
    .map((q, i) => ({ q, n: i + 1 }))
    .filter(({ q }) => filter === "all" || (filter === "wrong" ? q.yourAnswer !== null && !q.correct : filter === "skipped" ? q.yourAnswer === null : q.marked));
  const date = new Date(result.submittedAt).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <Link href={`/standards/${encodeURIComponent(standardId)}`} className="text-xs text-blue-700 underline">← {t({ en: "Back to study", hi: "अध्ययन पर वापस" })}</Link>

      <section aria-labelledby="quiz-score" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t({ en: "Test result", hi: "टेस्ट परिणाम" })}</p>
        <p className="mt-0.5 break-words text-sm text-slate-600">{result.scopeLabel} · {date}</p>
        <h1 id="quiz-score" className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tabular-nums text-slate-900 sm:text-5xl">{result.correct} / {result.total}</span>
          <span className={`text-2xl font-bold tabular-nums ${pct >= 70 ? "text-emerald-700" : pct >= 40 ? "text-amber-700" : "text-rose-700"}`}>{pct}%</span>
        </h1>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          <li className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">✓ {t({ en: `${result.correct} correct`, hi: `${result.correct} सही` })}</li>
          <li className="rounded-full bg-rose-100 px-3 py-1 text-rose-900">✗ {t({ en: `${result.wrong} wrong`, hi: `${result.wrong} गलत` })}</li>
          <li className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">– {t({ en: `${result.skipped} skipped`, hi: `${result.skipped} छोड़े` })}</li>
        </ul>
        <p className="mt-3 text-sm text-slate-700">
          ⏱ {t({ en: `Time used ${formatClock(result.timeUsedSeconds)} of ${formatClock(result.limitSeconds)}`, hi: `${formatClock(result.limitSeconds)} में से ${formatClock(result.timeUsedSeconds)} समय लगा` })}
        </p>
        {result.autoSubmitted && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{t({ en: "Auto-submitted when time ran out.", hi: "समय समाप्त होने पर अपने आप जमा हुआ।" })}</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" disabled={busy} onClick={onRetake} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? t({ en: "Starting…", hi: "शुरू हो रहा है…" }) : t({ en: "Retake same scope", hi: "इसी दायरे में फिर से दें" })}</button>
          <button type="button" disabled={busy} onClick={onNewTest} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">{t({ en: "New test", hi: "नया टेस्ट" })}</button>
          <Link href={`/standards/${encodeURIComponent(standardId)}`} className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800">{t({ en: "Back to study", hi: "अध्ययन पर वापस" })}</Link>
        </div>
        {actionError}
      </section>

      {result.byClause.length > 0 && (
        <section aria-labelledby="quiz-by-clause" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 id="quiz-by-clause" className="text-base font-bold text-slate-900">{t({ en: "By clause", hi: "क्लॉज़ के अनुसार" })}</h2>
          <ul className="mt-3 space-y-3">
            {result.byClause.map((b) => {
              const p = b.total ? Math.round((100 * b.correct) / b.total) : 0;
              return (
                <li key={b.clauseNo}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="min-w-0 break-words font-medium text-slate-800">{b.clauseNo} {b.clauseTitle}</span>
                    <span className="tabular-nums text-slate-600">{t({ en: `${b.correct} of ${b.total} right`, hi: `${b.total} में से ${b.correct} सही` })}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={t({ en: `${p}% correct`, hi: `${p}% सही` })}>
                      <div className={`h-full rounded-full ${p >= 70 ? "bg-emerald-600" : p >= 40 ? "bg-amber-500" : "bg-rose-600"}`} style={{ width: `${Math.max(p, 2)}%` }} />
                    </div>
                    <Link href={studyHref(b.clauseNo)} className="flex min-h-11 shrink-0 items-center text-xs font-semibold text-blue-700 underline">{t({ en: "Study this clause", hi: "यह क्लॉज़ पढ़ें" })}</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="quiz-review" className="space-y-3">
        <div>
          <h2 id="quiz-review" className="text-base font-bold text-slate-900">{t({ en: "Review your answers", hi: "अपने उत्तर देखें" })}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{t({ en: "Each answer was checked against the standard's wording and solved independently by a second AI.", hi: "हर उत्तर को मानक के शब्दों से मिलाया गया और दूसरे AI ने अलग से हल करके जाँचा।" })}</p>
        </div>
        <div role="group" aria-label={t({ en: "Show questions", hi: "प्रश्न दिखाएँ" })} className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === f.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {t({ en: f.en, hi: f.hi })} <span className="tabular-nums">({f.count})</span>
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{t({ en: "No questions in this view.", hi: "इस दृश्य में कोई प्रश्न नहीं है।" })}</p>}
        <ol className="space-y-4">
          {shown.map(({ q, n }) => <ReviewCard key={q.id} q={q} n={n} studyHref={studyHref(q.clauseNo)} />)}
        </ol>
      </section>
    </main>
  );
}

function ReviewCard({ q, n, studyHref }: { q: ResultQuestion; n: number; studyHref: string }) {
  const { t } = useLang();
  const status = q.yourAnswer === null
    ? { text: t({ en: "– Skipped", hi: "– छोड़ा गया" }), cls: "bg-slate-100 text-slate-700" }
    : q.correct
      ? { text: t({ en: "✓ Correct", hi: "✓ सही" }), cls: "bg-emerald-100 text-emerald-900" }
      : { text: t({ en: "✗ Wrong", hi: "✗ गलत" }), cls: "bg-rose-100 text-rose-900" };
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-500">{t({ en: `Question ${n}`, hi: `प्रश्न ${n}` })}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${status.cls}`}>{status.text}</span>
        {q.marked && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800">⚑ {t({ en: "Marked", hi: "चिह्नित" })}</span>}
        <AiGeneratedBadge />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <Link href={studyHref} className="underline">{t({ en: `Clause ${q.clauseNo}`, hi: `क्लॉज़ ${q.clauseNo}` })}{q.clauseTitle ? ` ${q.clauseTitle}` : ""}</Link>
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-base font-semibold leading-7 text-slate-900">{q.stem}</p>
      <ul className="mt-3 space-y-2">
        {q.options.map((o) => {
          const isKey = o.id === q.answer;
          const isYours = o.id === q.yourAnswer;
          const note = !isKey ? q.optionNotes[o.id] : undefined;
          const tone = isKey ? "border-emerald-600 bg-emerald-50" : isYours ? "border-rose-500 bg-rose-50" : "border-slate-200 bg-white";
          return (
            <li key={o.id} className={`rounded-xl border-2 p-3 ${tone}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isKey ? "bg-emerald-600 text-white" : isYours ? "bg-rose-600 text-white" : "border border-slate-300 text-slate-600"}`}>{o.id}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm leading-6 text-slate-800"><span className="sr-only">{o.id}. </span>{o.text}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs font-semibold">
                    {isKey && <span className="text-emerald-800">✓ {t({ en: "Correct answer", hi: "सही उत्तर" })}</span>}
                    {isYours && <span className={isKey ? "text-emerald-800" : "text-rose-800"}>{isKey ? "" : "✗ "}{t({ en: "Your answer", hi: "आपका उत्तर" })}</span>}
                  </p>
                  {note && (
                    <p className="mt-1.5 text-xs leading-5 text-slate-700"><span className="font-semibold">{t({ en: "Why this is wrong:", hi: "यह गलत क्यों है:" })}</span> {note}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm leading-6 text-slate-800">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-800">{t({ en: `Why ${q.answer} is right`, hi: `${q.answer} सही क्यों है` })}</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{q.explanation}</p>
      </div>
      <figure className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <figcaption className="text-xs font-bold uppercase tracking-wide text-slate-600">{t({ en: `From the standard (${q.proofClauseNo})`, hi: `मानक से (${q.proofClauseNo})` })}</figcaption>
        <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-4 border-slate-300 pl-3 text-sm italic leading-6 text-slate-800">{q.proofQuote}</blockquote>
      </figure>
      {q.seconds > 0 && <p className="mt-2 text-xs text-slate-500">⏱ {t({ en: `${q.seconds} s on this question`, hi: `इस प्रश्न पर ${q.seconds} सेकंड` })}</p>}
    </li>
  );
}
