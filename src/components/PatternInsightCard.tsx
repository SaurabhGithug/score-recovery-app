"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ErrorCause, RecoveryReport } from "@/lib/types";

interface PatternInsightCardProps {
  latestReport: RecoveryReport | null;
  attemptCount: number;
}

export function PatternInsightCard({ latestReport, attemptCount }: PatternInsightCardProps) {
  const { t } = useLang();

  if (!latestReport || attemptCount === 0) {
    return null;
  }

  // Determine top behavioral cause
  const recoverableByCause = latestReport.recoverableByCause || {};
  let topCause: ErrorCause | null = null;
  let maxMarks = 0;

  (Object.keys(recoverableByCause) as ErrorCause[]).forEach((cause) => {
    const marks = recoverableByCause[cause] ?? 0;
    if (marks > maxMarks) {
      maxMarks = marks;
      topCause = cause;
    }
  });

  // Dynamic coach insight based on real observed cause
  let insightText = {
    en: "Keep building your attempt history to uncover deeper behavioural patterns.",
    hi: "गहन व्यावहारिक पैटर्न उजागर करने के लिए अपना टेस्ट इतिहास बनाना जारी रखें।",
  };

  if (topCause === "risky_guess") {
    insightText = {
      en: "Your accuracy improves noticeably when you avoid low-confidence guesses. Pacing and skipping doubtful questions will protect your negative marks.",
      hi: "जब आप कम आत्मविश्वास वाले अनुमानों से बचते हैं तो आपकी सटीकता काफी सुधरती है। संदेहास्पद प्रश्नों को छोड़ना आपके नकारात्मक अंकों की रक्षा करेगा।",
    };
  } else if (topCause === "time_pressure") {
    insightText = {
      en: "Your accuracy is strong on attempted questions, but running out of time is leaving easy marks on the table. Speed drills will yield fast gains.",
      hi: "प्रयास किए गए प्रश्नों पर आपकी सटीकता अच्छी है, लेकिन समय समाप्त होने से आसान प्रश्न छूट रहे हैं। स्पीड ड्रिल से त्वरित लाभ मिलेगा।",
    };
  } else if (topCause === "calculation_error") {
    insightText = {
      en: "You have sound conceptual grasp, but execution and arithmetic slips are costing recoverable marks. Verify final steps carefully.",
      hi: "आपकी वैचारिक समझ अच्छी है, लेकिन गणना और अंतिम चरण की चूक से अंक कट रहे हैं। अंतिम चरणों को ध्यान से सत्यापित करें।",
    };
  } else if (topCause === "recurring_gap") {
    insightText = {
      en: "Certain trap patterns are repeating across sessions. Prioritizing unseen retests on these concepts will plug your largest score leak.",
      hi: "कुछ त्रुटि पैटर्न बार-बार दोहराए जा रहे हैं। इन अवधारणाओं पर अनदेखे पुनर्परीक्षणों को प्राथमिकता देने से आपका सबसे बड़ा स्कोर रिसाव बंद होगा।",
    };
  } else if (topCause === "concept_gap") {
    insightText = {
      en: "Target foundational concept repairs in your weakest topics before taking timed speed drills.",
      hi: "समयबद्ध स्पीड ड्रिल देने से पहले अपने सबसे कमजोर विषयों में बुनियादी अवधारणा सुधार पर ध्यान केंद्रित करें।",
    };
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-blue-50/40 p-5 shadow-xs sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm">💡</span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
              {t({ en: "Coach Pattern Insight", hi: "कोच पैटर्न अंतर्दृष्टि" })}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800 leading-relaxed sm:text-base">
            “{t(insightText)}”
          </p>
        </div>

        <div className="shrink-0">
          <Link
            href="/dashboard/topics"
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 transition"
          >
            <span>{t({ en: "See deep analysis", hi: "विस्तृत विश्लेषण देखें" })}</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
