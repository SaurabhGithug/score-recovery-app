"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@/lib/user-context";
import { formatSeconds, madeEasyReady, type MadeEasyQuestionWithTest, type MadeEasyTestDetail } from "@/lib/madeeasy";
import { getMadeEasyTest, loadDrillProgress, saveDrillProgress, MadeEasyRequestError, type DrillProgressEntry } from "@/components/madeeasy/api";
import { AskFollowUp } from "@/components/ai/AskFollowUp";
import { SourceHtml } from "@/components/madeeasy/SourceHtml";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";

/** The question as the portal showed it (HTML with its images) when recaptured, else the saved text. */
function QuestionBody({ question, className }: { question: MadeEasyQuestionWithTest; className: string }) {
  return question.questionHtml
    ? <SourceHtml html={question.questionHtml} className={className} />
    : <p className={`whitespace-pre-line ${className}`}>{question.question || "The question text was not captured."}</p>;
}

function OptionBody({ question, index }: { question: MadeEasyQuestionWithTest; index: number }) {
  const html = question.optionsHtml?.[index];
  return html ? <SourceHtml html={html} className="min-w-0 flex-1" /> : <span className="leading-5">{question.options[index].text}</span>;
}

type ResultFilter = "all" | "incorrect" | "unattempted" | "needs_source";

function optionClass(optionId: string, question: MadeEasyQuestionWithTest, selected: string | null, revealed: boolean) {
  if (!revealed) {
    return selected === optionId ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40";
  }
  if (optionId === question.correctOption) return "border-emerald-500 bg-emerald-50 text-emerald-950";
  if (optionId === selected) return "border-rose-400 bg-rose-50 text-rose-900";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

const NOT_READY =
  "Part of this question (a table, figure, formula or the option text) was an image that was not captured. It needs to be recaptured from Made Easy before you can practise it; nothing is made up in the meantime.";

/** One Made Easy test on its own page: its result, its saved questions, and a practice drill of the ready ones. */
export default function MadeEasyTestPage() {
  const { code } = useParams<{ code: string }>();
  const { currentUser, isLoading, openProfileModal } = useUser();
  const [detail, setDetail] = useState<MadeEasyTestDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let live = true;
    getMadeEasyTest(code).then(
      (d) => { if (live) setDetail(d); },
      (err) => { if (live) setError({ status: err instanceof MadeEasyRequestError ? err.status : 0, message: err instanceof Error ? err.message : String(err) }); }
    );
    return () => { live = false; };
  }, [code, currentUser]);

  if (isLoading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!currentUser) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Choose Reema or Saurabh to open your Made Easy tests.</p>
        <button type="button" onClick={openProfileModal} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Choose profile</button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm font-medium text-slate-700">{error.status === 403 ? "These Made Easy results belong to another account." : error.message}</p>
        <Link href="/papers" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline">Back to tests</Link>
      </div>
    );
  }
  if (!detail) return <p className="p-6 text-sm text-slate-500">Loading this test…</p>;
  return <TestView key={detail.test.code} detail={detail} userId={currentUser.id} />;
}

function TestView({ detail, userId }: { detail: MadeEasyTestDetail; userId: string }) {
  const { test, questions } = detail;
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [focus, setFocus] = useState<"answer" | "teach" | null>(() => {
    const id = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("question") : null;
    return id && questions.some(q => q.id === id) ? "answer" : null;
  });
  const [reviewIndex, setReviewIndex] = useState(() => {
    const id = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("question") : null;
    return Math.max(0, questions.findIndex(q => q.id === id));
  });
  const [progress, setProgress] = useState<Record<string, DrillProgressEntry>>(() => (typeof window === "undefined" ? {} : loadDrillProgress(userId)));
  const [drill, setDrill] = useState<{ ids: string[]; index: number } | null>(null);
  const [drillResumeIndex, setDrillResumeIndex] = useState(0);

  const focused = Boolean(focus || drill);
  useDeclareAttemptMode(focused ? "focus" : null);
  const focusHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focused) { window.scrollTo(0, 0); focusHeading.current?.focus(); }
  }, [focused]);

  const ready = useMemo(() => questions.filter(madeEasyReady), [questions]);
  const shown = useMemo(
    () =>
      questions.filter((q) =>
        filter === "all" ? true : filter === "needs_source" ? !madeEasyReady(q) : q.status === filter
      ),
    [questions, filter]
  );
  const reviewQuestion = shown[reviewIndex] ?? null;

  function chooseFilter(value: ResultFilter) {
    setFilter(value);
    setReviewIndex(0);
    setFocus(null);
  }

  function moveReview(nextIndex: number) {
    setReviewIndex(Math.max(0, Math.min(nextIndex, shown.length - 1)));
  }

  function beginDrill(ids: string[], requestedIndex = 0) {
    if (!ids.length) return;
    const index = Math.max(0, Math.min(requestedIndex, ids.length - 1));
    setFocus(null);
    setDrill({ ids, index });
  }

  function leaveDrill() {
    if (drill) setDrillResumeIndex(drill.index);
    setDrill(null);
  }

  function advanceDrill(nextIndex: number) {
    if (!drill) return;
    if (nextIndex >= drill.ids.length) {
      setDrillResumeIndex(0);
      setDrill(null);
      return;
    }
    setDrillResumeIndex(nextIndex);
    setDrill({ ...drill, index: nextIndex });
  }

  function record(questionId: string, correct: boolean, seconds: number) {
    setProgress((current) => {
      const previous = current[questionId];
      const next = {
        ...current,
        [questionId]: {
          attempts: (previous?.attempts ?? 0) + 1,
          correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
          bestCorrectSeconds: correct ? Math.min(previous?.bestCorrectSeconds ?? Infinity, seconds) : previous?.bestCorrectSeconds ?? null,
          lastAttemptedAt: new Date().toISOString(),
        },
      };
      saveDrillProgress(userId, next);
      return next;
    });
  }

  const chips: { value: ResultFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: questions.length },
    { value: "incorrect", label: "Incorrect", count: test.counts.incorrect },
    { value: "unattempted", label: "Unattempted", count: test.counts.unattempted },
    { value: "needs_source", label: "Need the source", count: test.counts.needsSource },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      {!focused && <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <Link href="/recovery-lab" className="text-xs font-semibold text-blue-700">← All Made Easy tests</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{detail.provider} · {test.code.replace("test-", "Test ")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{test.title}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" disabled={!ready.length} onClick={() => beginDrill(ready.map((q) => q.id), drillResumeIndex)} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {drillResumeIndex > 0 ? `Continue from question ${drillResumeIndex + 1} →` : `Practise the ${ready.length} ready questions →`}
            </button>
            <a href={detail.portalUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-600 underline">Open on Made Easy ↗</a>
          </div>
        </div>
      </section>}

      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        {focused && <div className="mb-4 flex items-center justify-between gap-3">
          <h1 ref={focusHeading} tabIndex={-1} className="text-sm font-bold text-slate-700 outline-none">Focus mode · {drill ? "Practise" : focus === "teach" ? "Teach me" : "Answer & explanation"}</h1>
          <button type="button" onClick={() => { leaveDrill(); setFocus(null); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Exit focus</button>
        </div>}
        {drill ? (
          <Drill
            key={drill.ids[drill.index]}
            question={questions.find((q) => q.id === drill.ids[drill.index])!}
            position={drill.index + 1}
            total={drill.ids.length}
            onAnswered={record}
            onNext={() => advanceDrill(drill.index + 1)}
          />
        ) : (
          <>
            {!focused && <div className="flex flex-wrap gap-2" role="group" aria-label="Show questions">
              {chips.map((chip) => (
                <button key={chip.value} type="button" aria-pressed={filter === chip.value} onClick={() => chooseFilter(chip.value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === chip.value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
                  {chip.label} ({chip.count})
                </button>
              ))}
            </div>}
            {!focused && <p className="mt-3 text-xs text-slate-500">Most important first: wrong answers before unanswered ones, then slow answers and questions with a trap option.</p>}
            {!focused && shown.length > 0 ? (
              <ol aria-label="Questions in this group" className="mt-4 space-y-3">
                {shown.map((question, index) => (
                  <li key={question.id}>
                    <QuestionCard
                      question={question}
                      mode={null}
                      onMode={(mode) => { setReviewIndex(index); setFocus(mode); }}
                      onPractise={() => { setReviewIndex(index); beginDrill([question.id]); }}
                    />
                  </li>
                ))}
              </ol>
            ) : reviewQuestion && focused ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                  <span>Question {reviewIndex + 1} of {shown.length}</span>
                  <span>Only one question is shown at a time</span>
                </div>
                <QuestionCard
                  key={reviewQuestion.id}
                  question={reviewQuestion}
                  mode={focus}
                  onMode={setFocus}
                  onPractise={() => beginDrill([reviewQuestion.id])}
                />
                <nav aria-label="Review questions" className="flex items-center justify-between gap-3">
                  <button type="button" disabled={reviewIndex === 0} onClick={() => moveReview(reviewIndex - 1)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">← Previous</button>
                  <button type="button" disabled={reviewIndex >= shown.length - 1} onClick={() => moveReview(reviewIndex + 1)} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Next question →</button>
                </nav>
              </div>
            ) : <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">No questions in this group.</p>}
          </>
        )}
      </main>
    </div>
  );
}

function QuestionCard({ question, mode, onMode, onPractise }: {
  question: MadeEasyQuestionWithTest;
  mode: "answer" | "teach" | null;
  onMode: (mode: "answer" | "teach") => void;
  onPractise: () => void;
}) {
  const ready = madeEasyReady(question);
  const teaching = mode === "teach";
  const expanded = mode === "answer";
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="text-slate-500">Q{question.number}</span>
          <span className={question.status === "incorrect" ? "rounded-md bg-rose-100 px-2 py-1 text-rose-800" : "rounded-md bg-amber-100 px-2 py-1 text-amber-800"}>{question.status === "incorrect" ? "Incorrect" : "Unattempted"}</span>
          {!ready && <span className="rounded-md bg-slate-200 px-2 py-1 text-slate-700">Needs the source</span>}
        </div>
        <QuestionBody question={question} className="mt-3 text-sm font-bold leading-6 text-slate-900 sm:text-base" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onMode("answer")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">See answer and explanation</button>
          {ready && <button type="button" aria-expanded={teaching} onClick={() => onMode("teach")} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-100">Teach me</button>}
          {ready && <button type="button" onClick={onPractise} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Practise</button>}
        </div>
      </div>
      {teaching && ready && <TeachMe question={question} onPractise={onPractise} />}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
          {ready ? <AnswerAndExplanation question={question} selected={question.selectedOption} /> : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <p className="font-black">Not ready for practice yet</p>
              <p className="mt-1">{NOT_READY}</p>
            </div>
          )}
          <AskFollowUp kind="made_easy" id={question.id} />
        </div>
      )}
    </article>
  );
}

/** A syllabus-scoped lesson with worked concepts, exam facts and retrieval practice. */
function TeachMe({ question, onPractise }: { question: MadeEasyQuestionWithTest; onPractise: () => void }) {
  return <section aria-label="Teach this question" className="border-t border-violet-200 bg-violet-50/50 p-4 sm:p-5">
    <h2 className="font-bold text-slate-950">What would you like to learn?</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">Choose a suggestion or ask your own question. The tutor will stay within this exam and syllabus topic.</p>
    <AskFollowUp key={question.id} kind="made_easy" id={question.id} lesson />
    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Compare with the source explanation</summary>
      <div className="mt-3"><AnswerAndExplanation question={question} selected={question.selectedOption} /></div>
    </details>
    <button type="button" onClick={onPractise} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Try the original question without help →</button>
  </section>;
}

/** The options with the key and the learner's choice marked, then the portal's own explanation. */
function AnswerAndExplanation({ question, selected, selectedLabel = "Your original answer" }: { question: MadeEasyQuestionWithTest; selected: string | null; selectedLabel?: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        {question.options.map((option, i) => (
          <div key={option.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${option.id === question.correctOption ? "border-emerald-300 bg-emerald-50" : option.id === selected ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
            <span className="font-black">{option.id}.</span>
            <OptionBody question={question} index={i} />
            {option.id === question.correctOption && <span className="shrink-0 text-xs font-bold text-emerald-700">Correct</span>}
            {option.id === selected && option.id !== question.correctOption && <span className="shrink-0 text-xs font-bold text-rose-700">{selectedLabel}</span>}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-blue-800">Made Easy explanation</p>
        {question.explanationHtml
          ? <SourceHtml html={question.explanationHtml} className="mt-2 text-sm leading-6 text-blue-950" />
          : <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">{question.explanation || "Made Easy gave no explanation for this question."}</p>}
        {(question.deceptiveChoice || question.popularChoice) && (
          <div className="mt-3 border-t border-blue-200 pt-3 text-xs leading-5 text-blue-900">
            {question.deceptiveChoice && <p><b>Misleading option:</b> {question.deceptiveChoice}</p>}
            {question.popularChoice && <p><b>Most chosen option:</b> {question.popularChoice}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Drill({ question, position, total, onAnswered, onNext }: {
  question: MadeEasyQuestionWithTest;
  position: number;
  total: number;
  onAnswered: (questionId: string, correct: boolean, seconds: number) => void;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [revealed, startedAt]);

  function check() {
    if (!selected || revealed) return;
    const final = Math.max(1, seconds);
    setSeconds(final);
    setRevealed(true);
    onAnswered(question.id, selected === question.correctOption, final);
    fetch("/api/made-easy/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: question.id, selected, seconds: final }) })
      .then(res => { if (!res.ok) setSaveError(true); }, () => setSaveError(true));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 text-xs font-bold">
        <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-800">Q{question.number} · {position} of {total}</span>
        <span className="font-mono text-xl font-black text-slate-900">{formatSeconds(seconds)}</span>
      </div>
      {saveError && <p role="alert" className="mt-2 text-xs text-amber-800">Saved on this device, but could not sync this attempt to syllabus analysis.</p>}
      <QuestionBody question={question} className="mt-6 text-base font-semibold leading-7 text-slate-900 sm:text-lg" />
      {!revealed ? (
        <>
          <div className="mt-5 grid gap-2.5">
            {question.options.map((option, i) => (
              <button type="button" key={option.id} onClick={() => setSelected(option.id)} className={`flex items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition ${optionClass(option.id, question, selected, false)}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-black">{option.id}</span>
                <span className="min-w-0 flex-1 pt-0.5"><OptionBody question={question} index={i} /></span>
              </button>
            ))}
          </div>
          <button type="button" disabled={!selected} onClick={check} className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto">Check answer</button>
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <div className={`rounded-xl border p-4 ${selected === question.correctOption ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
            <p className="text-sm font-black">{selected === question.correctOption ? "Correct" : `Not quite: the answer is ${question.correctOption}`}</p>
          </div>
          <AnswerAndExplanation question={question} selected={selected} selectedLabel="Your answer" />
          <AskFollowUp kind="made_easy" id={question.id} />
          <button type="button" onClick={onNext} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">{position >= total ? "Finish" : "Next question →"}</button>
        </div>
      )}
    </section>
  );
}
