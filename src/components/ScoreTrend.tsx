"use client";

import { useLang } from "@/lib/i18n";
import { Attempt, RecoveryReport } from "@/lib/types";

interface ScoreTrendProps {
  attempts: Attempt[];
  reports: RecoveryReport[];
}

export function ScoreTrend({ attempts, reports }: ScoreTrendProps) {
  const { t } = useLang();

  // If fewer than 2 attempts, meaningful trend does not exist yet
  if (attempts.length < 2) {
    if (attempts.length === 1) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              {t({ en: "Score Trend", hi: "स्कोर रुझान" })}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {t({
              en: "1 attempt recorded so far. Complete your next test session to begin tracking your score trajectory and recovery rate.",
              hi: "अब तक 1 प्रयास दर्ज किया गया है। अपने स्कोर प्रक्षेपवक्र और रिकवरी दर को ट्रैक करना शुरू करने के लिए अपना अगला परीक्षण सत्र पूरा करें।",
            })}
          </p>
        </div>
      );
    }
    return null;
  }

  // Create chronological score points (oldest to newest, max 5)
  const reportMap = new Map(reports.map((r) => [r.attemptId, r]));

  // Sort chronological
  const chronAttempts = [...attempts]
    .filter((a) => a.submittedAt)
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))
    .slice(-5);

  const scores: number[] = [];
  chronAttempts.forEach((a) => {
    const report = reportMap.get(a.id);
    if (report && report.score) {
      scores.push(Math.round(report.score.totalMarks));
    }
  });

  if (scores.length < 2) {
    return null;
  }

  const firstScore = scores[0];
  const lastScore = scores[scores.length - 1];
  const delta = lastScore - firstScore;
  const isImproving = delta >= 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              {t({ en: "Score Trend", hi: "स्कोर रुझान" })}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            {t({ en: "Recent Attempt Progression", hi: "हालिया प्रयास प्रगति" })}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
              isImproving ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {isImproving ? "↑" : "↓"} {delta >= 0 ? `+${delta}` : delta} {t({ en: "marks over recent attempts", hi: "अंक हाल के प्रयासों में" })}
          </span>
        </div>
      </div>

      {/* Visual Sequence */}
      <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
        {scores.map((score, idx) => {
          const isLatest = idx === scores.length - 1;

          return (
            <div key={idx} className="flex items-center gap-2 sm:gap-3">
              <div
                className={`flex flex-col items-center justify-center rounded-xl border px-3.5 py-2 text-center transition ${
                  isLatest
                    ? "border-blue-600 bg-blue-50/70 font-extrabold text-blue-900 shadow-xs ring-1 ring-blue-500"
                    : "border-slate-200 bg-slate-50 font-bold text-slate-700"
                }`}
              >
                <span className="text-lg sm:text-xl">{score}</span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {isLatest ? t({ en: "Latest", hi: "नवीनतम" }) : `T-${scores.length - idx}`}
                </span>
              </div>

              {idx < scores.length - 1 && (
                <span className="text-slate-300 font-light text-lg">→</span>
              )}
            </div>
          );
        })}

        {isImproving && (
          <span className="ml-2 text-xs font-bold text-emerald-700 flex items-center gap-1">
            <span>↑</span>
            <span>{t({ en: "improving", hi: "सुधार जारी" })}</span>
          </span>
        )}
      </div>
    </div>
  );
}
