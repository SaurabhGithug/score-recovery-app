"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SscExamRunner } from "@/components/SscExamRunner";
import { useLang } from "@/lib/i18n";
import { ALL_QUESTIONS, DIAGNOSTIC_BLUEPRINT } from "@/lib/exam";
import { buildRecoveryReport, updateLedgerWithDiagnosis } from "@/lib/diagnosis";
import {
  clearCheckpoint,
  ExamCheckpoint,
  genId,
  getCheckpoint,
  getLedger,
  getProfile,
  saveAttempt,
  saveCheckpoint,
  saveLedger,
  saveReport,
} from "@/lib/storage";
import { Attempt, ResponseEvent, SECTION_LABEL } from "@/lib/types";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";
import { PlatformStore } from "@/lib/storage/platform-store";
import { SSC_JE_EXAM_ID, SSC_JE_BRANCHES } from "@/lib/ssc-je/config";
import { ISRO_JPA_EXAM_ID } from "@/lib/isro-jpa/config";
import { useUser } from "@/lib/user-context";

export default function ExamPage() {
  const { t } = useLang();
  const { currentUser, activeContext } = useUser();
  const router = useRouter();
  const blueprint = DIAGNOSTIC_BLUEPRINT;
  const [phase, setPhase] = useState<"intro" | "running">("intro");
  const [checkpoint, setCheckpoint] = useState<ExamCheckpoint | null>(null);
  const [resuming, setResuming] = useState(false);
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString());
  const [activeProfile, setActiveProfile] = useState(() => PlatformStore.getActiveStudentProfile());

  // Hides top/bottom navigation and the calculator for the duration of the timed attempt — see attempt-mode.tsx.
  useDeclareAttemptMode(phase === "running" ? "exam" : null);

  useEffect(() => {
    setCheckpoint(getCheckpoint(blueprint.id, currentUser?.id));
    setActiveProfile(PlatformStore.getActiveStudentProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  function begin(resume: boolean) {
    if (resume && checkpoint) {
      setStartedAt(checkpoint.startedAt);
      setResuming(true);
    } else {
      clearCheckpoint(blueprint.id, currentUser?.id);
      setStartedAt(new Date().toISOString());
      setResuming(false);
    }
    setPhase("running");
  }

  function finish(responses: ResponseEvent[], _elapsedSeconds: number, returnToMenu = false) {
    const uid = currentUser?.id;
    const cid = activeContext?.id;
    const attempt: Attempt = {
      id: genId("attempt"),
      examId: blueprint.id,
      userId: uid,
      contextId: cid,
      startedAt,
      submittedAt: new Date().toISOString(),
      responses,
      interrupted: resuming,
    };
    const ledgerBefore = getLedger(uid, cid);
    const report = buildRecoveryReport(attempt, blueprint.questions, ledgerBefore, ALL_QUESTIONS);
    report.userId = uid;
    report.contextId = cid;
    const ledgerAfter = updateLedgerWithDiagnosis(ledgerBefore, report.diagnosis, attempt.id, attempt.submittedAt!);

    saveAttempt(attempt, uid, cid);
    saveReport(report, uid, cid);
    saveLedger(ledgerAfter, uid, cid);
    clearCheckpoint(blueprint.id, uid);

    // Multi-dimensional Student Brain state updating across all 6 cognitive dimensions
    const studentProfile = PlatformStore.getActiveStudentProfile();
    responses.forEach((res) => {
      const q = ALL_QUESTIONS.find((item) => item.id === res.questionId);
      if (q) {
        PlatformStore.recordStudentAttempt(
          {
            id: `att-${res.questionId}-${Date.now()}`,
            studentId: studentProfile.studentId,
            examId: studentProfile.examId,
            questionId: res.questionId,
            selectedOptionKey: res.selectedOptionId,
            isCorrect: res.isCorrect,
            timeSpentSeconds: res.timeSpentSeconds,
            visitCount: res.visitCount,
            answerChangeCount: res.answerChangeCount,
            markedForReview: res.markedForReview,
            confidenceSelfReport: res.confidence,
            createdAt: new Date().toISOString(),
          },
          q.concept,
          q.expectedTimeSeconds,
          q.difficulty,
          q.commonTrap?.en
        );
      }
    });

    router.push(returnToMenu ? "/papers" : `/results/${attempt.id}`);
  }

  const sections = [...new Set(blueprint.questions.map((q) => q.section))];

  if (phase === "running") {
    return (
      <SscExamRunner
        questions={blueprint.questions}
        durationSeconds={blueprint.durationSeconds}
        candidateName={currentUser?.name || getProfile()?.name || ""}
        initial={resuming && checkpoint ? checkpoint.states : undefined}
        initialIndex={resuming && checkpoint ? checkpoint.index : 0}
        onFinish={finish}
        onExit={() => router.push("/papers")}
        onCheckpoint={(states, index) => {
          saveCheckpoint(blueprint.id, { states, index, startedAt });
        }}
      />
    );
  }

  const branchObj = SSC_JE_BRANCHES.find((b) => b.branchCode === activeProfile.branchId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      {/* Active Exam Badge */}
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-semibold text-blue-800">
        <span>Target:</span>
        <span className="font-bold">
          {`SSC Junior Engineer & SA 2026 (${branchObj ? t(branchObj.name).split(" ")[0] : "Civil"})`}
        </span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t(blueprint.title)}</h1>
      <p className="mt-2 text-sm text-slate-600 max-w-lg">{t(blueprint.description)}</p>

      {/* Notice on branch configuration */}
      {activeProfile.examId === SSC_JE_EXAM_ID && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-left text-xs text-emerald-950 space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-emerald-900">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            {t({ en: "Official 2026 Cycle Active:", hi: "आधिकारिक 2026 चक्र सक्रिय:" })}{" "}
            {branchObj ? t(branchObj.name) : "Civil & Structural Engineering"}
          </p>
          <p className="text-emerald-800">
            {t({
              en: "Notice F. No. HQ-C-3019/1/2026-C-3. Paper-I validates aptitude & reasoning (+1 / −0.25). On-screen scientific calculator & Useful Data (IS 456 / Steam Tables) are enabled throughout the test console.",
              hi: "अधिसूचना सं. HQ-C-3019/1/2026-C-3। पेपर-I सामान्य तर्कशक्ति व जागरूकता का परीक्षण करता है (+1 / −0.25)। कंसोल में ऑन-स्क्रीन कैलकुलेटर व उपयोगी डेटा (IS 456 / स्टीम टेबल) उपलब्ध हैं।",
            })}
          </p>
        </div>
      )}

      {/* Sections Grid */}
      <div className="mt-6 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {sections.map((s) => (
          <div key={s} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs">
            {t(SECTION_LABEL[s])}
          </div>
        ))}
      </div>

      <div className="mt-6 grid w-full grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white text-center text-sm shadow-xs">
        <div className="px-3 py-3">
          <p className="text-lg font-bold text-slate-900">{blueprint.questions.length}</p>
          <p className="text-xs text-slate-500">{t({ en: "questions", hi: "प्रश्न" })}</p>
        </div>
        <div className="px-3 py-3">
          <p className="text-lg font-bold text-slate-900">{Math.round(blueprint.durationSeconds / 60)}</p>
          <p className="text-xs text-slate-500">{t({ en: "minutes", hi: "मिनट" })}</p>
        </div>
        <div className="px-3 py-3">
          <p className="text-lg font-bold text-slate-900">+2 / −0.5</p>
          <p className="text-xs text-slate-500">{t({ en: "marking", hi: "अंकन" })}</p>
        </div>
      </div>

      {checkpoint && (
        <div className="mt-5 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800">
          {t({
            en: "You have an interrupted attempt in progress. Resume where you left off, or discard it and start fresh.",
            hi: "आपका एक बाधित प्रयास प्रगति में है। जहाँ से छोड़ा वहाँ से जारी रखें, या इसे हटाकर नए सिरे से शुरू करें।",
          })}
        </div>
      )}

      <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        {checkpoint && (
          <button
            onClick={() => begin(true)}
            className="w-full rounded-xl border border-blue-600 px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:w-auto sm:px-10"
          >
            {t({ en: "Continue test", hi: "प्रयास जारी रखें" })}
          </button>
        )}
        <button
          onClick={() => begin(false)}
          className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 hover:shadow-lg transition sm:w-auto sm:px-10"
        >
          {checkpoint
            ? t({ en: "Discard & start fresh", hi: "हटाएँ और नए सिरे से शुरू करें" })
            : t({ en: "Start practice test", hi: "अभ्यास टेस्ट शुरू करें" })}
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        {t({
          en: "Progress is automatically saved on every action. A closed tab or dropped network can resume without data loss.",
          hi: "प्रत्येक क्रिया पर प्रगति स्वतः सहेजी जाती है। बंद टैब या टूटे नेटवर्क को बिना डेटा हानि के फिर से शुरू किया जा सकता है।",
        })}
      </p>
    </div>
  );
}
