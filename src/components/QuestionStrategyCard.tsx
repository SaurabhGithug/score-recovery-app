"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { QuestionScenario } from "@/lib/target/strategy-engine";

interface QuestionStrategyCardProps {
  targetScore: number;
  scenarios: QuestionScenario[];
  totalMarks?: number;
  markingCorrect?: number;
  markingNegative?: number;
  className?: string;
  onOpenTargetRationale?: () => void;
}

export function QuestionStrategyCard({
  targetScore,
  scenarios,
  totalMarks = 200,
  className = "",
  onOpenTargetRationale,
}: QuestionStrategyCardProps) {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState<number>(1); // default to Balanced (index 1)

  if (!scenarios || scenarios.length === 0) {
    return null;
  }

  const current = scenarios[activeTab] || scenarios[0];

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
              {t({ en: "Strategy Engine", hi: "रणनीति इंजन" })}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {t({ en: `3 Paths to achieve ${targetScore} Marks`, hi: `${targetScore} अंक प्राप्त करने के 3 मार्ग` })}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-900">
            {t({ en: "Attempts vs. Accuracy Tradeoff Scenarios", hi: "प्रयास बनाम सटीकता परिदृश्य" })}
          </h2>
        </div>

        {onOpenTargetRationale && (
          <button
            type="button"
            onClick={onOpenTargetRationale}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition self-start sm:self-auto"
          >
            {t({ en: `Why ${targetScore}? →`, hi: `${targetScore} क्यों? →` })}
          </button>
        )}
      </div>

      {/* Scenario Selector Tabs */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {scenarios.map((sc, idx) => {
          const isActive = activeTab === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`flex flex-col text-left rounded-xl border p-3 transition ${
                isActive
                  ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 shadow-xs"
                  : "border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 text-slate-600"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`text-xs font-extrabold ${isActive ? "text-blue-900" : "text-slate-800"}`}>
                  {sc.name}
                </span>
                {idx === 1 && (
                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 uppercase">
                    {t({ en: "Recommended", hi: "अनुशंसित" })}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] text-slate-500">
                {sc.totalAttempts} {t({ en: "attempts", hi: "प्रयास" })} · {sc.accuracyPercent.toFixed(1)}% {t({ en: "accuracy", hi: "सटीकता" })}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Scenario Detail Card */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 sm:p-5">
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          {current.description}
        </p>

        {/* Breakdown Metric Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-white p-3 border border-slate-100 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              {t({ en: "Total Attempts", hi: "कुल प्रयास" })}
            </span>
            <span className="mt-0.5 text-xl font-extrabold text-slate-900">
              {current.totalAttempts}{" "}
              <span className="text-xs font-normal text-slate-400">/ {totalMarks}</span>
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-emerald-100 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
              {t({ en: "Correct Answers", hi: "सही उत्तर" })}
            </span>
            <span className="mt-0.5 text-xl font-extrabold text-emerald-700">
              +{current.correct}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-red-100 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 block">
              {t({ en: "Negative Marks", hi: "नकारात्मक अंक" })}
            </span>
            <span className="mt-0.5 text-xl font-extrabold text-red-700">
              -{(current.wrong * 0.25).toFixed(2)}{" "}
              <span className="text-xs font-normal text-red-500">({current.wrong} wrong)</span>
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-blue-100 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
              {t({ en: "Final Score", hi: "अंतिम स्कोर" })}
            </span>
            <span className="mt-0.5 text-xl font-extrabold text-blue-900">
              {current.calculatedScore.toFixed(2)}{" "}
              <span className="text-xs font-normal text-blue-600">marks</span>
            </span>
          </div>
        </div>

        {/* Tactical Guidance note */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
          <span className="text-sm">💡</span>
          <div>
            <strong className="font-bold">
              {t({ en: "The 1.25 Mark Recovery Law: ", hi: "1.25 अंक का रिकवरी नियम: " })}
            </strong>
            {t({
              en: "In SSC JE, each incorrect attempt costs you 1 mark you failed to earn plus 0.25 mark penalty subtracted from your correct pool. Eliminating 8 blind guesses immediately recovers +10.0 net marks without learning a single new formula.",
              hi: "एसएससी जेई में, प्रत्येक गलत प्रयास से 1 अर्जित न किया गया अंक और 0.25 की नकारात्मक कटौती होती है। 8 तुक्के बंद करने से बिना नया सूत्र सीखे सीधे +10 अंक सुधरते हैं।",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
