"use client";

import { useMemo } from "react";
import type { BankReview } from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";

/**
 * The per-section table of an attempt review, computed client-side from a BankReview (no extra
 * fetch). The page's score card already shows the totals (score, marking, time, marks lost), so
 * they are not repeated here. Break-even accuracy is the attempt rate at which guessing stops being net-negative
 * under the paper's negative marking: negative / (correct + negative) — 20% for +1/−0.25,
 * 25% for +3/−1.
 */
export function ScoreBreakdown({ review }: { review: BankReview }) {
  const { t } = useLang();
  const { result, questions } = review;

  const breakEven = result.marking.negative / (result.marking.correct + result.marking.negative || 1);
  const breakEvenPct = Math.round(breakEven * 100);

  const sectionRows = useMemo(
    () =>
      result.sections.map((s) => {
        const attempted = s.correct + s.wrong;
        const accuracy = attempted > 0 ? s.correct / attempted : null;
        const marksLostToWrong = s.wrong * result.marking.negative;
        const marksLeftOnTable = s.unattempted * result.marking.correct;
        const costly = accuracy !== null && accuracy < breakEven && s.wrong > 0;
        return { ...s, accuracy, marksLostToWrong, marksLeftOnTable, costly };
      }),
    [result.sections, result.marking.negative, result.marking.correct, breakEven]
  );

  const totalLeftOnTable = sectionRows.reduce((sum, s) => sum + s.marksLeftOnTable, 0);

  const slowest = useMemo(
    () =>
      [...questions]
        .filter((q) => (q.response?.seconds ?? 0) > 0)
        .sort((a, b) => (b.response?.seconds ?? 0) - (a.response?.seconds ?? 0))
        .slice(0, 5),
    [questions]
  );

  return (
    <div>
      <p className="text-xs leading-5 text-slate-500">
        {t({
          en: `Guessing breaks even at ${breakEvenPct}% accuracy on this paper: below that, attempting a question you're unsure of costs marks on average. Unattempted questions left ${totalLeftOnTable.toFixed(2)} marks on the table.`,
          hi: `इस पेपर में अनुमान ${breakEvenPct}% सटीकता पर बराबर पड़ता है। बिना प्रयास छूटे प्रश्नों में ${totalLeftOnTable.toFixed(2)} अंक रह गए।`,
        })}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-400">
              <th className="py-1.5 pr-2 font-semibold">{t({ en: "Section", hi: "खंड" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Correct", hi: "सही" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Wrong", hi: "गलत" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Unattempted", hi: "अनुत्तरित" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Accuracy", hi: "सटीकता" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Lost to wrong", hi: "गलत में गए" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Left on table", hi: "छूटे हुए" })}</th>
              <th className="px-2 py-1.5 font-semibold">{t({ en: "Score", hi: "स्कोर" })}</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.map((s) => (
              <tr key={s.name} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 font-medium text-slate-700">
                  {s.name}
                  {s.costly && (
                    <span className="ml-1.5 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                      {t({ en: "Guessing cost marks here", hi: "यहाँ अनुमान से अंक कटे" })}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{s.correct}</td>
                <td className="px-2 py-1.5 text-slate-600">{s.wrong}</td>
                <td className="px-2 py-1.5 text-slate-600">{s.unattempted}</td>
                <td className="px-2 py-1.5 text-slate-600">{s.accuracy !== null ? `${Math.round(s.accuracy * 100)}%` : "—"}</td>
                <td className="px-2 py-1.5 text-rose-600">−{s.marksLostToWrong.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-amber-700">{s.marksLeftOnTable.toFixed(2)}</td>
                <td className="px-2 py-1.5 font-semibold text-slate-800">{s.score}/{s.maxScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {slowest.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t({ en: "Slowest questions", hi: "सबसे धीमे प्रश्न" })}</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {slowest.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
                <span className="truncate text-slate-600">
                  {q.section} · Q{q.position} · <OutcomeLabel outcome={q.outcome} />
                </span>
                <span className="shrink-0 font-mono font-semibold text-slate-700">{q.response?.seconds}s</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OutcomeLabel({ outcome }: { outcome: "correct" | "wrong" | "unattempted" | "unscored" }) {
  const { t } = useLang();
  const label: Record<typeof outcome, string> = {
    correct: t({ en: "correct", hi: "सही" }),
    wrong: t({ en: "wrong", hi: "गलत" }),
    unattempted: t({ en: "unattempted", hi: "अनुत्तरित" }),
    unscored: t({ en: "not scored", hi: "स्कोर नहीं" }),
  };
  return <span>{label[outcome]}</span>;
}
