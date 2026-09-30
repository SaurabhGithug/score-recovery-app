"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { getReport } from "@/lib/storage";
import { ERROR_CAUSE_LABEL, RecoveryReport, SECTION_LABEL, Section } from "@/lib/types";

export default function ResultsPage() {
  const { t } = useLang();
  const params = useParams<{ attemptId: string }>();
  const [report, setReport] = useState<RecoveryReport | null | undefined>(undefined);

  useEffect(() => {
    setReport(getReport(params.attemptId));
  }, [params.attemptId]);

  if (report === undefined) {
    return <div className="flex-1 px-4 py-14 text-center text-sm text-slate-400">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</div>;
  }

  if (report === null) {
    return (
      <div className="mx-auto max-w-md flex-1 px-4 py-14 text-center">
        <p className="text-sm text-slate-600">{t({ en: "We couldn't find that attempt on this device.", hi: "इस डिवाइस पर वह प्रयास नहीं मिला।" })}</p>
        <Link href="/exam" className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
          {t({ en: "Start a new practice test", hi: "नया अभ्यास टेस्ट शुरू करें" })}
        </Link>
      </div>
    );
  }

  const { score, marksLostTotal, marksRecoverableEstimate, recoverableByCause, nextActions } = report;
  const pct = score.maxMarks > 0 ? Math.round((score.totalMarks / score.maxMarks) * 100) : 0;
  const recoverablePct = marksLostTotal > 0 ? Math.round((marksRecoverableEstimate / marksLostTotal) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      {/* Headline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t({ en: "Your result", hi: "आपका परिणाम" })}
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="text-4xl font-bold text-slate-900">
            {score.totalMarks}
            <span className="text-lg font-medium text-slate-400"> / {score.maxMarks}</span>
          </p>
          <p className="pb-1 text-sm text-slate-500">
            {pct}% · {score.correctCount} {t({ en: "correct", hi: "सही" })} · {score.wrongCount}{" "}
            {t({ en: "wrong", hi: "गलत" })} · {score.unattemptedCount} {t({ en: "unattempted", hi: "अनुत्तरित" })}
          </p>
        </div>

        {marksLostTotal > 0 ? (
          <div className="mt-5 rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-slate-700">
              {t({ en: "You lost", hi: "आपने गंवाए" })}{" "}
              <span className="font-bold text-slate-900">{marksLostTotal} {t({ en: "marks", hi: "अंक" })}</span>
              {t({ en: " today. ", hi: " आज। " })}
              <span className="font-bold text-blue-700">
                {t({ en: "Approximately", hi: "लगभग" })} {marksRecoverableEstimate} {t({ en: "are recoverable", hi: "पुनर्प्राप्य हैं" })}
              </span>{" "}
              {t({ en: "within two weeks", hi: "दो सप्ताह के भीतर" })} ({recoverablePct}%).
            </p>
            <p className="mt-2 text-xs text-blue-700/70">
              {t({
                en: "Computed by a transparent rule set over your answer timing, revisits and answer changes — not a black-box estimate.",
                hi: "आपके उत्तर के समय, दोबारा देखने और उत्तर परिवर्तन पर एक पारदर्शी नियम-सेट से गणना — कोई अस्पष्ट अनुमान नहीं।",
              })}
            </p>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            {t({ en: "No marks lost this attempt — strong work.", hi: "इस प्रयास में कोई अंक नहीं गंवाए — बेहतरीन प्रदर्शन।" })}
          </p>
        )}
      </div>

      {/* Section breakdown */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(score.bySection) as Section[]).map((s) => {
          const sec = score.bySection[s];
          return (
            <div key={s} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{t(SECTION_LABEL[s])}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {sec.marks}
                <span className="text-sm font-normal text-slate-400"> / {sec.max}</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {sec.correct}✓ {sec.wrong}✗ {sec.unattempted}−
              </p>
            </div>
          );
        })}
      </div>

      {/* Cause breakdown */}
      {Object.keys(recoverableByCause).length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">
            {t({ en: "Why you lost recoverable marks", hi: "आपने पुनर्प्राप्य अंक क्यों गंवाए" })}
          </p>
          <div className="flex flex-col gap-2">
            {Object.entries(recoverableByCause)
              .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
              .map(([cause, marks]) => (
                <div key={cause} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-slate-600 sm:w-52">
                    {t(ERROR_CAUSE_LABEL[cause as keyof typeof ERROR_CAUSE_LABEL])}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, ((marks ?? 0) / Math.max(1, marksRecoverableEstimate)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-semibold text-slate-700">{marks}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-slate-800">
          {t({ en: "Your next 3 actions", hi: "आपके अगले 3 कदम" })}
        </p>
        {nextActions.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            {t({ en: "Nothing urgent to repair right now — check back after your next attempt.", hi: "अभी सुधारने के लिए कुछ जरूरी नहीं — अगले प्रयास के बाद फिर देखें।" })}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {nextActions.map((a, i) => (
              <div key={a.id} className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{t(a.title)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t(a.description)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {t(SECTION_LABEL[a.section])} · ~{a.estimatedMinutes} {t({ en: "min", hi: "मिनट" })}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href={`/repair/${report.attemptId}`}
              className="mt-2 w-full rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto sm:self-start sm:px-8"
            >
              {t({ en: "Start repair drill →", hi: "सुधार अभ्यास शुरू करें →" })}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
