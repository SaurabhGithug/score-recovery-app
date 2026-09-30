"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { LearningActionRecommendation } from "@/lib/domain/schema";

interface AdaptivePolicyCardProps {
  recommendations: LearningActionRecommendation[];
}

export function AdaptivePolicyCard({ recommendations }: AdaptivePolicyCardProps) {
  const { t } = useLang();

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  const actionTypeBadge: Record<
    LearningActionRecommendation["actionType"],
    { label: { en: string; hi: string }; color: string }
  > = {
    retest_unseen: {
      label: { en: "Try new questions", hi: "अनदेखा पुनर्परीक्षण अभ्यास" },
      color: "bg-blue-100 text-blue-800 border-blue-200",
    },
    misconception_remedy: {
      label: { en: "Work on mistakes", hi: "भ्रम एवं त्रुटि निवारण" },
      color: "bg-rose-100 text-rose-800 border-rose-200",
    },
    speed_drill: {
      label: { en: "Practise speed", hi: "गति एवं समय सुधार" },
      color: "bg-amber-100 text-amber-800 border-amber-200",
    },
    retention_review: {
      label: { en: "Review again later", hi: "आवधिक स्मरण समीक्षा" },
      color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              {t({ en: "Suggested practice", hi: "अधिगम नीति मस्तिष्क · पारदर्शी अनुशंसा" })}
            </span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            {t({ en: "What to practise next", hi: "प्राथमिकता प्राप्त आगामी सर्वोत्तम अभ्यास" })}
          </h3>
          <p className="text-xs text-slate-500">
            {t({
              en: "Suggestions use the app’s rules, topic importance and your recorded mistakes.",
              hi: "प्रत्येक अनुशंसा परीक्षा महत्व, स्मरण जोखिम और आपकी विशिष्ट त्रुटि पर पारदर्शी नियमों द्वारा निर्धारित की जाती है।",
            })}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3.5">
        {recommendations.map((rec, index) => {
          const badge = actionTypeBadge[rec.actionType];

          return (
            <div
              key={rec.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-gradient-to-r from-white via-slate-50/40 to-white p-4 transition-all hover:border-blue-300 hover:shadow-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.color}`}>
                    {t(badge.label)}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {t(rec.subjectName)}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-slate-900 sm:text-base">{t(rec.conceptName)}</h4>

                {/* Explainable Policy Breakdown */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-700 font-semibold">{t({ en: "Topic weight in the app:", hi: "ब्लूप्रिंट महत्व:" })}</strong>{" "}
                    {rec.rationale.officialBlueprintWeight}x
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-700 font-semibold">{t({ en: "Estimated marks gain:", hi: "संभावित अंक लाभ:" })}</strong>{" "}
                    <span className="text-emerald-600 font-bold">+{rec.expectedMarksGain}</span>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1">
                    <strong className="text-slate-700 font-semibold">{t({ en: "Time:", hi: "समय:" })}</strong> ~
                    {rec.estimatedMinutes} min
                  </span>
                </div>

                <p className="text-xs text-slate-500 italic">{t(rec.rationale.summary)}</p>
              </div>

              <div className="shrink-0">
                <Link
                  href="/exam"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 sm:w-auto"
                >
                  {t({ en: "Start Practice →", hi: "अभ्यास प्रारंभ करें →" })}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
