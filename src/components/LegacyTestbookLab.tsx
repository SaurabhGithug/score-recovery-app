"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  countTestbookEvidence,
  migrateLegacyTestbookStorage,
  paperOneRecoveryMarks,
  parseTestbookImport,
  readTrainingAttempts,
  TESTBOOK_IMPORT_STORAGE_KEY,
  TESTBOOK_TRAINING_STORAGE_KEY,
  TestbookAttemptStatus,
  TestbookImport,
  TestbookQuestion,
  TestbookRecoveryCause,
  TestbookTrainingAttempt,
  userScopedTestbookStorageKey,
} from "@/lib/testbook";
import { useUser } from "@/lib/user-context";

type ResultFilter = "attention" | TestbookAttemptStatus | "all";
type LabMode = "bank" | "drill";

interface AiTeachingNote {
  lockedAnswer: string;
  suggestedSyllabusTopic: string;
  concept: string;
  steps: string[];
  whyCorrect: string;
  /** Per-option analysis; absent on notes written before it existed. */
  options?: { id: string; verdict: "correct" | "wrong"; why: string }[];
  traps: string[];
  prerequisites: string[];
  verificationLimits: string[];
}

const resultStyles: Record<TestbookAttemptStatus, string> = {
  correct: "bg-emerald-100 text-emerald-800",
  incorrect: "bg-rose-100 text-rose-800",
  unattempted: "bg-amber-100 text-amber-900",
  partial: "bg-violet-100 text-violet-800",
};

const recoveryCauseLabels: Record<TestbookRecoveryCause, string> = {
  knowledge_gap: "Did not know the concept",
  method_gap: "Knew concept, not the method",
  calculation_error: "Calculation error",
  reading_error: "Misread question or options",
  speed_issue: "Could solve, but too slowly",
  unsure: "Not sure yet",
};

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export default function LegacyTestbookLab() {
  const { currentUser, isLoading: isUserLoading } = useUser();
  const [data, setData] = useState<TestbookImport | null>(null);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [trainingAttempts, setTrainingAttempts] = useState<TestbookTrainingAttempt[]>([]);
  const [pendingAttemptId, setPendingAttemptId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("attention");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [onlySolutionReady, setOnlySolutionReady] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [mode, setMode] = useState<LabMode>("bank");
  const [drillQuestionId, setDrillQuestionId] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [aiNotes, setAiNotes] = useState<Record<string, AiTeachingNote>>({});
  const [aiLoadingId, setAiLoadingId] = useState("");
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    function readImport() {
      if (!currentUser) {
        setData(null);
        setTrainingAttempts([]);
        return;
      }
      try {
        const importKey = migrateLegacyTestbookStorage(TESTBOOK_IMPORT_STORAGE_KEY, currentUser.id);
        const trainingKey = migrateLegacyTestbookStorage(TESTBOOK_TRAINING_STORAGE_KEY, currentUser.id);
        const raw = window.localStorage.getItem(importKey);
        if (!raw) {
          setData(null);
          setTrainingAttempts([]);
          return;
        }
        const parsed = parseTestbookImport(JSON.parse(raw) as unknown);
        setData(parsed);
        setSelectedTestId(parsed.tests[0]?.id || "");
        const attemptsRaw = window.localStorage.getItem(trainingKey);
        setTrainingAttempts(attemptsRaw ? readTrainingAttempts(JSON.parse(attemptsRaw) as unknown) : []);
        setLoadError("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "The saved import could not be read.");
      }
    }
    readImport();
    window.addEventListener("testbook-import-changed", readImport);
    return () => window.removeEventListener("testbook-import-changed", readImport);
  }, [currentUser]);

  const test = data?.tests.find((candidate) => candidate.id === selectedTestId) ?? data?.tests[0] ?? null;
  const evidence = test ? countTestbookEvidence(test) : null;
  const selectedTrainingAttempts = test ? trainingAttempts.filter((attempt) => attempt.testId === test.id) : [];
  const recoveryMarks = test ? paperOneRecoveryMarks(test) : 0;
  const diagnosedMisses = selectedTrainingAttempts.filter((attempt) => !attempt.correct && attempt.cause);
  const causeCounts = diagnosedMisses.reduce<Partial<Record<TestbookRecoveryCause, number>>>((counts, attempt) => {
    if (attempt.cause) counts[attempt.cause] = (counts[attempt.cause] ?? 0) + 1;
    return counts;
  }, {});
  const questions = useMemo(() => {
    if (!test) return [];
    const term = search.trim().toLowerCase();
    return test.questions.filter((question) => {
      if (resultFilter === "attention" && question.originalResult === "correct") return false;
      if (resultFilter !== "attention" && resultFilter !== "all" && question.originalResult !== resultFilter) return false;
      if (sectionFilter !== "all" && question.section !== sectionFilter) return false;
      if (onlySolutionReady && question.evidenceState !== "portal_verified") return false;
      if (term && !`${question.questionText} ${question.section} ${question.globalNumber}`.toLowerCase().includes(term)) return false;
      return true;
    }).sort((left, right) => {
      const sourcePriority: Record<TestbookAttemptStatus, number> = { incorrect: 0, unattempted: 1, partial: 2, correct: 3 };
      const sourceDifference = sourcePriority[left.originalResult] - sourcePriority[right.originalResult];
      if (sourceDifference) return sourceDifference;
      const leftFailures = trainingAttempts.filter((attempt) => attempt.testId === test.id && attempt.questionId === left.id && !attempt.correct).length;
      const rightFailures = trainingAttempts.filter((attempt) => attempt.testId === test.id && attempt.questionId === right.id && !attempt.correct).length;
      return rightFailures - leftFailures || left.globalNumber - right.globalNumber;
    });
  }, [onlySolutionReady, resultFilter, search, sectionFilter, test, trainingAttempts]);

  const drillPool = useMemo(
    () => questions.filter((question) => question.evidenceState === "portal_verified" && question.portalSolution),
    [questions]
  );
  const activeQuestion = drillPool.find((question) => question.id === drillQuestionId) ?? drillPool[0] ?? null;
  const activeIndex = activeQuestion ? drillPool.findIndex((question) => question.id === activeQuestion.id) : -1;

  useEffect(() => {
    if (mode !== "drill" || revealed) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [mode, revealed, startedAt]);

  function resetDrill(questionId: string) {
    setDrillQuestionId(questionId);
    setSelectedOption(null);
    setRevealed(false);
    setElapsedSeconds(0);
    setStartedAt(Date.now());
    setPendingAttemptId("");
  }

  function persistTrainingAttempts(next: TestbookTrainingAttempt[]) {
    if (!currentUser) return;
    setTrainingAttempts(next);
    window.localStorage.setItem(userScopedTestbookStorageKey(TESTBOOK_TRAINING_STORAGE_KEY, currentUser.id), JSON.stringify(next));
  }

  function checkAnswer() {
    if (!test || !activeQuestion || !selectedOption || !activeQuestion.portalSolution) return;
    const attempt: TestbookTrainingAttempt = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${activeQuestion.id}`,
      testId: test.id,
      questionId: activeQuestion.id,
      attemptedAt: new Date().toISOString(),
      selectedOption,
      correct: selectedOption === activeQuestion.portalSolution.correctOption,
      elapsedSeconds,
      cause: null,
    };
    persistTrainingAttempts([...trainingAttempts, attempt]);
    setPendingAttemptId(attempt.id);
    setRevealed(true);
  }

  function labelCause(cause: TestbookRecoveryCause) {
    if (!pendingAttemptId) return;
    persistTrainingAttempts(trainingAttempts.map((attempt) => attempt.id === pendingAttemptId ? { ...attempt, cause } : attempt));
  }

  function startDrill() {
    if (!drillPool[0]) return;
    resetDrill(drillPool[0].id);
    setMode("drill");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nextDrillQuestion() {
    const next = drillPool[activeIndex + 1];
    if (!next) {
      setMode("bank");
      return;
    }
    resetDrill(next.id);
  }

  async function generateTeachingNote(question: TestbookQuestion) {
    if (!question.portalSolution || aiLoadingId) return;
    setAiLoadingId(question.id);
    setAiErrors((current) => ({ ...current, [question.id]: "" }));
    try {
      // Only ids are sent: the server loads the question, key and portal solution from this
      // learner's own copy of the capture, so the browser cannot vouch for an answer.
      const requestNote = () =>
        fetch("/api/testbook/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: test?.id, questionId: question.id }),
        });
      let response = await requestNote();
      let result = await response.json();
      if (response.status === 404 && result.code === "not_on_server" && data) {
        const copied = await fetch("/api/bank/import/testbook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!copied.ok) {
          const copyResult = await copied.json().catch(() => ({}));
          throw new Error(copyResult.error || "Could not copy this Testbook capture to the server.");
        }
        response = await requestNote();
        result = await response.json();
      }
      if (!response.ok) throw new Error(result.error || "Could not generate teaching note.");
      setAiNotes((current) => ({ ...current, [question.id]: result.note as AiTeachingNote }));
    } catch (error) {
      setAiErrors((current) => ({ ...current, [question.id]: error instanceof Error ? error.message : "Could not generate teaching note." }));
    } finally {
      setAiLoadingId("");
    }
  }

  if (isUserLoading) {
    return <div className="mx-auto w-full max-w-3xl px-4 py-12 text-center text-sm font-semibold text-slate-500">Loading your learner account…</div>;
  }

  if (!data || !test || !evidence) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-sm font-black uppercase tracking-wide text-blue-700">SSC JE Civil · Testbook</div>
          <h1 className="mt-3 text-3xl font-black text-slate-950">No verified Testbook import is loaded</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Import a structured portal capture first. Questions without a portal answer and solution remain unavailable for answer-checked drills.
          </p>
          {loadError && <p className="mt-3 text-sm font-semibold text-rose-700">{loadError}</p>}
          <Link href="/recovery-lab/testbook/import" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Open importer</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-7">
          <p className="text-sm text-slate-500">SSC JE Civil · Testbook</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Review your questions</h1>
          <p className="mt-2 text-sm text-slate-600">Practise from your captured attempts. Incomplete questions stay out of checked practice.</p>
          {mode==="bank"&&<div className="mt-5 flex flex-wrap items-center gap-5">
            <button type="button" onClick={startDrill} disabled={!drillPool.length} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Start practice →</button>
            <Link href="/recovery-lab/testbook/import" className="text-sm text-slate-600 underline">Update import</Link>
          </div>}
        </div>
      </section>

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-7">
        {mode==="bank" && data.tests.length > 1 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Verified test capture</span>
              <select value={test.id} onChange={(event) => { setSelectedTestId(event.target.value); setMode("bank"); setVisibleCount(20); setExpandedId(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold">
                {data.tests.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.score}/{candidate.maxScore}</option>)}
              </select>
            </label>
          </section>
        )}
        {mode==="bank"&&<details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Past results & source details</summary><p className="mt-4 text-sm text-slate-600">Score {test.score}/{test.maxScore} · {test.questionCount} questions · {test.summary.correct} correct · {test.summary.incorrect} incorrect · {test.summary.unattempted} unattempted · {evidence.portal_verified} captured solutions.</p><Link href="/recovery-lab/testbook/catalogue" className="mt-3 inline-block text-sm underline">Capture audit</Link><div className="mt-5 space-y-5">


        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
            <div className="text-xs font-black uppercase tracking-wide">First recovery queue</div>
            <div className="mt-2 text-3xl font-black">{test.summary.incorrect}</div>
            <p className="mt-1 text-sm leading-6">Originally wrong questions. In Paper I, changing one from wrong to correct recovers 1.25 marks.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <div className="text-xs font-black uppercase tracking-wide">Second recovery queue</div>
            <div className="mt-2 text-3xl font-black">{test.summary.unattempted}</div>
            <p className="mt-1 text-sm leading-6">Originally unattempted questions. Each new correct answer adds 1 mark in Paper I.</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
            <div className="text-xs font-black uppercase tracking-wide">Maximum visible headroom</div>
            <div className="mt-2 text-3xl font-black">+{recoveryMarks}</div>
            <p className="mt-1 text-sm leading-6">Arithmetic ceiling from this capture, not a prediction. It assumes every original wrong and unattempted item becomes correct.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950">
          <div className="font-black">Review of your saved answers</div>
          {selectedTrainingAttempts.length === 0 ? (
            <p className="mt-1 text-sm leading-6">No recovery attempts yet. Practice first; the app will not diagnose knowledge, method, calculation, reading, or speed from portal marks alone.</p>
          ) : diagnosedMisses.length === 0 ? (
            <p className="mt-1 text-sm leading-6">{selectedTrainingAttempts.length} recovery attempt(s) recorded, but no failed attempt has a confirmed cause yet.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.entries(causeCounts) as [TestbookRecoveryCause, number][]).sort((a, b) => b[1] - a[1]).map(([cause, count]) => <span key={cause} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold">{recoveryCauseLabels[cause]} · {count}</span>)}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <div className="font-black">Current capture: {test.title}, attempt {test.attemptNumber}</div>
          <p className="mt-1">
            All {test.questionCount} question records are present. {evidence.portal_verified} have portal-verified answers and solutions; {evidence.portal_solution_pending} remain queued for portal capture and cannot enter checked practice yet.
          </p>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          <div className="font-black">No-fabrication gate</div>
          <p className="mt-1">Testbook evidence, official SSC syllabus mapping, and future AI teaching notes are separate fields. AI output can explain a verified answer, but cannot create or replace the answer key. Individual Civil topic labels stay “pending verification” until supported by portal or official mapping evidence.</p>
        </section>

        </div></details>}

        {mode === "drill" && activeQuestion ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-800">Q{activeQuestion.globalNumber}</span>
                  <span className={`rounded-md px-2 py-1 capitalize ${resultStyles[activeQuestion.originalResult]}`}>{activeQuestion.originalResult} in source</span>
                  <span className="text-slate-500">{activeQuestion.section}</span>
                </div>
                <div className="font-mono text-xl font-black">{formatSeconds(elapsedSeconds)}</div>
              </div>

              <h2 className="mt-6 text-base font-bold leading-7 text-slate-950 sm:text-lg">{activeQuestion.questionText}</h2>
              {activeQuestion.questionAssets.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {activeQuestion.questionAssets.map((asset, index) => <img key={asset} src={asset} alt={`Testbook source visual ${index + 1}`} className="max-h-72 max-w-full rounded-lg border border-slate-200 bg-white object-contain p-2" />)}
                </div>
              )}

              <div className="mt-5 grid gap-2.5">
                {activeQuestion.options.map((option) => {
                  const correct = revealed && option.id === activeQuestion.portalSolution?.correctOption;
                  const wrongSelection = revealed && option.id === selectedOption && !correct;
                  return (
                    <button key={option.id} type="button" disabled={revealed} onClick={() => setSelectedOption(option.id)} className={`rounded-xl border p-3.5 text-left text-sm transition ${correct ? "border-emerald-500 bg-emerald-50" : wrongSelection ? "border-rose-400 bg-rose-50" : selectedOption === option.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                      <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-black">{option.id}</span><span className="pt-0.5 leading-5">{option.text || "Visual option"}</span></div>
                      {option.assets.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{option.assets.map((asset, index) => <img key={asset} src={asset} alt={`Option ${option.id} visual ${index + 1}`} className="max-h-48 max-w-full rounded border border-slate-200 bg-white object-contain" />)}</div>}
                    </button>
                  );
                })}
              </div>

              {!revealed ? (
                <button type="button" disabled={!selectedOption} onClick={checkAnswer} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Check answer</button>
              ) : (
                <div className="mt-6 space-y-4">
                  <div className={`rounded-xl border p-4 text-sm font-black ${selectedOption === activeQuestion.portalSolution?.correctOption ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                    {selectedOption === activeQuestion.portalSolution?.correctOption ? "Correct" : `Correct answer: ${activeQuestion.portalSolution?.correctOption}`} · {formatSeconds(elapsedSeconds)}
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-blue-800">Testbook portal explanation</div>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">{activeQuestion.portalSolution?.text}</p>
                    {(activeQuestion.portalSolution?.assets.length ?? 0) > 0 && <div className="mt-3 flex flex-wrap gap-3">{activeQuestion.portalSolution?.assets.map((asset, index) => <img key={asset} src={asset} alt={`Testbook solution visual ${index + 1}`} className="max-h-72 max-w-full rounded-lg border border-blue-200 bg-white object-contain p-2" />)}</div>}
                  </div>
                  {selectedOption !== activeQuestion.portalSolution?.correctOption && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="text-xs font-black uppercase tracking-wide text-amber-900">What actually caused this miss?</div>
                      <p className="mt-1 text-xs leading-5 text-amber-900">AI will use these details. It will not guess why you made a mistake from one wrong answer.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(Object.entries(recoveryCauseLabels) as [TestbookRecoveryCause, string][]).map(([cause, label]) => {
                          const selected = trainingAttempts.find((attempt) => attempt.id === pendingAttemptId)?.cause === cause;
                          return <button key={cause} type="button" onClick={() => labelCause(cause)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${selected ? "border-amber-700 bg-amber-200" : "border-amber-300 bg-white"}`}>{label}</button>;
                        })}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={nextDrillQuestion} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">{activeIndex + 1 >= drillPool.length ? "Finish drill" : "Next question →"}</button>
                </div>
              )}
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Filtered recovery drill</div><div className="mt-2 text-3xl font-black">{activeIndex + 1}<span className="text-base text-slate-400">/{drillPool.length}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Learning mode only. Your choices here never change the Testbook attempt.</p></div>
              <button type="button" onClick={() => setMode("bank")} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">← Back to questions</button>
            </aside>
          </section>
        ) : <>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="lg:col-span-2">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Search</span>
              <input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(20); }} placeholder="Question text or number" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Original result</span>
              <select value={resultFilter} onChange={(event) => { setResultFilter(event.target.value as ResultFilter); setVisibleCount(20); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="attention">Incorrect + unattempted</option><option value="incorrect">Incorrect</option><option value="unattempted">Unattempted</option><option value="correct">Correct</option><option value="all">All</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">SSC JE section</span>
              <select value={sectionFilter} onChange={(event) => { setSectionFilter(event.target.value); setVisibleCount(20); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="all">All sections</option>{test.sections.map((section) => <option key={section.name} value={section.name}>{section.name}</option>)}
              </select>
            </label>
            <label className="flex items-end">
              <span className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={onlySolutionReady} onChange={(event) => { setOnlySolutionReady(event.target.checked); setVisibleCount(20); }} /> Solution ready
              </span>
            </label>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{questions.length} matching questions · captured {data.source.capturedOn}</div>
        </section>

        <section className="space-y-3">
          {questions.slice(0, visibleCount).map((question) => {
            const expanded = expandedId === question.id;
            return (
              <article key={question.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                        <span className="rounded-md bg-slate-100 px-2 py-1">Q{question.globalNumber}</span>
                        <span className="text-slate-500">{question.section} · section Q{question.sectionQuestion}</span>
                        <span className={`rounded-md px-2 py-1 capitalize ${resultStyles[question.originalResult]}`}>{question.originalResult}</span>
                        <span className={`rounded-md px-2 py-1 ${question.evidenceState === "portal_verified" ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"}`}>
                          {question.evidenceState === "portal_verified" ? "Portal solution verified" : "Answer key pending"}
                        </span>
                      </div>
                      <h2 className="mt-3 text-sm font-bold leading-6 text-slate-950 sm:text-base">{question.questionText}</h2>
                      <div className="mt-3 text-xs text-slate-500">{question.syllabusTopic ?? "Individual syllabus topic pending verification"}{question.questionAssets.length > 0 ? ` · ${question.questionAssets.length} source visual(s) preserved` : ""}</div>
                    </div>
                    <button type="button" onClick={() => setExpandedId(expanded ? null : question.id)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{expanded ? "Hide source details" : "View source details"}</button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        {question.options.map((option) => (
                          <div key={option.id} className={`rounded-lg border px-3 py-2 text-sm ${question.portalSolution?.correctOption === option.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                            <span className="mr-2 font-black">{option.id}.</span>{option.text || "Visual option — inspect the preserved source asset"}
                            {question.portalSolution?.correctOption === option.id && <span className="ml-2 text-xs font-black text-emerald-700">Portal answer</span>}
                          </div>
                        ))}
                      </div>
                      {question.portalSolution ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <div className="text-xs font-black uppercase tracking-wide text-blue-800">Testbook portal solution</div>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">{question.portalSolution.text}</p>
                          {question.portalSolution.assets.length > 0 && <div className="mt-3 text-xs font-bold text-blue-800">{question.portalSolution.assets.length} solution visual(s) preserved in the source record.</div>}
                          <div className="mt-4 border-t border-blue-200 pt-4">
                            {!aiNotes[question.id] ? (
                              <button type="button" onClick={() => generateTeachingNote(question)} disabled={Boolean(aiLoadingId)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:cursor-wait disabled:opacity-50">
                                {aiLoadingId === question.id ? "Building verified teaching note…" : "Explain deeply with AI"}
                              </button>
                            ) : (
                              <div className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4 text-slate-800">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wide text-indigo-700">
                                  <span>AI teaching note</span><span>·</span><span>Answer locked to portal: {aiNotes[question.id].lockedAnswer}</span>
                                </div>
                                <div className="text-xs font-bold text-slate-500">Suggested syllabus topic · {aiNotes[question.id].suggestedSyllabusTopic}</div>
                                <p className="text-sm leading-6">{aiNotes[question.id].concept}</p>
                                <ol className="list-decimal space-y-1 pl-5 text-sm leading-6">{aiNotes[question.id].steps.map((step) => <li key={step}>{step}</li>)}</ol>
                                <p className="text-sm leading-6"><span className="font-black">Why the portal answer is correct: </span>{aiNotes[question.id].whyCorrect}</p>
                                {(aiNotes[question.id].options ?? []).some((option) => option.verdict === "wrong") && <div><div className="text-xs font-black uppercase text-slate-600">Why the other options are wrong</div><ul className="mt-1 space-y-1 text-sm leading-6">{(aiNotes[question.id].options ?? []).filter((option) => option.verdict === "wrong").map((option) => <li key={option.id}><span className="font-black">{option.id}: </span>{option.why}</li>)}</ul></div>}
                                {aiNotes[question.id].traps.length > 0 && <div><div className="text-xs font-black uppercase text-amber-800">Exam traps</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{aiNotes[question.id].traps.map((trap) => <li key={trap}>{trap}</li>)}</ul></div>}
                                {aiNotes[question.id].verificationLimits.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950"><span className="font-black">Verification limits: </span>{aiNotes[question.id].verificationLimits.join(" · ")}</div>}
                              </div>
                            )}
                            {aiErrors[question.id] && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{aiErrors[question.id]}</p>}
                            <p className="mt-2 text-[11px] leading-4 text-blue-800">The portal remains the answer authority. AI may teach or suggest a syllabus label, but cannot alter the stored answer key.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                          <div className="font-black">Held out of checked training</div>
                          <p className="mt-1">The question and attempt status are captured, but its Testbook answer and solution have not been captured yet. The app will not infer them from wording, popularity, or an AI model.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {visibleCount < questions.length && <button type="button" onClick={() => setVisibleCount((count) => count + 20)} className="w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-700">Show 20 more</button>}
        </section>
        </>}
      </main>
    </div>
  );
}
