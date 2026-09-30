"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Question, QuestionOption, ResponseEvent, SECTION_LABEL, Section } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { ReportIssueButton } from "./ReportIssueButton";
import { UsefulDataModal } from "./UsefulDataModal";
import { ScientificCalculatorWidget } from "./ScientificCalculatorWidget";
import { EndTestDialog } from "./EndTestDialog";

// ---------------------------------------------------------------------------
// A faithful (not stylized) reproduction of the SSC/Railway-style CBT interface —
// the same question-palette color legend, the same three-button save discipline,
// and the same "an unsaved selection does not count" behaviour used across
// SSC, Railway and most NTA-run computer-based exams. This is deliberately more
// austere than a typical coaching-app UI: the point is that exam day should be
// the least unfamiliar part of the candidate's day.
//
// Verified against public descriptions of the SSC CGL CBT candidate interface
// and instruction pages (palette legend, Save & Next / Mark for Review & Next /
// Clear Response semantics, and the "not saved unless you click one of those"
// warning) rather than assumed from memory.
// ---------------------------------------------------------------------------

type SavedState = {
  selectedOptionId: QuestionOption["id"] | null; // the SAVED answer — this is what gets scored
  answerChangeCount: number;
  visitCount: number;
  markedForReview: boolean;
  timeSpentSeconds: number;
};

function emptyState(): SavedState {
  return { selectedOptionId: null, answerChangeCount: 0, visitCount: 0, markedForReview: false, timeSpentSeconds: 0 };
}

export type SscExamRunnerConfig = {
  questions: Question[];
  durationSeconds: number;
  candidateName: string;
  onFinish: (responses: ResponseEvent[], elapsedSeconds: number, returnToMenu?: boolean) => void;
  onExit?: () => void;
  initial?: Record<string, SavedState>;
  initialIndex?: number;
  onCheckpoint?: (state: Record<string, SavedState>, index: number) => void;
};

type PaletteState = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";

function paletteState(s: SavedState): PaletteState {
  if (s.visitCount === 0) return "not_visited";
  const answered = s.selectedOptionId != null;
  if (s.markedForReview) return answered ? "answered_marked" : "marked";
  return answered ? "answered" : "not_answered";
}

const PALETTE_COLOR: Record<PaletteState, string> = {
  not_visited: "bg-slate-100 border-slate-300 text-slate-600",
  not_answered: "bg-red-500 border-red-600 text-white",
  answered: "bg-green-600 border-green-700 text-white",
  marked: "bg-purple-500 border-purple-600 text-white",
  answered_marked: "bg-purple-500 border-purple-600 text-white",
};

export function SscExamRunner({
  questions,
  durationSeconds,
  candidateName,
  onFinish,
  onExit,
  initial,
  initialIndex = 0,
  onCheckpoint,
}: SscExamRunnerConfig) {
  const { t, lang, setLang } = useLang();
  const [index, setIndex] = useState(initialIndex);
  const [states, setStates] = useState<Record<string, SavedState>>(
    () => initial ?? Object.fromEntries(questions.map((q) => [q.id, emptyState()]))
  );
  // The current question's UNSAVED selection. Deliberately separate from `states` — an SSC/
  // Railway-style exam only counts an answer once Save & Next / Mark for Review & Next is
  // pressed; navigating away (palette click, even Submit) without one of those discards it.
  const [draft, setDraft] = useState<QuestionOption["id"] | null>(null);
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [showReview, setShowReview] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showUsefulData, setShowUsefulData] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showInExamInstructions, setShowInExamInstructions] = useState(false);
  const entryTimeRef = useRef<number>(0);
  const totalStartRef = useRef<number>(0);
  const finishedRef = useRef(false);

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

  const sections = useMemo(() => {
    const order: Section[] = [];
    for (const qq of questions) if (!order.includes(qq.section)) order.push(qq.section);
    return order;
  }, [questions]);

  // On entering a question: record the visit, sync the draft to whatever was last saved.
  useEffect(() => {
    entryTimeRef.current = Date.now();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDraft(statesRef.current[q.id]?.selectedOptionId ?? null);
      setStates((prev) => {
        const cur = prev[q.id];
        return { ...prev, [q.id]: { ...cur, visitCount: cur.visitCount + 1 } };
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const flushTime = useCallback((current: Record<string, SavedState>, forId: string): Record<string, SavedState> => {
    const elapsed = Math.round((Date.now() - entryTimeRef.current) / 1000);
    entryTimeRef.current = Date.now();
    const cur = current[forId];
    return { ...current, [forId]: { ...cur, timeSpentSeconds: cur.timeSpentSeconds + elapsed } };
  }, []);

  /** Palette / section-tab jump — intentionally does NOT commit the current draft. */
  function jumpTo(newIndex: number) {
    const flushed = flushTime(statesRef.current, questions[indexRef.current].id);
    setStates(flushed);
    onCheckpoint?.(flushed, newIndex);
    setIndex(newIndex);
  }

  function saveAndAdvance(mark: boolean) {
    const flushed = flushTime(statesRef.current, q.id);
    const cur = flushed[q.id];
    // Only a genuine change of a PREVIOUSLY SAVED answer counts — going from unanswered
    // (null) to a first answer is not a "change" and must not corrupt the diagnosis engine's
    // answerChangeCount signal (used to detect misreading/second-guessing).
    const changed = cur.selectedOptionId !== null && cur.selectedOptionId !== draft;
    const patched: Record<string, SavedState> = {
      ...flushed,
      [q.id]: {
        ...cur,
        selectedOptionId: draft,
        markedForReview: mark,
        answerChangeCount: changed ? cur.answerChangeCount + 1 : cur.answerChangeCount,
      },
    };
    setStates(patched);
    const nextIndex = Math.min(index + 1, total - 1);
    onCheckpoint?.(patched, nextIndex);
    if (index < total - 1) setIndex(nextIndex);
  }

  function clearResponse() {
    setDraft(null);
  }

  const handleFinish = useCallback((returnToMenu = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Only ever reads SAVED state — an unsaved draft on the current question at the moment of
    // submission is lost, exactly as it would be on the real exam. This is intentional realism,
    // not a bug: it's the single most-cited "gotcha" first-time CBT candidates report.
    const flushed = flushTime(statesRef.current, questions[indexRef.current].id);
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
        confidence: null,
        selectedOptionId: s.selectedOptionId,
        isCorrect: answered ? s.selectedOptionId === qq.correctOptionId : null,
      };
    });
    const elapsed = Math.round((Date.now() - totalStartRef.current) / 1000);
    onFinish(responses, elapsed, returnToMenu);
  }, [flushTime, onFinish, questions]);

  useEffect(() => {
    if (showInstructions) return;
    const id = setInterval(() => {
      setTimeLeft((tl) => {
        if (tl <= 1) {
          clearInterval(id);
          setTimeout(() => handleFinish(), 0);
          return 0;
        }
        return tl - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [showInstructions, handleFinish]);

  const mm = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const ss = (timeLeft % 60).toString().padStart(2, "0");

  const summary = useMemo(() => {
    const bySection: Record<
      string,
      { total: number; answered: number; notAnswered: number; marked: number; answeredMarked: number; notVisited: number }
    > = {};
    for (const sec of sections) bySection[sec] = { total: 0, answered: 0, notAnswered: 0, marked: 0, answeredMarked: 0, notVisited: 0 };
    for (const qq of questions) {
      const s = states[qq.id];
      const ps = paletteState(s);
      bySection[qq.section].total++;
      if (ps === "not_visited") bySection[qq.section].notVisited++;
      else if (ps === "not_answered") bySection[qq.section].notAnswered++;
      else if (ps === "marked") bySection[qq.section].marked++;
      else if (ps === "answered_marked") bySection[qq.section].answeredMarked++;
      else bySection[qq.section].answered++;
    }
    return bySection;
  }, [states, questions, sections]);

  if (showInstructions) {
    return (
      <InstructionsScreen
        onBegin={() => { totalStartRef.current = Date.now(); entryTimeRef.current = Date.now(); setShowInstructions(false); }}
        onExit={onExit}
        candidateName={candidateName}
        durationSeconds={durationSeconds}
        totalQuestions={total}
        sectionCount={sections.length}
        markingSummary={[...new Set(questions.map(question => `+${question.marks} / −${question.negativeMarks}`))].join("; ")}
      />
    );
  }

  if (showReview) {
    return (
      <ReviewSummaryScreen
        summary={summary}
        sections={sections}
        onBack={() => setShowReview(false)}
        onSubmit={handleFinish}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-slate-100">
      {ending && <EndTestDialog answered={Object.values(states).filter(s => s.selectedOptionId !== null).length} total={total} onCancel={() => setEnding(false)} onSubmit={handleFinish} warning={draft !== states[q.id]?.selectedOptionId ? "Your current selection is not saved. Continue the test and use Save & Next to include it." : undefined} />}
      <div className="flex justify-end border-b border-slate-200 bg-white px-4 py-1">
        <button type="button" onClick={() => setEnding(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">{t({ en: "End test", hi: "टेस्ट समाप्त करें" })}</button>
      </div>
      {/* Top exam bar — candidate + timer + language, matching the real CBT chrome. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold text-slate-800">
            {t({ en: "SSC CBT Examination Console", hi: "एसएससी सीबीटी परीक्षा कंसोल" })}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowInExamInstructions(true)}
              className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              ℹ️ {t({ en: "Instructions", hi: "निर्देश" })}
            </button>
            <button
              type="button"
              onClick={() => setShowUsefulData(true)}
              className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-100 shadow-2xs transition"
              title="Para 13.11: Table of IS 456:2000 Code of Practice & Steam Table"
            >
              📊 {t({ en: "Useful Data", hi: "उपयोगी डेटा" })}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            {t({ en: "View in:", hi: "भाषा:" })}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as "en" | "hi")}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
          </label>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t({ en: "Time Left", hi: "शेष समय" })}</p>
            <p className={`font-mono text-lg font-bold ${timeLeft < 120 ? "text-red-600" : "text-slate-900"}`} aria-live="polite">
              {mm}:{ss}
            </p>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-300 bg-slate-50 px-2 py-1.5">
        {sections.map((sec) => {
          const firstIdx = questions.findIndex((qq) => qq.section === sec);
          const active = q.section === sec;
          const secAnswered = questions.filter((qq) => qq.section === sec && states[qq.id].selectedOptionId != null).length;
          const secTotal = questions.filter((qq) => qq.section === sec).length;
          return (
            <button
              key={sec}
              onClick={() => jumpTo(firstIdx)}
              className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium ${
                active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t(SECTION_LABEL[sec])} <span className="opacity-70">({secAnswered}/{secTotal})</span>
            </button>
          );
        })}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_260px]">
        {/* Question panel */}
        <div className="flex flex-col rounded border border-slate-300 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
            <span>
              {t({ en: "Question No.", hi: "प्रश्न सं." })} <strong className="text-slate-800">{index + 1}</strong>
            </span>
            <span>
              {t({ en: "Marks for correct answer", hi: "सही उत्तर के अंक" })} <strong className="text-green-700">+{q.marks}</strong>
              {"   "}
              {t({ en: "Negative Marks", hi: "ऋणात्मक अंक" })} <strong className="text-red-600">−{q.negativeMarks}</strong>
            </span>
          </div>

          <div className="flex-1 px-5 py-5">
            <p className="text-base leading-relaxed text-slate-900" role="group" aria-label={t({ en: "Question", hi: "प्रश्न" })}>
              {t(q.text)}
            </p>

            <fieldset className="mt-6 flex flex-col gap-3">
              <legend className="sr-only">{t({ en: "Choose one answer", hi: "एक उत्तर चुनें" })}</legend>
              {q.options.map((opt, i) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 text-sm ${
                    draft === opt.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={draft === opt.id}
                    onChange={() => setDraft(opt.id)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="text-slate-800">
                    <span className="mr-1.5 text-slate-400">({i + 1})</span>
                    {t(opt.text)}
                  </span>
                </label>
              ))}
            </fieldset>

            <p className="mt-4 text-xs text-amber-700">
              {t({
                en: "⚠ Your answer is only saved when you click Save & Next or Mark for Review & Next below.",
                hi: "⚠ आपका उत्तर तभी सहेजा जाता है जब आप नीचे Save & Next या Mark for Review & Next पर क्लिक करते हैं।",
              })}
            </p>

            <div className="mt-3">
              <ReportIssueButton question={q} />
            </div>
          </div>

          {/* The authentic three-button row. */}
          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3">
            <button
              onClick={clearResponse}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t({ en: "Clear Response", hi: "उत्तर हटाएं" })}
            </button>
            <button
              onClick={() => saveAndAdvance(true)}
              className="rounded border border-purple-400 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100"
            >
              {t({ en: "Mark for Review & Next", hi: "समीक्षा हेतु चिह्नित करें और आगे" })}
            </button>
            <button
              onClick={() => jumpTo(Math.max(0, index - 1))}
              disabled={index === 0}
              className="ml-auto rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {t({ en: "← Previous", hi: "← पिछला" })}
            </button>
            <button
              onClick={() => saveAndAdvance(false)}
              className="rounded bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800"
            >
              {t({ en: "Save & Next", hi: "सहेजें और आगे" })}
            </button>
          </div>
        </div>

        {/* Candidate box + legend + palette */}
        <div className="flex flex-col gap-3">
          <div className="rounded border border-slate-300 bg-white p-3">
            <div className="flex items-center justify-between gap-2.5">
              {/* Scientific Calculator Icon to the left of candidate application image per Para 13.12 */}
              <button
                type="button"
                onClick={() => setShowCalculator((v) => !v)}
                className={`flex flex-col items-center justify-center rounded-lg border p-2 transition shadow-2xs ${
                  showCalculator
                    ? "border-blue-600 bg-blue-600 text-white ring-2 ring-blue-300"
                    : "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                }`}
                title="Para 13.12: On-screen Scientific Calculator available throughout exam"
              >
                <span className="text-base">🧮</span>
                <span className="text-[10px] font-bold tracking-tight">Calculator</span>
              </button>

              <div className="flex items-center gap-2.5 min-w-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800">{candidateName || t({ en: "Candidate", hi: "अभ्यर्थी" })}</p>
                  <p className="text-[10px] text-slate-500">Practice session</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-300 bg-white p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t({ en: "Legend", hi: "संकेत सूची" })}
            </p>
            <div className="grid grid-cols-1 gap-1 text-[11px]">
              <LegendRow color="bg-slate-100 border-slate-300" label={t({ en: "Not Visited", hi: "अदेखा" })} />
              <LegendRow color="bg-red-500 border-red-600" label={t({ en: "Not Answered", hi: "अनुत्तरित" })} />
              <LegendRow color="bg-green-600 border-green-700" label={t({ en: "Answered", hi: "उत्तरित" })} />
              <LegendRow color="bg-purple-500 border-purple-600" label={t({ en: "Marked for Review", hi: "समीक्षा हेतु चिह्नित" })} />
              <LegendRow color="bg-purple-500 border-purple-600" label={t({ en: "Answered & Marked", hi: "उत्तरित व चिह्नित" })} dot />
            </div>
          </div>

          <div className="rounded border border-slate-300 bg-white p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t({ en: "Question Palette", hi: "प्रश्न पैलेट" })} — {t(SECTION_LABEL[q.section])}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((qq, i) => {
                if (qq.section !== q.section) return null;
                const s = states[qq.id];
                const ps = paletteState(s);
                return (
                  <button
                    key={qq.id}
                    onClick={() => jumpTo(i)}
                    aria-current={i === index}
                    className={`relative flex h-8 w-8 items-center justify-center rounded text-[11px] font-semibold border ${PALETTE_COLOR[ps]} ${
                      i === index ? "ring-2 ring-offset-1 ring-blue-500" : ""
                    }`}
                  >
                    {i + 1}
                    {ps === "answered_marked" && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-green-400" />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowReview(true)}
              className="mt-4 w-full rounded bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {t({ en: "Submit Test", hi: "टेस्ट सबमिट करें" })}
            </button>
          </div>
        </div>
      </div>

      {/* Useful Data Modal (IS 456 / Steam Tables per Para 13.11) */}
      <UsefulDataModal isOpen={showUsefulData} onClose={() => setShowUsefulData(false)} />

      {/* Scientific Calculator Floating Widget (Para 13.12) */}
      <ScientificCalculatorWidget isOpen={showCalculator} onClose={() => setShowCalculator(false)} />

      {/* Instructions In-Exam Modal */}
      {showInExamInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="relative max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-xs text-slate-700 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900">{t({ en: "Examination Instructions", hi: "परीक्षा निर्देश" })}</h3>
              <button
                onClick={() => setShowInExamInstructions(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>
            <p>• {t({ en: "Save & Next saves the selected response and advances to next question.", hi: "Save & Next चुने गए उत्तर को सहेजता है और अगले प्रश्न पर ले जाता है।" })}</p>
            <p>• {t({ en: "Navigating away without Save & Next or Mark for Review does NOT save your selection.", hi: "Save & Next के बिना किसी अन्य प्रश्न पर जाने पर चयन सहेजा नहीं जाता है।" })}</p>
            <p>• {t({ en: "Para 13.11: Use 'Useful Data' for IS 456:2000 Code of Practice tables and Steam Tables.", hi: "पैरा 13.11: IS 456:2000 और स्टीम टेबल के लिए 'Useful Data' का उपयोग करें।" })}</p>
            <p>• {t({ en: "Para 13.12: Click the Calculator icon beside candidate box for the on-screen Scientific Calculator.", hi: "पैरा 13.12: ऑन-स्क्रीन वैज्ञानिक कैलकुलेटर के लिए अभ्यर्थी बॉक्स के बगल में कैलकुलेटर आइकन पर क्लिक करें।" })}</p>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowInExamInstructions(false)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 font-semibold text-white text-xs"
              >
                {t({ en: "Back to Test", hi: "परीक्षा पर वापस" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`relative h-4 w-4 shrink-0 rounded border ${color}`}>
        {dot && <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-white bg-green-400" />}
      </span>
      <span className="text-slate-600">{label}</span>
    </div>
  );
}

function InstructionsScreen({
  onBegin,
  onExit,
  candidateName,
  durationSeconds,
  totalQuestions,
  sectionCount,
  markingSummary,
}: {
  onBegin: () => void;
  onExit?: () => void;
  candidateName: string;
  durationSeconds: number;
  totalQuestions: number;
  sectionCount: number;
  markingSummary: string;
}) {
  const { t } = useLang();
  const [ack, setAck] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      {onExit && <button type="button" onClick={onExit} className="mb-4 self-start rounded-lg border border-slate-300 px-3 py-2 text-sm">← Back to menu</button>}
      <h1 className="text-lg font-bold text-slate-900">{t({ en: "General Instructions", hi: "सामान्य निर्देश" })}</h1>
      <p className="mt-1 text-xs text-slate-500">
        {t({ en: "Candidate", hi: "अभ्यर्थी" })}: <strong>{candidateName || t({ en: "Candidate", hi: "अभ्यर्थी" })}</strong>
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>
          {t({
            en: `You have ${Math.round(durationSeconds / 60)} minutes after you begin. The on-screen timer shows the remaining time. At zero, this practice test submits automatically. Use End test to finish earlier.`,
            hi: `शुरू करने के बाद आपके पास ${Math.round(durationSeconds / 60)} मिनट हैं। टाइमर शून्य होने पर अभ्यास स्वतः सबमिट होगा। पहले समाप्त करने के लिए टेस्ट समाप्त करें बटन दबाएँ।`,
          })}
        </li>
        <li>
          {t({
            en: "The Question Palette on the right shows the status of each question using colour: Not Visited (grey), Not Answered (red), Answered (green), Marked for Review (purple), and Answered & Marked for Review (purple with a green dot).",
            hi: "दाईं ओर प्रश्न पैलेट रंगों से प्रत्येक प्रश्न की स्थिति दिखाता है: अदेखा (धूसर), अनुत्तरित (लाल), उत्तरित (हरा), समीक्षा हेतु चिह्नित (बैंगनी), और उत्तरित व चिह्नित (हरे बिंदु के साथ बैंगनी)।",
          })}
        </li>
        <li className="font-medium text-amber-800">
          {t({
            en: "If you select an answer but navigate away without clicking Save & Next or Mark for Review & Next, that answer will NOT be saved.",
            hi: "यदि आप कोई उत्तर चुनते हैं परंतु Save & Next या Mark for Review & Next पर क्लिक किए बिना आगे बढ़ जाते हैं, तो वह उत्तर सहेजा नहीं जाएगा।",
          })}
        </li>
        <li>
          {t({
            en: "A question marked for review is still counted in the final evaluation if an answer was saved for it.",
            hi: "समीक्षा हेतु चिह्नित प्रश्न, यदि उसके लिए उत्तर सहेजा गया है, तो अंतिम मूल्यांकन में गिना जाता है।",
          })}
        </li>
        <li>
          {t({
            en: `This practice has ${totalQuestions} questions in ${sectionCount} section(s). Marking (correct / wrong): ${markingSummary}. The marks for each question are shown above it. Unattempted questions score 0.`,
            hi: `इस अभ्यास में ${sectionCount} खंडों में ${totalQuestions} प्रश्न हैं। अंक (सही / गलत): ${markingSummary}। प्रत्येक प्रश्न के अंक उसके ऊपर दिए हैं। अनुत्तरित प्रश्नों पर 0 अंक मिलते हैं।`,
          })}
        </li>
      </ol>

      <label className="mt-6 flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        {t({
          en: "I have read and understood the instructions. I am ready to begin the test.",
          hi: "मैंने निर्देश पढ़ और समझ लिए हैं। मैं परीक्षा शुरू करने के लिए तैयार हूं।",
        })}
      </label>

      <button
        onClick={onBegin}
        disabled={!ack}
        className="mt-6 w-full rounded bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-10"
      >
        {t({ en: "I am ready to begin", hi: "मैं शुरू करने के लिए तैयार हूं" })}
      </button>
    </div>
  );
}

function ReviewSummaryScreen({
  summary,
  sections,
  onBack,
  onSubmit,
}: {
  summary: Record<
    string,
    { total: number; answered: number; notAnswered: number; marked: number; answeredMarked: number; notVisited: number }
  >;
  sections: Section[];
  onBack: () => void;
  onSubmit: (returnToMenu: boolean) => void;
}) {
  const { t } = useLang();
  const [confirming, setConfirming] = useState(false);
  const totals = sections.reduce(
    (acc, s) => ({
      total: acc.total + summary[s].total,
      answered: acc.answered + summary[s].answered,
      notAnswered: acc.notAnswered + summary[s].notAnswered,
      marked: acc.marked + summary[s].marked,
      answeredMarked: acc.answeredMarked + summary[s].answeredMarked,
      notVisited: acc.notVisited + summary[s].notVisited,
    }),
    { total: 0, answered: 0, notAnswered: 0, marked: 0, answeredMarked: 0, notVisited: 0 }
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="text-lg font-bold text-slate-900">{t({ en: "Question Paper Summary", hi: "प्रश्न पत्र सारांश" })}</h1>
      <div className="mt-4 overflow-x-auto rounded border border-slate-300">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-100 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">{t({ en: "Section", hi: "खंड" })}</th>
              <th className="px-3 py-2 text-right font-semibold">{t({ en: "Total", hi: "कुल" })}</th>
              <th className="px-3 py-2 text-right font-semibold text-green-700">{t({ en: "Answered", hi: "उत्तरित" })}</th>
              <th className="px-3 py-2 text-right font-semibold text-red-600">{t({ en: "Not Answered", hi: "अनुत्तरित" })}</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">{t({ en: "Marked", hi: "चिह्नित" })}</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">
                {t({ en: "Answered & Marked", hi: "उत्तरित व चिह्नित" })}
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-500">{t({ en: "Not Visited", hi: "अदेखा" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sections.map((s) => (
              <tr key={s}>
                <td className="px-3 py-2 font-medium text-slate-800">{t(SECTION_LABEL[s])}</td>
                <td className="px-3 py-2 text-right">{summary[s].total}</td>
                <td className="px-3 py-2 text-right">{summary[s].answered}</td>
                <td className="px-3 py-2 text-right">{summary[s].notAnswered}</td>
                <td className="px-3 py-2 text-right">{summary[s].marked}</td>
                <td className="px-3 py-2 text-right">{summary[s].answeredMarked}</td>
                <td className="px-3 py-2 text-right">{summary[s].notVisited}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2">{t({ en: "Total", hi: "कुल" })}</td>
              <td className="px-3 py-2 text-right">{totals.total}</td>
              <td className="px-3 py-2 text-right">{totals.answered}</td>
              <td className="px-3 py-2 text-right">{totals.notAnswered}</td>
              <td className="px-3 py-2 text-right">{totals.marked}</td>
              <td className="px-3 py-2 text-right">{totals.answeredMarked}</td>
              <td className="px-3 py-2 text-right">{totals.notVisited}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {t({
          en: "Both \"Answered\" and \"Answered & Marked\" are counted in the final evaluation.",
          hi: "\"उत्तरित\" और \"उत्तरित व चिह्नित\" दोनों अंतिम मूल्यांकन में गिने जाते हैं।",
        })}
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button onClick={onBack} className="rounded border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          {t({ en: "← Go Back to Test", hi: "← टेस्ट पर वापस जाएं" })}
        </button>
        <button onClick={() => setConfirming(true)} className="rounded bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800">
          {t({ en: "Submit Test", hi: "टेस्ट सबमिट करें" })}
        </button>
      </div>

      {confirming && (
        <EndTestDialog answered={totals.answered + totals.answeredMarked} total={totals.total} onCancel={() => setConfirming(false)} onSubmit={onSubmit} />
      )}
    </div>
  );
}
