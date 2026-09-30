"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Question, QuestionOption, ResponseEvent, SECTION_LABEL } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { ReportIssueButton } from "./ReportIssueButton";

type Confidence = ResponseEvent["confidence"];

export type PerQuestionState = {
  selectedOptionId: QuestionOption["id"] | null;
  answerChangeCount: number;
  visitCount: number;
  markedForReview: boolean;
  confidence: Confidence;
  timeSpentSeconds: number;
};

function emptyState(): PerQuestionState {
  return {
    selectedOptionId: null,
    answerChangeCount: 0,
    visitCount: 0,
    markedForReview: false,
    confidence: null,
    timeSpentSeconds: 0,
  };
}

export type ExamRunnerConfig = {
  questions: Question[];
  /** Omit for untimed (repair drills / retests). */
  durationSeconds?: number;
  /** Show correct/incorrect + explanation immediately after each answer (drill mode). */
  immediateFeedback?: boolean;
  /** Ask a quick confidence rating after each answer. Off by default to reduce fatigue. */
  askConfidence?: boolean;
  onFinish: (responses: ResponseEvent[], elapsedSeconds: number) => void;
  /** Restore from an in-progress checkpoint (question states keyed by question id). */
  initial?: Record<string, PerQuestionState>;
  initialIndex?: number;
  onCheckpoint?: (state: Record<string, PerQuestionState>, index: number) => void;
};

export function ExamRunner({
  questions,
  durationSeconds,
  immediateFeedback = false,
  askConfidence = false,
  onFinish,
  initial,
  initialIndex = 0,
  onCheckpoint,
}: ExamRunnerConfig) {
  const { t, lang } = useLang();
  const [index, setIndex] = useState(initialIndex);
  const [states, setStates] = useState<Record<string, PerQuestionState>>(
    () => initial ?? Object.fromEntries(questions.map((q) => [q.id, emptyState()]))
  );
  const [timeLeft, setTimeLeft] = useState(durationSeconds ?? 0);
  const [revealed, setRevealed] = useState(false); // immediateFeedback mode: has this question's answer been revealed
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const entryTimeRef = useRef<number>(Date.now());
  const totalStartRef = useRef<number>(Date.now());
  const finishedRef = useRef(false);

  // Mirrors of the latest state, readable from callbacks whose closures may be
  // stale (in particular the setInterval timer, whose effect only depends on
  // `durationSeconds` and is not re-created on every question/answer change).
  const statesRef = useRef(states);
  useEffect(() => {
    statesRef.current = states;
  }, [states]);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const q = questions[index];
  const total = questions.length;

  // Record a visit (including revisits) + reset revealed state whenever the current question changes.
  useEffect(() => {
    entryTimeRef.current = Date.now();
    setRevealed(false);
    setStates((prev) => {
      const cur = prev[q.id];
      return { ...prev, [q.id]: { ...cur, visitCount: cur.visitCount + 1 } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Countdown timer for timed mode. Created once (deps=[durationSeconds]) so its
  // closure is stale by the time it fires — it must only read from refs, never
  // from `states`/`index`/`q` directly.
  useEffect(() => {
    if (!durationSeconds) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          // Defer past this render/commit so we never call a state-updating
          // callback (onFinish -> router.push) while React is mid-render.
          setTimeout(() => handleFinish(), 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSeconds]);

  /** Pure — reads/returns, does not set state or call side-effecting callbacks. */
  function flushTimeForCurrent(
    current: Record<string, PerQuestionState>,
    forId: string
  ): Record<string, PerQuestionState> {
    const elapsed = Math.round((Date.now() - entryTimeRef.current) / 1000);
    entryTimeRef.current = Date.now();
    const cur = current[forId];
    return { ...current, [forId]: { ...cur, timeSpentSeconds: cur.timeSpentSeconds + elapsed } };
  }

  function goTo(newIndex: number) {
    const flushed = flushTimeForCurrent(statesRef.current, questions[indexRef.current].id);
    setStates(flushed);
    onCheckpoint?.(flushed, newIndex);
    setIndex(newIndex);
  }

  function selectOption(optionId: QuestionOption["id"]) {
    setStates((prev) => {
      const cur = prev[q.id];
      const changed = cur.selectedOptionId !== null && cur.selectedOptionId !== optionId;
      return {
        ...prev,
        [q.id]: {
          ...cur,
          selectedOptionId: optionId,
          answerChangeCount: changed ? cur.answerChangeCount + 1 : cur.answerChangeCount,
        },
      };
    });
    if (immediateFeedback) setRevealed(true);
  }

  function setConfidence(c: Confidence) {
    setStates((prev) => ({ ...prev, [q.id]: { ...prev[q.id], confidence: c } }));
  }

  function toggleMark() {
    setStates((prev) => ({ ...prev, [q.id]: { ...prev[q.id], markedForReview: !prev[q.id].markedForReview } }));
  }

  function clearAnswer() {
    setStates((prev) => ({ ...prev, [q.id]: { ...prev[q.id], selectedOptionId: null } }));
  }

  function handleFinish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const flushed = flushTimeForCurrent(statesRef.current, questions[indexRef.current].id);
    setStates(flushed);
    const responses: ResponseEvent[] = questions.map((qq) => {
      const s = flushed[qq.id];
      const answered = s.selectedOptionId != null;
      return {
        questionId: qq.id,
        timeSpentSeconds: s.timeSpentSeconds,
        answerChangeCount: s.answerChangeCount,
        visitCount: s.visitCount,
        wasSkipped: !answered,
        markedForReview: s.markedForReview,
        confidence: s.confidence,
        selectedOptionId: s.selectedOptionId,
        isCorrect: answered ? s.selectedOptionId === qq.correctOptionId : null,
      };
    });
    const elapsed = Math.round((Date.now() - totalStartRef.current) / 1000);
    // Outside any state updater — safe to trigger a parent state update (router.push) here.
    onFinish(responses, elapsed);
  }

  const answeredCount = useMemo(
    () => Object.values(states).filter((s) => s.selectedOptionId != null).length,
    [states]
  );

  const mm = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const ss = (timeLeft % 60).toString().padStart(2, "0");

  const current = states[q.id];
  const showAnswer = immediateFeedback && revealed;
  const isCorrectNow = showAnswer && current.selectedOptionId === q.correctOptionId;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div className="text-sm font-medium text-slate-700">
          {t(SECTION_LABEL[q.section])}
          <span className="mx-2 text-slate-300">·</span>
          <span className="text-slate-500">
            {t({ en: "Question", hi: "प्रश्न" })} {index + 1}/{total}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {durationSeconds ? (
            <span
              className={`font-mono text-sm font-semibold ${timeLeft < 60 ? "text-red-600" : "text-slate-700"}`}
            >
              ⏱ {mm}:{ss}
            </span>
          ) : (
            <span className="text-xs text-slate-400">{t({ en: "Untimed practice", hi: "बिना समय-सीमा अभ्यास" })}</span>
          )}
          <span className="text-xs text-slate-500">
            {answeredCount}/{total} {t({ en: "answered", hi: "उत्तरित" })}
          </span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        {/* Question card */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5">{t(q.conceptLabel)}</span>
              <span>
                +{q.marks} / −{q.negativeMarks}
              </span>
            </div>
            <ReportIssueButton question={q} />
          </div>
          <p className="mb-5 text-base leading-relaxed text-slate-900">{t(q.text)}</p>

          <div className="flex flex-col gap-2.5">
            {q.options.map((opt) => {
              const selected = current.selectedOptionId === opt.id;
              const correct = opt.id === q.correctOptionId;
              let cls =
                "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors cursor-pointer";
              if (showAnswer) {
                if (correct) cls += " border-green-500 bg-green-50";
                else if (selected) cls += " border-red-400 bg-red-50";
                else cls += " border-slate-200 bg-white";
              } else if (selected) {
                cls += " border-blue-500 bg-blue-50";
              } else {
                cls += " border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
              }
              return (
                <button key={opt.id} className={cls} onClick={() => !showAnswer && selectOption(opt.id)} disabled={showAnswer}>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-500"
                    }`}
                  >
                    {opt.id}
                  </span>
                  <span className="text-slate-800">{t(opt.text)}</span>
                </button>
              );
            })}
          </div>

          {askConfidence && current.selectedOptionId && !showAnswer && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <span>{t({ en: "How confident were you?", hi: "आप कितने आश्वस्त थे?" })}</span>
              {(["low", "medium", "high"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(c)}
                  className={`rounded-full border px-2.5 py-1 ${
                    current.confidence === c ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  {t({ low: "Low", medium: "Medium", high: "High" }[c] as any) ??
                    { low: "Low", medium: "Medium", high: "High" }[c]}
                </button>
              ))}
            </div>
          )}

          {showAnswer && (
            <div className={`mt-4 rounded-lg border p-3 text-sm ${isCorrectNow ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="mb-1 font-semibold text-slate-800">
                {isCorrectNow ? t({ en: "Correct", hi: "सही" }) : t({ en: "Not quite", hi: "बिल्कुल नहीं" })}
              </p>
              <p className="whitespace-pre-line text-slate-700">{t(q.explanation)}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <div className="flex gap-2">
              <button
                onClick={toggleMark}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  current.markedForReview ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"
                }`}
              >
                {current.markedForReview ? t({ en: "★ Marked", hi: "★ चिह्नित" }) : t({ en: "☆ Mark for review", hi: "☆ समीक्षा हेतु चिह्नित करें" })}
              </button>
              {current.selectedOptionId && !showAnswer && (
                <button onClick={clearAnswer} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
                  {t({ en: "Clear", hi: "साफ़ करें" })}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {index > 0 && (
                <button onClick={() => goTo(index - 1)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {t({ en: "Previous", hi: "पिछला" })}
                </button>
              )}
              {index < total - 1 ? (
                <button
                  onClick={() => goTo(index + 1)}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {t({ en: "Next", hi: "अगला" })}
                </button>
              ) : (
                <button
                  onClick={() => setConfirmSubmit(true)}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t({ en: "Submit", hi: "सबमिट करें" })}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Palette */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t({ en: "Question palette", hi: "प्रश्न पैलेट" })}
            </p>
            <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
              {questions.map((qq, i) => {
                const s = states[qq.id];
                const answered = s.selectedOptionId != null;
                const visited = s.visitCount > 0;
                let cls = "flex h-8 w-8 items-center justify-center rounded text-xs font-semibold border ";
                if (i === index) cls += "border-blue-600 ring-2 ring-blue-200 ";
                if (s.markedForReview) cls += "bg-amber-100 border-amber-400 text-amber-800";
                else if (answered) cls += "bg-green-100 border-green-400 text-green-800";
                else if (visited) cls += "bg-red-50 border-red-300 text-red-700";
                else cls += "bg-slate-50 border-slate-200 text-slate-500";
                return (
                  <button key={qq.id} onClick={() => goTo(i)} className={cls}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setConfirmSubmit(true)}
              className="mt-4 w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t({ en: "Submit now", hi: "अभी सबमिट करें" })}
            </button>
          </div>
        </div>
      </div>

      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-slate-900">
              {t({ en: "Submit your attempt?", hi: "अपना प्रयास सबमिट करें?" })}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {answeredCount}/{total} {t({ en: "answered.", hi: "उत्तरित।" })}{" "}
              {t({ en: "This cannot be undone.", hi: "इसे पूर्ववत नहीं किया जा सकता।" })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmSubmit(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
                {t({ en: "Keep going", hi: "जारी रखें" })}
              </button>
              <button
                onClick={handleFinish}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {t({ en: "Submit", hi: "सबमिट करें" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
