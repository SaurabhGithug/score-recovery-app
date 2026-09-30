"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { getLedger, getReport, saveLedger } from "@/lib/storage";
import { recordRetestResult } from "@/lib/diagnosis";
import { ALL_QUESTIONS } from "@/lib/exam";
import { ExamRunner } from "@/components/ExamRunner";
import { ERROR_CAUSE_LABEL, NextAction, RecoveryReport, SECTION_LABEL } from "@/lib/types";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";

type ActionResult = { resolved: boolean };

export default function RepairPage() {
  const { t } = useLang();
  const params = useParams<{ attemptId: string }>();
  const [report, setReport] = useState<RecoveryReport | null | undefined>(undefined);
  const [actionIndex, setActionIndex] = useState(0);
  const [subPhase, setSubPhase] = useState<"review" | "drill" | "actionDone">("review");
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  useEffect(() => {
    setReport(getReport(params.attemptId));
  }, [params.attemptId]);

  const actions: NextAction[] = report?.nextActions ?? [];
  const action = actions[actionIndex];

  // Hide navigation while working through an action (review/drill/result); it reappears on the
  // final summary screen and on the empty/loading states, where navigating away is safe. Unlike
  // the timed exam, the calculator stays available here — this is untimed practice.
  useDeclareAttemptMode(actions.length > 0 && actionIndex < actions.length ? "drill" : null);

  const originalQuestion = useMemo(() => {
    if (!action) return null;
    return ALL_QUESTIONS.find((q) => q.section === action.section && q.concept === action.concept && !q.retestOf) ?? null;
  }, [action]);

  const drillQuestions = useMemo(() => {
    if (!action) return [];
    return action.drillQuestionIds.map((id) => ALL_QUESTIONS.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);
  }, [action]);

  // No paired retest question for this action (shouldn't normally happen) — skip the drill
  // step via an effect, not during render, so we never call setState mid-render.
  useEffect(() => {
    if (subPhase === "drill" && drillQuestions.length === 0) {
      setSubPhase("actionDone");
    }
  }, [subPhase, drillQuestions.length]);

  if (report === undefined) {
    return <div className="flex-1 px-4 py-14 text-center text-sm text-slate-400">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</div>;
  }
  if (!report || actions.length === 0) {
    return (
      <div className="mx-auto max-w-md flex-1 px-4 py-14 text-center">
        <p className="text-sm text-slate-600">{t({ en: "No repair drill to show for this attempt.", hi: "इस प्रयास के लिए कोई सुधार अभ्यास नहीं है।" })}</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
          {t({ en: "Go to dashboard", hi: "डैशबोर्ड पर जाएँ" })}
        </Link>
      </div>
    );
  }

  // All actions complete — summary.
  if (actionIndex >= actions.length) {
    const resolvedCount = Object.values(results).filter((r) => r.resolved).length;
    return (
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-14 text-center">
        <span className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          {t({ en: "Repair drill complete", hi: "सुधार अभ्यास पूर्ण" })}
        </span>
        <h1 className="text-2xl font-bold text-slate-900">
          {resolvedCount}/{actions.length} {t({ en: "fixed on the unseen retest", hi: "अनदेखे पुनर्परीक्षण में ठीक हुए" })}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {t({
            en: "Each check used a different question on the same topic. You were not shown the same question again.",
            hi: "यह वास्तविक प्रमाण है — प्रत्येक पुनर्परीक्षण में उसी अवधारणा का अलग प्रश्न उपयोग हुआ, वह नहीं जो आप पहले देख चुके थे।",
          })}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/dashboard" className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            {t({ en: "View my progress", hi: "मेरी प्रगति देखें" })}
          </Link>
          <Link href="/exam" className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {t({ en: "Take another mock", hi: "एक और मॉक दें" })}
          </Link>
        </div>
      </div>
    );
  }

  if (subPhase === "review") {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t({ en: "Action", hi: "कदम" })} {actionIndex + 1}/{actions.length} · {t(SECTION_LABEL[action.section])}
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{t(action.title)}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t({ en: "Cause", hi: "कारण" })}: {t(ERROR_CAUSE_LABEL[action.cause])}
        </p>

        {originalQuestion && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold text-slate-400">{t({ en: "What tripped you up", hi: "आपको कहाँ भ्रम हुआ" })}</p>
            <p className="mt-2 text-sm text-slate-800">{t(originalQuestion.text)}</p>
            <div className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{t(originalQuestion.explanation)}</div>
            {originalQuestion.commonTrap && (
              <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <span className="font-semibold">{t({ en: "Common trap: ", hi: "आम भ्रम: " })}</span>
                {t(originalQuestion.commonTrap)}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setSubPhase("drill")}
          className="mt-6 w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto sm:px-10"
        >
          {t({ en: "I understand — try an unseen question →", hi: "समझ गया — एक अनदेखा प्रश्न आज़माएँ →" })}
        </button>
      </div>
    );
  }

  if (subPhase === "drill") {
    if (drillQuestions.length === 0) {
      // No paired retest question available — the effect above will advance us
      // past this state; render nothing in the meantime.
      return null;
    }
    return (
      <ExamRunner
        questions={drillQuestions}
        immediateFeedback
        onFinish={(responses) => {
          const resolved = responses.every((r) => r.isCorrect === true);
          const ledger = getLedger();
          const updated = recordRetestResult(
            ledger,
            action.section,
            action.concept,
            report.attemptId,
            new Date().toISOString(),
            resolved
          );
          saveLedger(updated);
          setResults((prev) => ({ ...prev, [action.id]: { resolved } }));
          setSubPhase("actionDone");
        }}
      />
    );
  }

  // actionDone
  const result = results[action.id];
  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-14 text-center">
      <span
        className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
          result?.resolved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {result?.resolved ? t({ en: "Fixed ✓", hi: "ठीक हुआ ✓" }) : t({ en: "Not yet", hi: "अभी नहीं" })}
      </span>
      <h2 className="text-xl font-bold text-slate-900">
        {result?.resolved
          ? t({ en: "You got it on the unseen version.", hi: "आपने अनदेखे संस्करण में इसे सही किया।" })
          : t({ en: "Still tripping on this one — it'll come back around.", hi: "यह अभी भी भ्रमित कर रहा है — यह फिर से आएगा।" })}
      </h2>
      <button
        onClick={() => {
          setActionIndex((i) => i + 1);
          setSubPhase("review");
        }}
        className="mt-8 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
      >
        {actionIndex + 1 < actions.length
          ? t({ en: "Next action →", hi: "अगला कदम →" })
          : t({ en: "See summary →", hi: "सारांश देखें →" })}
      </button>
    </div>
  );
}
