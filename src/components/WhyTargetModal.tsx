"use client";

import { useLang } from "@/lib/i18n";
import { TargetCalculationResult } from "@/lib/target/target-calculator";

interface WhyTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetData: TargetCalculationResult | null;
  examName?: string;
  branchName?: string;
  categoryName?: string;
  onOpenStrategy?: () => void;
  onOpenProfile?: () => void;
}

export function WhyTargetModal({
  isOpen,
  onClose,
  targetData,
  examName = "SSC Junior Engineer (Paper-I)",
  branchName = "Civil Engineering",
  categoryName = "UR (Unreserved)",
  onOpenStrategy,
  onOpenProfile,
}: WhyTargetModalProps) {
  const { t } = useLang();

  if (!isOpen) return null;

  const target = targetData || {
    planningTargetScore: 135,
    officialMinimumScore: 60,
    totalMarks: 200,
    safetyMargin: 7.77,
    hasComparableHistory: true,
    historicalYears: [
      { year: 2024, cutoff: 122.93, source: "SSC Result Notice 2024 (Civil)" },
      { year: 2025, cutoff: 127.23, source: "SSC Result Notice 2025 (Civil)" },
    ],
    explanation: {
      summary:
        "Based on recent SSC JE Paper-I cutoffs for Civil (UR) peaking at 127.23, your personal target is set at 135 to build a robust safety buffer.",
      details: [
        "Official minimum qualifying mark under SSC Notice Para 18.2 is 30% (60/200). Note: this is mere qualification, NOT sufficient to clear the cutoff.",
        "Recent cutoffs for your category have ranged from 122.93 (2024) to 127.23 (2025).",
        "A safety margin of ~8 marks is added to protect against exam normalization shifts, candidate volume surge, and harder difficulty variance.",
      ],
      disclaimer:
        "This is an evidence-backed preparation target to guide your mock test drills. Official cutoffs fluctuate based on total vacancies, candidate turnout, and normalization.",
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-800">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              {t({ en: "How your target was chosen", hi: "लक्ष्य का आधार एवं तर्क" })}
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              {t({
                en: `Why is your target ${target.planningTargetScore} marks?`,
                hi: `आपका लक्ष्य ${target.planningTargetScore} अंक क्यों निर्धारित है?`,
              })}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {examName} · {branchName} · Category: <span className="font-semibold text-slate-800">{categoryName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto py-4 space-y-6 flex-1 pr-1 text-slate-700 text-sm">
          {/* 3 Distinct Thresholds Explained */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
            <strong className="font-bold block mb-1">
              {t({
                en: "Important Distinction: Never confuse Qualifying Marks, Cutoff, and Preparation Target",
                hi: "महत्वपूर्ण अंतर: अहर्ता अंक, कटऑफ और तैयारी लक्ष्य को एक न समझें",
              })}
            </strong>
            {t({
              en: "Many students mistakenly assume the official 30% rule (60 marks) will clear the exam. Qualifying marks simply allow your paper to be evaluated. To be shortlisted, you must score well above the historical competitive cutoff.",
              hi: "कई छात्र गलती से मान लेते हैं कि 30% (60 अंक) नियम से परीक्षा पास हो जाएगी। अहर्ता अंक केवल आपकी कॉपी जांचने की न्यूनतम शर्त है। शॉर्टलिस्ट होने के लिए कटऑफ से अधिक अंक आवश्यक हैं।",
            })}
          </div>

          {/* Breakdown Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* 1. Official Qualifying Mark */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t({ en: "1. Official Minimum", hi: "1. आधिकारिक न्यूनतम अहर्ता" })}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{target.officialMinimumScore}</span>
                <span className="text-xs font-semibold text-slate-400">/ {target.totalMarks}</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                {t({
                  en: "SSC Notice Para 18.2 statutory floor. Evaluation eligibility only.",
                  hi: "एसएससी नोटिस पैरा 18.2 वैधानिक न्यूनतम। केवल कॉपी मूल्यांकन पात्रता।",
                })}
              </p>
            </div>

            {/* 2. Historical Cutoffs */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                {t({ en: "2. Recent Cutoffs", hi: "2. हालिया कटऑफ" })}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-blue-900">
                  {target.historicalYears.length > 0
                    ? target.historicalYears[target.historicalYears.length - 1].cutoff.toFixed(1)
                    : "127.2"}
                </span>
                <span className="text-xs font-semibold text-blue-600">/ {target.totalMarks}</span>
              </div>
              <p className="mt-2 text-[11px] text-blue-700 leading-snug">
                {t({
                  en: "Latest competitive score required to clear Paper-I in your stream.",
                  hi: "आपकी शाखा में पेपर-I उत्तीर्ण करने हेतु आवश्यक नवीनतम स्कोर।",
                })}
              </p>
            </div>

            {/* 3. Personal Target */}
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                {t({ en: "3. Your Target", hi: "3. आपका व्यक्तिगत लक्ष्य" })}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-900">{target.planningTargetScore}</span>
                <span className="text-xs font-semibold text-emerald-700">/ {target.totalMarks}</span>
              </div>
              <p className="mt-2 text-[11px] text-emerald-700 leading-snug">
                {t({
                  en: `Includes +${target.safetyMargin.toFixed(0)} mark safety buffer for peace of mind.`,
                  hi: `शामिल है +${target.safetyMargin.toFixed(0)} अंक का सुरक्षा बफर।`,
                })}
              </p>
            </div>
          </div>

          {/* Historical Data Table */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              {t({ en: "Official Historical Benchmarks", hi: "आधिकारिक ऐतिहासिक मानक" })}
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="px-3 py-2">{t({ en: "Year", hi: "वर्ष" })}</th>
                    <th className="px-3 py-2">{t({ en: "Category Cutoff", hi: "श्रेणी कटऑफ" })}</th>
                    <th className="px-3 py-2">{t({ en: "Official Reference Document", hi: "आधिकारिक संदर्भ" })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {target.historicalYears.map((h) => (
                    <tr key={h.year} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-bold text-slate-800">{h.year}</td>
                      <td className="px-3 py-2.5 font-black text-blue-700">{h.cutoff.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{h.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Why +8 Safety Buffer? */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {t({ en: "Why does the target include a safety margin?", hi: "लक्ष्य में सुरक्षा बफर क्यों शामिल है?" })}
            </h3>
            <ul className="list-disc pl-4 space-y-1.5 text-xs text-slate-600">
              {target.explanation.details.map((detail, idx) => (
                <li key={idx}>{detail}</li>
              ))}
            </ul>
          </div>

          {/* Official Disclaimer */}
          <p className="text-[11px] text-slate-400 italic">
            <strong>{t({ en: "Disclaimer: ", hi: "अस्वीकरण: " })}</strong>
            {target.explanation.disclaimer}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {onOpenProfile && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition underline underline-offset-4"
            >
              {t({ en: "Edit category / candidate profile →", hi: "श्रेणी / उम्मीदवार प्रोफाइल बदलें →" })}
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {onOpenStrategy && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenStrategy();
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
              >
                {t({ en: "View Question Strategy Scenarios →", hi: "प्रश्न रणनीति परिदृश्य देखें →" })}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              {t({ en: "Close", hi: "बंद करें" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
