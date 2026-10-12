"use client";

import { useEffect, useState } from "react";
import type { HotConfidence, HotSubjectsResult } from "@/lib/syllabus/hot-subjects";
import { useLang } from "@/lib/i18n";
import { getHotSubjects, SyllabusApiError } from "./api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const one = (n: number) => n.toFixed(1);
const paperLabel = (date: string | null, shift: string | null) => {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` : "Date not recorded";
  return shift ? `${d}, ${shift.split("-")[0]}` : d;
};
const REVIEW_WORDS: Record<string, string> = { needs_review: "not yet checked by a person", draft: "drafts", verified: "checked by a person" };

const BADGE: Record<HotConfidence, { cls: string; en: string; hi: string }> = {
  high: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", en: "High", hi: "ऊँचा" },
  medium: { cls: "border-amber-200 bg-amber-50 text-amber-800", en: "Medium", hi: "मध्यम" },
  low: { cls: "border-rose-200 bg-rose-50 text-rose-700", en: "Low", hi: "कम" },
};

/** "Most asked subjects" card for the syllabus page. Renders nothing when the cycle has no counted questions. */
export function HotSubjects({ cycleYear, onOpen }: { cycleYear: number; onOpen: (id: string) => void }) {
  const { t } = useLang();
  const [state, setState] = useState<{ year: number; data: HotSubjectsResult | null; error: string } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    getHotSubjects(cycleYear)
      .then((data) => live && setState({ year: cycleYear, data, error: "" }))
      .catch((e) => {
        if (!live) return;
        // 404 = this cycle has no Civil subjects: nothing to rank, so show nothing.
        if (e instanceof SyllabusApiError && e.status === 404) setState({ year: cycleYear, data: null, error: "" });
        else setState({ year: cycleYear, data: null, error: e instanceof SyllabusApiError ? e.message : "Could not load the most asked subjects." });
      });
    return () => {
      live = false;
    };
  }, [cycleYear, retry]);

  const current = state?.year === cycleYear ? state : null;
  if (current?.error) {
    return (
      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {current.error}
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="ml-2 font-semibold underline">
          {t({ en: "Retry", hi: "पुनः प्रयास करें" })}
        </button>
      </div>
    );
  }
  const data = current?.data;
  if (!data || data.totals.counted === 0) return null;

  const papersPerYear = data.years.map((y) => `${y.label} (${y.papers})`).join(", ");
  return (
    <section aria-labelledby="hot-subjects-title" className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 id="hot-subjects-title" className="text-base font-black text-slate-950">
        {t({ en: "Most asked subjects", hi: "सबसे ज़्यादा पूछे गए विषय" })}
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Paper-I Civil questions per paper, counted from the {data.totals.papers} past papers in the app for {papersPerYear}. Tap a subject to open it.
      </p>

      <ol className="mt-3 flex flex-col divide-y divide-slate-100">
        {data.subjects.map((s) => {
          const b = BADGE[s.confidence];
          return (
            <li key={s.id} className="py-2.5">
              <div className="flex items-start gap-2">
                <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-bold text-slate-400">{s.rank}</span>
                <button type="button" onClick={() => onOpen(s.id)} className="min-w-0 flex-1 text-left text-sm font-semibold leading-5 text-slate-900 hover:text-blue-700 hover:underline">
                  {s.name}
                </button>
                <span className="shrink-0 text-right">
                  <span className="text-base font-black text-slate-950">{one(s.perPaper)}</span>
                  <span className="ml-1 text-[11px] text-slate-500">{t({ en: "per paper", hi: "प्रति पेपर" })}</span>
                </span>
              </div>
              <div className="ml-8 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-slate-500">
                <span className={`inline-flex items-center rounded-full border px-1.5 py-px font-bold ${b.cls}`} title={s.reason}>
                  {t({ en: `${b.en} confidence`, hi: `भरोसा: ${b.hi}` })} · gap {one(s.spread)}
                </span>
                {s.perYear.map((y) => (
                  <span key={y.year}>
                    {data.years.find((x) => x.year === y.year)?.label}: <b className="text-slate-700">{one(y.perPaper)}</b>
                  </span>
                ))}
                <span>
                  one paper: {s.minInOnePaper}–{s.maxInOnePaper}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <details className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">{t({ en: "How this is counted, and what it can't tell you", hi: "यह कैसे गिना गया, और इसकी सीमाएँ" })}</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>
            <b>Per paper</b> = the subject&apos;s questions in these papers ÷ {data.totals.papers} papers. Each question counts once, under its main subject. <b>One paper</b> = the fewest and most the subject got in any single paper.
          </li>
          <li>
            <b>Confidence</b> says how steady the count was from year to year, using this fixed rule: <b>High</b> if the year averages are at most {data.rule.highMaxSpread} questions apart, <b>Medium</b> if at most {data.rule.mediumMaxSpread} apart, <b>Low</b> if further apart or if any year has fewer than {data.rule.minPapersPerYear} papers. &quot;Gap&quot; is that distance. It describes past papers only; it is not a prediction.
          </li>
          <li>
            Counted: {data.totals.counted} of the {data.totals.civilQuestions} Civil questions in these papers.
            {data.totals.notCounted > 0 && ` ${data.totals.notCounted} have no subject and are left out.`}
          </li>
          <li>
            The papers were set under older syllabi. Each question was given a 2026 subject by AI:{" "}
            {data.tagReview.map((r) => `${r.count} ${REVIEW_WORDS[r.status] ?? r.status}`).join(", ")}.
          </li>
          <li>
            Only papers stored in the app are counted: {papersPerYear}. Papers from other shifts are not included. Private imports are never counted here.
          </li>
        </ul>
        <div className="mt-2 font-semibold text-slate-800">Papers counted</div>
        <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {data.papers.map((p) => (
            <li key={p.id}>{paperLabel(p.examDate, p.shift)}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
