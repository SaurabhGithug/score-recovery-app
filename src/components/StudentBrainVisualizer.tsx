"use client";

import { useLang } from "@/lib/i18n";
import { StudentConceptState } from "@/lib/domain/schema";
import { universalKnowledgeBrain } from "@/lib/domain/universal-brain";

interface StudentBrainVisualizerProps {
  conceptStates: StudentConceptState[];
}

export function StudentBrainVisualizer({ conceptStates }: StudentBrainVisualizerProps) {
  const { t } = useLang();

  if (!conceptStates || conceptStates.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm">
        {t({
          en: "No topic results yet. Answer practice questions to see your progress.",
          hi: "अभी तक कोई विषय साक्ष्य दर्ज नहीं है। विषय विश्लेषण उत्पन्न करने के लिए एक नैदानिक परीक्षण पूरा करें।",
        })}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {conceptStates.map((state) => {
          const concept = universalKnowledgeBrain.getConcept(state.conceptId);
          const conceptTitle = concept ? t(concept.name) : state.conceptId;

          // Evidence sufficiency check (avoiding false precision on 0 or 1 attempt)
          const hasSufficientEvidence = state.attemptsTotal >= 2;
          const isSingleAttempt = state.attemptsTotal === 1;

          // Humanized Mastery
          let masteryLabel = { en: "Needs work", hi: "सुधार आवश्यक" };
          let masteryBadgeColor = "text-amber-800 bg-amber-50 border-amber-200";

          if (state.attemptsTotal === 0) {
            masteryLabel = { en: "Unassessed", hi: "मूल्यांकन शेष" };
            masteryBadgeColor = "text-slate-600 bg-slate-100 border-slate-200";
          } else if (state.difficultyAdjustedMastery >= 0.75) {
            masteryLabel = { en: "Strong", hi: "मजबूत" };
            masteryBadgeColor = "text-emerald-800 bg-emerald-50 border-emerald-200";
          } else if (state.difficultyAdjustedMastery >= 0.45) {
            masteryLabel = { en: "Developing", hi: "प्रगति पर" };
            masteryBadgeColor = "text-blue-800 bg-blue-50 border-blue-200";
          }

          // Humanized Speed
          let speedLabel = { en: "On target", hi: "उचित गति" };
          if (state.attemptsTotal === 0) {
            speedLabel = { en: "No data", hi: "डेटा नहीं" };
          } else if (state.solvingSpeedIndex <= 0.85) {
            speedLabel = { en: "Very fast", hi: "अत्यधिक तीव्र" };
          } else if (state.solvingSpeedIndex > 1.3) {
            speedLabel = { en: "Needs pacing", hi: "गति सुधारें" };
          }

          // Humanized Confidence Calibration
          let calibrationAdvice = {
            en: "Confidence matches your answers",
            hi: "संतुलित आत्मविश्वास",
          };
          if (!hasSufficientEvidence) {
            calibrationAdvice = {
              en: "Answer more questions first",
              hi: "प्रारंभिक संकेत · और प्रश्नों की आवश्यकता",
            };
          } else if (state.confidenceCalibrationScore < 0.45) {
            calibrationAdvice = {
              en: "Sometimes confident on wrong answers",
              hi: "गलत उत्तरों पर कभी-कभी अत्यधिक आत्मविश्वास",
            };
          } else if (state.confidenceCalibrationScore < 0.7) {
            calibrationAdvice = {
              en: "Occasional hesitation on correct answers",
              hi: "सही उत्तरों पर कभी-कभी हिचकिचाहट",
            };
          }

          return (
            <div
              key={state.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:border-blue-300 hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{conceptTitle}</h4>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${masteryBadgeColor}`}
                  >
                    {t(masteryLabel)}
                  </span>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  {/* Mastery with verbal label */}
                  <div>
                    <div className="flex justify-between text-slate-600 font-medium mb-1">
                      <span>{t({ en: "Topic progress", hi: "दक्षता स्तर" })}</span>
                      <span className="font-bold text-slate-800">
                        {state.attemptsTotal > 0
                          ? `${Math.round(state.difficultyAdjustedMastery * 100)}%`
                          : t({ en: "No attempts", hi: "कोई प्रयास नहीं" })}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{
                          width: `${state.attemptsTotal > 0 ? Math.max(5, state.difficultyAdjustedMastery * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Solving Speed */}
                  <div className="flex items-center justify-between py-1 border-t border-slate-100 text-slate-600">
                    <span className="font-medium">{t({ en: "Answer speed:", hi: "हल करने की गति:" })}</span>
                    <span className="font-bold text-slate-800">
                      {t(speedLabel)}
                      {state.attemptsTotal > 0 && (
                        <span className="text-slate-400 font-normal ml-1">({state.solvingSpeedIndex}x)</span>
                      )}
                    </span>
                  </div>

                  {/* Confidence Accuracy */}
                  <div className="py-1 border-t border-slate-100 text-slate-600">
                    <span className="font-medium block text-slate-500 mb-0.5">
                      {t({ en: "Confidence and results:", hi: "आत्मविश्वास सटीकता:" })}
                    </span>
                    <span className="font-semibold text-slate-800">{t(calibrationAdvice)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {state.attemptsTotal} {t({ en: "attempts", hi: "प्रयास" })} (
                  {state.attemptsCorrect} {t({ en: "correct", hi: "सही" })})
                </span>
                {isSingleAttempt && (
                  <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                    {t({ en: "Early data", hi: "प्रारंभिक डेटा" })}
                  </span>
                )}
                {hasSufficientEvidence && (
                  <span className="font-semibold text-slate-700">
                    {state.consistencyScore >= 0.7 ? "✓ Consistent" : "⚡ Variable"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
