"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { BankExplanation, BankOutcome, BankReview } from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";
import { BankApiRequestError, getReview } from "@/components/bank/api";
import { ScoreBreakdown } from "@/components/bank/ScoreBreakdown";
import { ReviewQuestion } from "@/components/bank/ReviewQuestion";

type QuestionFilter = "all" | "wrong" | "unattempted" | "unscored";

export default function BankReviewPage() {
  const { t } = useLang();
  const params = useParams<{ attemptId: string }>();

  const [review, setReview] = useState<BankReview | null>(null);
  const [error, setError] = useState("");
  // Opens on what needs work: wrong answers first, else unattempted, else everything.
  const [filter, setFilter] = useState<QuestionFilter | null>(null);

  const load = useCallback(() => {
    setError("");
    getReview(params.attemptId).then(setReview, (err) => {
      setError(err instanceof BankApiRequestError ? err.message : "Could not load this review.");
    });
  }, [params.attemptId]);

  useEffect(() => {
    (async () => {
      load();
    })();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, wrong: 0, unattempted: 0, unscored: 0 };
    for (const q of review?.questions ?? []) {
      c.all++;
      if (q.outcome === "wrong" || q.outcome === "unattempted" || q.outcome === "unscored") c[q.outcome]++;
    }
    return c;
  }, [review]);
  const activeFilter: QuestionFilter = filter ?? (counts.wrong ? "wrong" : counts.unattempted ? "unattempted" : "all");

  const filtered = useMemo(() => {
    if (!review) return [];
    const filter = activeFilter;
    if (filter === "all") return review.questions;
    const map: Record<Exclude<QuestionFilter, "all">, BankOutcome> = {
      wrong: "wrong",
      unattempted: "unattempted",
      unscored: "unscored",
    };
    return review.questions.filter((q) => q.outcome === map[filter as Exclude<QuestionFilter, "all">]);
  }, [review, activeFilter]);

  function handleExplained(questionId: string, explanation: BankExplanation) {
    setReview((prev) => {
      if (!prev) return prev;
      return { ...prev, questions: prev.questions.map((q) => (q.id === questionId ? { ...q, explanation } : q)) };
    });
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <Link href="/papers" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          {t({ en: "Back to tests", hi: "पेपर पर वापस जाएँ" })}
        </Link>
      </div>
    );
  }

  if (!review) {
    return <div className="mx-auto flex-1 px-4 py-16 text-center text-sm text-slate-400">{t({ en: "Loading review…", hi: "समीक्षा लोड हो रही है…" })}</div>;
  }

  const { result } = review;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <Link href="/papers" className="text-xs font-semibold text-blue-700">← {t({ en: "All tests", hi: "सभी पेपर" })}</Link>

      {/* Score card */}
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-black text-slate-950">{result.score} / {result.maxScore}</h1>
          <span className="text-xs font-semibold text-slate-500">{result.marking.scheme} (+{result.marking.correct} / −{result.marking.negative})</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          <CountStat label={t({ en: "Correct", hi: "सही" })} value={result.counts.correct} tone="emerald" />
          <CountStat label={t({ en: "Wrong", hi: "गलत" })} value={result.counts.wrong} tone="rose" />
          <CountStat label={t({ en: "Unattempted", hi: "अनुत्तरित" })} value={result.counts.unattempted} tone="amber" />
          <CountStat label={t({ en: "Not scored", hi: "स्कोर नहीं" })} value={result.counts.unscored} tone="slate" />
          <CountStat label={t({ en: "Marks lost for wrong answers", hi: "नकारात्मक अंक" })} value={`−${result.negativeMarksLost}`} tone="rose" />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {t({ en: "Total time", hi: "कुल समय" })}: {Math.floor(result.totalSeconds / 60)}m {result.totalSeconds % 60}s
        </p>
        {(result.priorExposure ?? 0) > 0 && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t({
              en: `Repeat attempt: you had already seen the answers to ${result.priorExposure} of the scored questions (a practice check, an earlier review or your own dispute resolution), so this is not a fresh score.`,
              hi: `दोहराया गया प्रयास: स्कोर किए गए प्रश्नों में से ${result.priorExposure} के उत्तर आप पहले देख चुके थे, इसलिए यह नया स्कोर नहीं है।`,
            })}
          </p>
        )}
      </div>

      {/* One section table, on request; the score card above holds the totals. */}
      <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t({ en: "Section breakdown", hi: "खंड अनुसार विवरण" })}</summary>
        <div className="mt-3">
          <ScoreBreakdown review={review} />
        </div>
      </details>

      {/* Question-wise review */}
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["wrong", "unattempted", "all", "unscored"] as const).filter((f) => f === "all" || counts[f] > 0).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={activeFilter === f}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${activeFilter === f ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}
            >
              {{
                all: t({ en: "All", hi: "सभी" }),
                wrong: t({ en: "Wrong", hi: "गलत" }),
                unattempted: t({ en: "Unattempted", hi: "अनुत्तरित" }),
                unscored: t({ en: "Not scored", hi: "स्कोर नहीं" }),
              }[f]} ({counts[f]})
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {filtered.map((q) => (
            <ReviewQuestion key={q.id} attemptId={review.attempt.id} question={q} onExplained={handleExplained} onResolved={load} />
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{t({ en: "No questions match this filter.", hi: "इस फ़िल्टर से कोई प्रश्न मेल नहीं खाता।" })}</p>}
        </div>
      </div>
    </div>
  );
}

function CountStat({ label, value, tone }: { label: string; value: number | string; tone: "emerald" | "rose" | "amber" | "slate" }) {
  const toneCls: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-800",
    slate: "bg-slate-50 text-slate-600",
  };
  return (
    <div className={`rounded-lg p-2 text-center ${toneCls[tone]}`}>
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}
