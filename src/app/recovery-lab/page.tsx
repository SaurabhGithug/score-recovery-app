"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  MADE_EASY_DRILL_QUESTIONS,
  MADE_EASY_IMPORT,
  MADE_EASY_QUESTIONS,
  MadeEasyQuestionWithTest,
  formatSeconds,
  observedSignal,
  recoveryPriority,
} from "@/lib/madeeasy";

type StatusFilter = "all" | "incorrect" | "unattempted";
type QualityFilter = "all" | "verified_text" | "visual_review_required";
type LabMode = "bank" | "drill";

interface ProgressEntry {
  attempts: number;
  correct: number;
  bestCorrectSeconds: number | null;
  lastAttemptedAt: string;
}

const PROGRESS_KEY = "score-recovery.madeeasy-lab.v2";

const TOTALS = MADE_EASY_IMPORT.tests.reduce(
  (total, test) => ({
    score: total.score + test.summary.score,
    maxScore: total.maxScore + test.summary.maxScore,
    correct: total.correct + test.summary.correct,
    incorrect: total.incorrect + test.summary.incorrect,
    unattempted: total.unattempted + test.summary.unattempted,
  }),
  { score: 0, maxScore: 0, correct: 0, incorrect: 0, unattempted: 0 }
);

function statusLabel(status: MadeEasyQuestionWithTest["status"]) {
  return status === "incorrect" ? "Incorrect" : "Unattempted";
}

function qualityLabel(question: MadeEasyQuestionWithTest) {
  return question.sourceQuality === "verified_text" ? "Drill-ready" : "Visual source needed";
}

function optionClass(
  optionId: string,
  question: MadeEasyQuestionWithTest,
  selected: string | null,
  revealed: boolean
) {
  if (!revealed) {
    return selected === optionId
      ? "border-blue-500 bg-blue-50 text-blue-950"
      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40";
  }
  if (optionId === question.correctOption) return "border-emerald-500 bg-emerald-50 text-emerald-950";
  if (optionId === selected) return "border-rose-400 bg-rose-50 text-rose-900";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export default function RecoveryLabPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading saved tests…</p>}><RecoveryLabContent /></Suspense>;
}

function RecoveryLabContent() {
  const params = useSearchParams();
  const requestedTest = params.get("test");
  const initialTestFilter = MADE_EASY_IMPORT.tests.some((test) => test.code === requestedTest)
    ? requestedTest!
    : "all";
  const [mode, setMode] = useState<LabMode>("bank");
  const [testFilter, setTestFilter] = useState(initialTestFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(18);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, ProgressEntry>>({});
  const [drillQuestionId, setDrillQuestionId] = useState(
    MADE_EASY_DRILL_QUESTIONS[0]?.id ?? ""
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const readSavedProgress = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(PROGRESS_KEY);
        if (saved) setProgress(JSON.parse(saved) as Record<string, ProgressEntry>);
      } catch {
        // A malformed local record must never block the imported evidence.
      }
    }, 0);
    return () => window.clearTimeout(readSavedProgress);
  }, []);

  useEffect(() => {
    if (mode !== "drill" || revealed) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [mode, revealed, startedAt]);

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return MADE_EASY_QUESTIONS.filter((question) => {
      if (testFilter !== "all" && question.testCode !== testFilter) return false;
      if (statusFilter !== "all" && question.status !== statusFilter) return false;
      if (qualityFilter !== "all" && question.sourceQuality !== qualityFilter) return false;
      if (term && !`${question.question} ${question.testTitle} ${question.id}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    }).sort((a, b) => recoveryPriority(b) - recoveryPriority(a));
  }, [qualityFilter, search, statusFilter, testFilter]);

  const drillPool = useMemo(
    () =>
      filteredQuestions.filter((question) => question.sourceQuality === "verified_text"),
    [filteredQuestions]
  );

  const activeQuestion =
    drillPool.find((question) => question.id === drillQuestionId) ?? drillPool[0] ?? null;
  const activeIndex = activeQuestion
    ? drillPool.findIndex((question) => question.id === activeQuestion.id)
    : -1;

  const reviewedCount = Object.keys(progress).length;
  const correctReviews = Object.values(progress).reduce((sum, item) => sum + item.correct, 0);
  const totalReviews = Object.values(progress).reduce((sum, item) => sum + item.attempts, 0);

  function resetQuestion(questionId: string) {
    setDrillQuestionId(questionId);
    setSelectedOption(null);
    setRevealed(false);
    setElapsedSeconds(0);
    setStartedAt(Date.now());
  }

  function openDrill(questionId?: string) {
    const target = questionId
      ? drillPool.find((question) => question.id === questionId)
      : drillPool[0];
    if (!target) return;
    resetQuestion(target.id);
    setMode("drill");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitAnswer() {
    if (!activeQuestion || !selectedOption || revealed) return;
    const isCorrect = selectedOption === activeQuestion.correctOption;
    const finalSeconds = Math.max(1, elapsedSeconds);
    setElapsedSeconds(finalSeconds);
    setRevealed(true);
    setProgress((current) => {
      const previous = current[activeQuestion.id];
      const nextEntry: ProgressEntry = {
        attempts: (previous?.attempts ?? 0) + 1,
        correct: (previous?.correct ?? 0) + (isCorrect ? 1 : 0),
        bestCorrectSeconds: isCorrect
          ? previous?.bestCorrectSeconds === null || previous?.bestCorrectSeconds === undefined
            ? finalSeconds
            : Math.min(previous.bestCorrectSeconds, finalSeconds)
          : previous?.bestCorrectSeconds ?? null,
        lastAttemptedAt: new Date().toISOString(),
      };
      const next = { ...current, [activeQuestion.id]: nextEntry };
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function nextQuestion() {
    if (!drillPool.length) return;
    const nextIndex = activeIndex >= 0 ? activeIndex + 1 : 0;
    if (nextIndex >= drillPool.length) {
      setMode("bank");
      return;
    }
    resetQuestion(drillPool[nextIndex].id);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-7">
          <p className="text-sm text-slate-500">Made Easy · Captured {MADE_EASY_IMPORT.source.capturedOn}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Review past attempts</h1>
          <p className="mt-2 text-sm text-slate-600">Work on incorrect and unanswered questions. Missing source content is never guessed.</p>
          <div className="mt-5 flex flex-wrap items-center gap-5">
            {mode==="bank"?<button type="button" onClick={()=>openDrill()} disabled={!drillPool.length} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Start practice →</button>:<button type="button" onClick={()=>setMode("bank")} className="text-sm text-slate-600 underline">Back to questions</button>}
            <Link href="/recovery-lab/testbook" className="text-sm text-slate-600 underline">Testbook questions</Link>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-4xl space-y-7 px-4 py-7">
        {mode==="bank"&&<details open className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">My 4 saved test results</summary><p className="mt-4 text-sm text-slate-600">Imported score {TOTALS.score}/{TOTALS.maxScore} · {TOTALS.correct} correct · {TOTALS.incorrect} incorrect · {TOTALS.unattempted} unattempted · {MADE_EASY_DRILL_QUESTIONS.length} ready for practice.</p><div className="mt-5 space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MADE_EASY_IMPORT.tests.map((test) => {
            const coverage = test.summary.correct + test.summary.incorrect;
            const attention = test.summary.incorrect + test.summary.unattempted;
            return (
              <button
                type="button"
                key={test.code}
                onClick={() => {
                  setTestFilter(test.code);
                  setVisibleCount(18);
                  setMode("bank");
                }}
                className={`rounded-2xl border p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md ${
                  testFilter === test.code ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">
                    {test.code.replace("test-", "Test ")}
                  </span>
                  <span className="font-mono text-sm font-black text-slate-900">
                    {test.summary.score}/{test.summary.maxScore}
                  </span>
                </div>
                <h2 className="mt-3 line-clamp-3 min-h-12 text-sm font-bold leading-5 text-slate-900">{test.title}</h2>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-blue-600" style={{ width: `${coverage * 2}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                  <div><div className="font-mono text-sm font-bold">{test.summary.accuracy}%</div><div className="text-[10px] text-slate-500">accuracy</div></div>
                  <div><div className="font-mono text-sm font-bold">{coverage}/50</div><div className="text-[10px] text-slate-500">answered</div></div>
                  <div><div className="font-mono text-sm font-bold text-amber-700">{attention}</div><div className="text-[10px] text-slate-500">attention</div></div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  Rank {test.summary.rank}/{test.summary.participants} · {test.summary.timeMinutes} min · group average {test.summary.averageScore}
                </div>
              </button>
            );
          })}
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">✓</span>
            <div>
              <h2 className="text-sm font-black text-emerald-950">Incomplete questions are kept out of practice</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-900/80">
                {MADE_EASY_IMPORT.source.integrityPolicy} The {MADE_EASY_QUESTIONS.length - MADE_EASY_DRILL_QUESTIONS.length} gated records remain visible for source repair,
                but their missing formulas, diagrams, tables, or explanations are not replaced with generated content.
              </p>
            </div>
          </div>
        </section>

        </div></details>}

        {mode==="bank"&&<>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="lg:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Search question</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(18);
                }}
                placeholder="Question text or source ID"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Test</span>
              <select value={testFilter} onChange={(event) => { setTestFilter(event.target.value); setVisibleCount(18); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="all">All 4 tests</option>
                {MADE_EASY_IMPORT.tests.map((test) => <option key={test.code} value={test.code}>{test.code.replace("test-", "Test ")}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Original result</span>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setVisibleCount(18); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="all">Incorrect + unattempted</option>
                <option value="incorrect">Incorrect only</option>
                <option value="unattempted">Unattempted only</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Source state</span>
              <select value={qualityFilter} onChange={(event) => { setQualityFilter(event.target.value as QualityFilter); setVisibleCount(18); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="all">All source states</option>
                <option value="verified_text">Drill-ready</option>
                <option value="visual_review_required">Visual source needed</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span>{filteredQuestions.length} matching attention questions · {drillPool.length} safe for drills</span>
            {testFilter !== "all" && <button type="button" onClick={() => setTestFilter("all")} className="font-bold text-blue-700 hover:underline">Clear test filter</button>}
          </div>
        </section>
        </>}

        {mode === "drill" ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              {activeQuestion ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-800">{activeQuestion.testCode.replace("test-", "Test ")} · Q{activeQuestion.number}</span>
                      <span className={activeQuestion.status === "incorrect" ? "text-rose-700" : "text-amber-700"}>{statusLabel(activeQuestion.status)} in source</span>
                    </div>
                    <div className="font-mono text-xl font-black text-slate-900">{formatSeconds(elapsedSeconds)}</div>
                  </div>

                  <p className="mt-6 whitespace-pre-line text-base font-semibold leading-7 text-slate-900 sm:text-lg">{activeQuestion.question}</p>
                  <div className="mt-5 grid gap-2.5">
                    {activeQuestion.options.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        disabled={revealed}
                        onClick={() => setSelectedOption(option.id)}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition ${optionClass(option.id, activeQuestion, selectedOption, revealed)}`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-black">{option.id}</span>
                        <span className="pt-0.5 leading-5">{option.text}</span>
                      </button>
                    ))}
                  </div>

                  {!revealed ? (
                    <button type="button" disabled={!selectedOption} onClick={submitAnswer} className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto">Check answer</button>
                  ) : (
                    <div className="mt-6 space-y-4">
                      <div className={`rounded-xl border p-4 ${selectedOption === activeQuestion.correctOption ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                        <div className="text-sm font-black">{selectedOption === activeQuestion.correctOption ? "Correct" : `Correct answer: ${activeQuestion.correctOption}`}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-700">
                          Your time: {formatSeconds(elapsedSeconds)} · test provider’s group average: {formatSeconds(activeQuestion.avgTimeSeconds)} · {elapsedSeconds <= activeQuestion.avgTimeSeconds ? "within the group average" : `${formatSeconds(elapsedSeconds - activeQuestion.avgTimeSeconds)} over the group average`}
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <div className="text-xs font-black uppercase tracking-wide text-blue-800">Knowledge to retain · portal explanation</div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">{activeQuestion.explanation}</p>
                      </div>
                      {activeQuestion.deceptiveChoice && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                          <span className="font-black">Portal deceptive-choice signal:</span> {activeQuestion.deceptiveChoice}
                        </div>
                      )}
                      <button type="button" onClick={nextQuestion} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">{activeIndex + 1 >= drillPool.length ? "Finish drill" : "Next question →"}</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-16 text-center">
                  <h2 className="font-black text-slate-900">No drill-ready question matches these filters</h2>
                  <p className="mt-2 text-sm text-slate-500">Clear the visual-source filter or select another test.</p>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Current drill</div>
                <div className="mt-2 text-3xl font-black text-slate-950">{activeIndex >= 0 ? activeIndex + 1 : 0}<span className="text-base text-slate-400">/{drillPool.length}</span></div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Incorrect source responses are ordered before unattempted items. Within each group, observed time and portal trap signals raise priority.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Local drill record</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><div className="text-2xl font-black">{reviewedCount}</div><div className="text-[11px] text-slate-500">unique reviewed</div></div>
                  <div><div className="text-2xl font-black">{totalReviews ? Math.round((correctReviews / totalReviews) * 100) : 0}%</div><div className="text-[11px] text-slate-500">drill accuracy</div></div>
                </div>
                <p className="mt-3 text-[11px] leading-4 text-slate-400">Saved only in this browser. It does not change the imported portal record.</p>
              </div>
              <button type="button" onClick={() => setMode("bank")} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">← Back to questions</button>
            </aside>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Priority queue</div>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Questions that need attention</h2>
                <p className="mt-1 text-sm text-slate-500">Question order follows a practice rule based on your saved results.</p>
              </div>
              <button type="button" onClick={() => openDrill()} disabled={!drillPool.length} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">Drill this filtered set</button>
            </div>

            <div className="space-y-3">
              {filteredQuestions.slice(0, visibleCount).map((question, index) => {
                const expanded = expandedId === question.id;
                const record = progress[question.id];
                return (
                  <article key={question.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">Priority {index + 1}</span>
                            <span className="text-slate-500">{question.testCode.replace("test-", "Test ")} · Q{question.number}</span>
                            <span className={question.status === "incorrect" ? "rounded-md bg-rose-100 px-2 py-1 text-rose-800" : "rounded-md bg-amber-100 px-2 py-1 text-amber-800"}>{statusLabel(question.status)}</span>
                            <span className={question.sourceQuality === "verified_text" ? "rounded-md bg-emerald-100 px-2 py-1 text-emerald-800" : "rounded-md bg-slate-200 px-2 py-1 text-slate-700"}>{qualityLabel(question)}</span>
                          </div>
                          <h3 className="mt-3 whitespace-pre-line text-sm font-bold leading-6 text-slate-900 sm:text-base">{question.question || "Question text is not available in the accessible portal source."}</h3>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>{observedSignal(question)}</span>
                            <span>{question.avgAttemptRate}% of the provider’s group attempted this question</span>
                            {record && <span className="font-semibold text-blue-700">Local drills: {record.correct}/{record.attempts} correct</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => setExpandedId(expanded ? null : question.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{expanded ? "Hide answer and source" : "View answer and source"}</button>
                          {question.sourceQuality === "verified_text" && <button type="button" onClick={() => openDrill(question.id)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Practice</button>}
                        </div>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                        {question.sourceQuality === "visual_review_required" ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                            <div className="font-black">Not ready for practice</div>
                            <p className="mt-1">The source is missing a required image, formula, table, option or explanation. Saved times and results are kept. Missing content will not be made up.</p>
                          </div>
                        ) : (
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                              {question.options.map((option) => (
                                <div key={option.id} className={`rounded-lg border px-3 py-2 text-sm ${option.id === question.correctOption ? "border-emerald-300 bg-emerald-50" : option.id === question.selectedOption ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
                                  <span className="mr-2 font-black">{option.id}.</span>{option.text}
                                  {option.id === question.correctOption && <span className="ml-2 text-xs font-bold text-emerald-700">Correct</span>}
                                  {option.id === question.selectedOption && option.id !== question.correctOption && <span className="ml-2 text-xs font-bold text-rose-700">Original answer</span>}
                                </div>
                              ))}
                            </div>
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                              <div className="text-xs font-black uppercase tracking-wide text-blue-800">Portal explanation</div>
                              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">{question.explanation}</p>
                              {(question.deceptiveChoice || question.popularChoice) && <div className="mt-3 border-t border-blue-200 pt-3 text-xs leading-5 text-blue-900">{question.deceptiveChoice && <div><b>Misleading option:</b> {question.deceptiveChoice}</div>}{question.popularChoice && <div><b>Most chosen option:</b> {question.popularChoice}</div>}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {!filteredQuestions.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center text-sm text-slate-500">No questions match these filters.</div>}
            {visibleCount < filteredQuestions.length && <button type="button" onClick={() => setVisibleCount((count) => count + 18)} className="mt-4 w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Show 18 more</button>}
          </section>
        )}
      </main>
    </div>
  );
}
