"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ErrorLedgerEntry } from "@/lib/types";

interface RecurringWeaknessesSummaryProps {
  ledger: ErrorLedgerEntry[];
}

export function RecurringWeaknessesSummary({ ledger }: RecurringWeaknessesSummaryProps) {
  const { t } = useLang();

  // Active entries where occurrences > resolvedCount
  const activeEntries = ledger.filter((e) => e.occurrences > e.resolvedCount);
  const totalResolved = ledger.reduce((sum, e) => sum + e.resolvedCount, 0);

  if (ledger.length === 0) {
    return null;
  }

  // Breakdown by cause
  const conceptGaps = activeEntries.filter(
    (e) => e.cause === "concept_gap" || e.cause === "recurring_gap"
  ).length;

  const riskyGuesses = activeEntries.filter(
    (e) => e.cause === "risky_guess" || e.cause === "misreading"
  ).length;

  const speedProblems = activeEntries.filter(
    (e) => e.cause === "time_pressure" || e.cause === "calculation_error"
  ).length;

  // Potential marks estimate from unresolved occurrences (standard 2.5 marks lost per wrong MCQ in SSC CGL)
  const potentialRecoveryMarks = activeEntries.reduce(
    (sum, e) => sum + (e.occurrences - e.resolvedCount) * 2.5,
    0
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              {t({ en: "Recurring Weaknesses", hi: "आवर्ती कमजोरियाँ" })}
            </span>
          </div>

          <h3 className="text-base font-bold text-slate-900 sm:text-lg">
            {activeEntries.length > 0 ? (
              <>
                <span className="text-amber-600 font-extrabold">{activeEntries.length}</span>{" "}
                {t({
                  en: "patterns are repeatedly costing you marks",
                  hi: "पैटर्न बार-बार आपके अंक कम कर रहे हैं",
                })}
              </>
            ) : (
              t({
                en: "All identified weak spots have been resolved!",
                hi: "पहचाने गए सभी कमजोर बिंदु ठीक कर लिए गए हैं!",
              })
            )}
          </h3>

          {activeEntries.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-600 sm:text-sm">
              {conceptGaps > 0 && (
                <li className="flex items-center gap-2">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="font-semibold text-slate-800">{conceptGaps}</strong>{" "}
                    {t({ en: "concept clarity gaps", hi: "अवधारणा स्पष्टता अंतराल" })}
                  </span>
                </li>
              )}
              {riskyGuesses > 0 && (
                <li className="flex items-center gap-2">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="font-semibold text-slate-800">{riskyGuesses}</strong>{" "}
                    {t({ en: "risky-guess or reading slips", hi: "जोखिम भरे अनुमान या पढ़ने की चूक" })}
                  </span>
                </li>
              )}
              {speedProblems > 0 && (
                <li className="flex items-center gap-2">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="font-semibold text-slate-800">{speedProblems}</strong>{" "}
                    {t({ en: "speed & time-pressure errors", hi: "गति एवं समय दबाव की त्रुटियाँ" })}
                  </span>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              {t({
                en: "Great job completing your unseen retests.",
                hi: "अपने अनदेखे पुनर्परीक्षणों को पूरा करने का शानदार काम।",
              })}
            </p>
          )}

          {potentialRecoveryMarks > 0 && (
            <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md inline-block">
              {t({ en: "Potential recovery:", hi: "संभावित सुधार:" })}{" "}
              ~{potentialRecoveryMarks.toFixed(1).replace(/\.0$/, "")} {t({ en: "marks", hi: "अंक" })}
            </p>
          )}
        </div>

        <div className="shrink-0">
          <Link
            href="/dashboard/weaknesses"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-white transition shadow-2xs"
          >
            {t({ en: "Review all recurring weaknesses →", hi: "सभी आवर्ती कमजोरियों की समीक्षा करें →" })}
          </Link>
        </div>
      </div>

      {/* Subtle bottom footer summary */}
      <div className="mt-5 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          {t({ en: "Topics needing attention:", hi: "ध्यान देने योग्य विषय:" })}{" "}
          <strong className="text-slate-600">{activeEntries.length}</strong>
        </span>
        <span>•</span>
        <span>
          {t({ en: "Recurring weaknesses:", hi: "आवर्ती कमजोरियाँ:" })}{" "}
          <strong className="text-slate-600">{activeEntries.length}</strong>
        </span>
        <span>•</span>
        <span>
          {t({ en: "Recovered on retest:", hi: "पुनर्परीक्षण पर ठीक हुए:" })}{" "}
          <strong className="text-emerald-600 font-bold">{totalResolved}</strong>
        </span>
      </div>
    </div>
  );
}
