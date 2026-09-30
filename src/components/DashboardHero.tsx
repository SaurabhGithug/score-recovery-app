"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { Attempt, RecoveryReport } from "@/lib/types";
import { EvidenceState } from "@/lib/target/evidence-levels";

export interface RecoveryOpportunity {
  title: string;
  recoverableMarks: number;
  cause: string;
}

interface DashboardHeroProps {
  attempts: Attempt[];
  latestReport: RecoveryReport | null;
  targetScore?: number;
  currentScore?: number | null;
  scoreGap?: number | null;
  evidence?: EvidenceState;
  scoreTrend?: number[];
  topOpportunities?: RecoveryOpportunity[];
  topWeaknessNames?: string[];
  candidateName?: string;
  onOpenWhyTarget?: () => void;
  onOpenExamProfile?: () => void;
  onOpenStrategy?: () => void;
}

export function DashboardHero({
  attempts,
  latestReport,
  targetScore = 135,
  currentScore: providedCurrentScore,
  scoreGap: providedScoreGap,
  evidence,
  scoreTrend = [],
  topOpportunities = [],
  topWeaknessNames = [],
  onOpenWhyTarget,
  onOpenExamProfile,
  onOpenStrategy,
}: DashboardHeroProps) {
  const { t } = useLang();

  // 1. Zero attempts state
  if (attempts.length === 0 && !latestReport) {
    return (
      <div className="rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-7 text-white shadow-xl sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t({ en: "Target Set: 135 Marks (SSC JE Civil)", hi: "लक्ष्य निर्धारित: 135 अंक (एसएससी जेई सिविल)" })}</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenWhyTarget && (
              <button
                type="button"
                onClick={onOpenWhyTarget}
                className="rounded-lg bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25 transition backdrop-blur-xs"
              >
                {t({ en: "Why 135? ↗", hi: "135 क्यों? ↗" })}
              </button>
            )}
            {onOpenExamProfile && (
              <button
                type="button"
                onClick={onOpenExamProfile}
                className="rounded-lg bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25 transition backdrop-blur-xs"
              >
                {t({ en: "Personalize Target ⚙", hi: "लक्ष्य निजीकृत करें ⚙" })}
              </button>
            )}
          </div>
        </div>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t({
            en: "Establish your benchmark score",
            hi: "अपना प्रारंभिक मानक स्कोर स्थापित करें",
          })}
        </h2>

        <p className="mt-2 max-w-2xl text-sm text-blue-100 leading-relaxed sm:text-base">
          {t({
            en: "We don't guess your score. Take a 20-minute diagnostic mock to calculate your real score gap against the 135-mark target and unlock your recovery plan.",
            hi: "हम आपके स्कोर का अनुमान नहीं लगाते। 135 अंक के लक्ष्य के मुकाबले अपने वास्तविक स्कोर अंतर की गणना करने के लिए 20 मिनट का नैदानिक मॉक लें।",
          })}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/exam"
            className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-blue-900 shadow-md transition hover:bg-blue-50 active:scale-98"
          >
            {t({ en: "Take 20-Min Diagnostic Mock →", hi: "20-मिनट का नैदानिक मॉक दें →" })}
          </Link>
          <span className="text-xs text-blue-200 sm:ml-2">
            {t({ en: "24 questions · Zero guesswork · Instant gap breakdown", hi: "24 प्रश्न · शून्य अटकलें · त्वरित अंतर विश्लेषण" })}
          </span>
        </div>
      </div>
    );
  }

  // 2. Compute current score, gap & trend if not explicitly passed
  const current =
    providedCurrentScore !== undefined && providedCurrentScore !== null
      ? providedCurrentScore
      : latestReport
      ? latestReport.score.totalMarks
      : 111;

  const gap =
    providedScoreGap !== undefined && providedScoreGap !== null
      ? providedScoreGap
      : Math.max(0, targetScore - current);

  // Default top recovery opportunities if not provided
  const recoveryOpps: RecoveryOpportunity[] =
    topOpportunities.length > 0
      ? topOpportunities
      : [
          {
            title: topWeaknessNames[0] || "RCC Design & Mix Ratios",
            recoverableMarks: 4.5,
            cause: "Formula precision & code IS 456 clauses",
          },
          {
            title: topWeaknessNames[1] || "Percentage & Profit Loss",
            recoverableMarks: 3.5,
            cause: "Speed arithmetic calculation slip",
          },
          {
            title: "Eliminating Blind Guessing",
            recoverableMarks: 6.25,
            cause: "Negative marking deduction (-0.25)",
          },
        ];

  // Past scores sequence
  const displayTrend =
    scoreTrend.length > 0
      ? scoreTrend
      : attempts
          .slice(0, 5)
          .reverse()
          .map((a) => {
            const correctCount = a.responses.filter((r) => r.isCorrect).length;
            const wrongCount = a.responses.filter(
              (r) => !r.isCorrect && r.selectedOptionId !== null && r.selectedOptionId !== undefined
            ).length;
            return Math.max(0, Math.round(correctCount * 1.0 - wrongCount * 0.25));
          });

  // Target repair link
  const recoveryLink = latestReport ? `/repair/${latestReport.attemptId}` : "/exam";

  // Evidence badge presentation
  const evidenceLabel = evidence
    ? t(evidence.label)
    : attempts.length >= 6
    ? t({ en: "Reliable pattern · 6+ tests", hi: "विश्वसनीय पैटर्न · 6+ टेस्ट" })
    : attempts.length >= 3
    ? t({ en: `Emerging pattern · ${attempts.length} tests`, hi: `उभरता पैटर्न · ${attempts.length} टेस्ट` })
    : attempts.length >= 1
    ? t({ en: `Early signal · ${attempts.length} test`, hi: `प्रारंभिक संकेत · ${attempts.length} टेस्ट` })
    : t({ en: "No test data", hi: "कोई टेस्ट डेटा नहीं" });

  return (
    <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-blue-50/40 p-6 shadow-xs sm:p-8">
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-800">
            {t({ en: "Score Gap Architecture", hi: "स्कोर गैप विश्लेषण" })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            {evidenceLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onOpenWhyTarget && (
            <button
              type="button"
              onClick={onOpenWhyTarget}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 transition underline underline-offset-4"
            >
              {t({ en: `[ Why ${targetScore}? ]`, hi: `[ ${targetScore} क्यों? ]` })}
            </button>
          )}
          {onOpenExamProfile && (
            <button
              type="button"
              onClick={onOpenExamProfile}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
            >
              ⚙ {t({ en: "Personalize", hi: "निजीकृत करें" })}
            </button>
          )}
        </div>
      </div>

      {/* Primary 3-Metric Pillar Strip */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* TARGET */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t({ en: "Target Score", hi: "लक्षित स्कोर" })}
            </span>
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              SSC JE Paper-I
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-slate-900 sm:text-5xl">{targetScore}</span>
            <span className="text-sm font-semibold text-slate-400">/ 200</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {t({
              en: "Cutoff 127.23 + 8-mark safety cushion",
              hi: "कटऑफ 127.23 + 8 अंक का सुरक्षा बफर",
            })}
          </p>
        </div>

        {/* CURRENT */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t({ en: "Current Score", hi: "वर्तमान स्कोर" })}
            </span>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
              Recent Average
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-slate-800 sm:text-5xl">
              {typeof current === "number" ? current.toFixed(1).replace(/\.0$/, "") : current}
            </span>
            <span className="text-sm font-semibold text-slate-400">/ 200</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
            {displayTrend.length > 1 && (
              <span className="font-semibold text-slate-700">
                {displayTrend.join(" → ")}
              </span>
            )}
          </div>
        </div>

        {/* SCORE GAP */}
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50/50 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
              {t({ en: "Score Gap", hi: "स्कोर अंतर" })}
            </span>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md">
              Recoverable
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-rose-600 sm:text-5xl">
              {gap > 0 ? `${gap.toFixed(1).replace(/\.0$/, "")}` : "0"}
            </span>
            <span className="text-sm font-bold text-rose-500">marks to win</span>
          </div>
          <p className="mt-1.5 text-xs text-rose-800 font-medium">
            {t({
              en: "Deficit to achieve comfortable clearance",
              hi: "सुरक्षित चयन हेतु आवश्यक अतिरिक्त अंक",
            })}
          </p>
        </div>
      </div>

      {/* Action Strip: Top 3 Recovery Opportunities + Big CTA */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between pt-4 border-t border-slate-100">
        {/* Top 3 Opportunities List */}
        <div className="space-y-2 flex-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
            {t({ en: "Top 3 Fastest Mark Recovery Opportunities:", hi: "शीर्ष 3 त्वरित अंक रिकवरी अवसर:" })}
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {recoveryOpps.slice(0, 3).map((opp, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-blue-300 transition"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-black text-slate-800 truncate pr-1">{opp.title}</span>
                  <span className="shrink-0 text-xs font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    +{opp.recoverableMarks.toFixed(1).replace(/\.0$/, "")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 truncate">{opp.cause}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Big Recovery CTA */}
        <div className="shrink-0 lg:pl-4">
          <div className="flex flex-col gap-1.5">
            <Link
              href={recoveryLink}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 py-4 text-center text-sm font-extrabold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-98"
            >
              <span>{t({ en: "Start Today's Recovery", hi: "आज की रिकवरी प्रारंभ करें" })}</span>
              <span className="text-lg">→</span>
            </Link>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] text-slate-400">
                {t({ en: "~12 mins · Targeted retest & repair", hi: "~12 मिनट · लक्षित री-टेस्ट एवं सुधार" })}
              </span>
              {onOpenStrategy && (
                <>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={onOpenStrategy}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    {t({ en: "Strategy Scenarios", hi: "रणनीति परिदृश्य" })}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
