"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";

export interface FocusItem {
  id: string;
  conceptName: string;
  sectionName?: string;
  causeLabel: { en: string; hi: string };
  severity: "high" | "medium" | "low"; // 🔴 high, 🟠 medium, 🟡 low
  recoverableEstimate: number | null; // null if sample size is too early
  impactLabel?: { en: string; hi: string };
  repairUrl: string;
}

interface TodaysFocusProps {
  items: FocusItem[];
  attemptCount: number;
}

export function TodaysFocus({ items, attemptCount }: TodaysFocusProps) {
  const { t } = useLang();

  // If 0 items or 0 attempts, show clean state
  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
            {t({ en: "Today's Focus", hi: "आज का मुख्य ध्यान" })}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {attemptCount === 0
            ? t({
                en: "Complete a practice test to find areas to work on.",
                hi: "अपने शीर्ष 3 उच्च-प्रभाव वाले क्षेत्रों की पहचान के लिए पहला नैदानिक मॉक पूरा करें।",
              })
            : t({
                en: "No critical weaknesses flagged! All recent drills are currently resolved.",
                hi: "कोई गंभीर कमजोरी चिह्नित नहीं है! हाल के सभी अभ्यास वर्तमान में ठीक हो चुके हैं।",
              })}
        </p>
      </div>
    );
  }

  // Maximum 3 items allowed
  const displayItems = items.slice(0, 3);

  const severityStyles = {
    high: {
      dot: "🔴",
      badgeBg: "bg-red-50 text-red-800 border-red-200",
      border: "border-l-4 border-l-red-500",
    },
    medium: {
      dot: "🟠",
      badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
      border: "border-l-4 border-l-amber-500",
    },
    low: {
      dot: "🟡",
      badgeBg: "bg-yellow-50 text-yellow-800 border-yellow-200",
      border: "border-l-4 border-l-yellow-400",
    },
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-700">
              {t({ en: "Today's Focus", hi: "आज का मुख्य ध्यान" })}
            </span>
            {attemptCount === 1 && (
              <span className="text-[11px] text-slate-400">
                ({t({ en: "Early results", hi: "प्रारंभिक नैदानिक संकेत" })})
              </span>
            )}
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900 sm:text-lg">
            {t({
              en: "Top Weaknesses Costing You Marks",
              hi: "शीर्ष कमजोरियाँ जो आपके अंक कम कर रही हैं",
            })}
          </h3>
        </div>

        <Link
          href="/dashboard/topics"
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
        >
          {t({ en: "View all topics →", hi: "सभी विषय देखें →" })}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {displayItems.map((item) => {
          const style = severityStyles[item.severity] || severityStyles.medium;

          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 transition-all hover:bg-white hover:shadow-sm ${style.border}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm select-none">{style.dot}</span>
                  {item.recoverableEstimate !== null && item.recoverableEstimate > 0 ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      ~{item.recoverableEstimate.toFixed(1).replace(/\.0$/, "")} {t({ en: "marks recoverable", hi: "अंक पुनर्प्राप्य" })}
                    </span>
                  ) : item.impactLabel ? (
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                      {t(item.impactLabel)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                      {t({ en: "High impact", hi: "उच्च प्रभाव" })}
                    </span>
                  )}
                </div>

                <h4 className="mt-2 text-base font-bold text-slate-900">{item.conceptName}</h4>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  {t(item.causeLabel)}
                  {item.sectionName && (
                    <span className="text-slate-400"> · {item.sectionName}</span>
                  )}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                <Link
                  href={item.repairUrl}
                  className="w-full text-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-98"
                >
                  {t({ en: "Start Repair Drill →", hi: "सुधार अभ्यास प्रारंभ करें →" })}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
