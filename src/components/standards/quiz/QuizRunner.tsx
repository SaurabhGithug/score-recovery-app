"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";
import { AiGeneratedBadge } from "@/components/ai/AiGeneratedBadge";
import type { AnswerState, AttemptView, OptionId, ResultView } from "@/lib/standards/quiz-types";
import { formatClock, quizApi, QuizApiError, type ClockAnchor } from "./api";

const SAVE_DEBOUNCE_MS = 1500;
const SAVE_EVERY_MS = 10_000;
const TICK_MS = 250;
const KEY_TO_OPTION: Record<string, OptionId> = { A: "A", B: "B", C: "C", D: "D", "1": "A", "2": "B", "3": "C", "4": "D" };

type Phase = "running" | "submitting" | "timeup" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function QuizRunner({ attempt, anchor, onFinished }: { attempt: AttemptView; anchor: ClockAnchor; onFinished: (result: ResultView) => void }) {
  const { t } = useLang();
  useDeclareAttemptMode("exam");
  const questions = attempt.questions;
  const total = questions.length;
  const deadlineMs = Date.parse(attempt.deadlineAt);

  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, AnswerState>>(attempt.responses);
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((deadlineMs - Date.parse(attempt.serverNow)) / 1000)));
  const [phase, setPhase] = useState<Phase>("running");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const responsesRef = useRef(attempt.responses);
  const secondsRef = useRef<Record<string, number>>({});
  const activeRef = useRef<{ id: string; since: number | null }>({ id: questions[0]?.id ?? "", since: null });
  const anchorRef = useRef(anchor);
  const finishedRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const announcedRef = useRef(new Set<number>());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);

  const locked = phase !== "running";
  const q = questions[index];
  const answeredCount = questions.filter((x) => responses[x.id]?.answer).length;
  const markedCount = questions.filter((x) => responses[x.id]?.marked).length;
  const lowTime = remaining <= 60;
  const amber = !lowTime && remaining <= attempt.limitSeconds * 0.2;

  // ------------------------------------------------------------ clock (absolute, never accumulated)
  function serverNowMs(): number {
    const a = anchorRef.current;
    // Wall clock covers a sleeping laptop; the monotonic clock covers the user changing the system time.
    return a.serverMs + Math.max(performance.now() - a.perf, Date.now() - a.date);
  }

  const milestones = (): { at: number; text: string }[] => {
    const list = [
      { at: Math.floor(attempt.limitSeconds / 2), text: t({ en: `Half of your time is gone. ${formatClock(attempt.limitSeconds / 2)} left.`, hi: `आधा समय बीत गया। ${formatClock(attempt.limitSeconds / 2)} बचे हैं।` }) },
      { at: 600, text: t({ en: "10 minutes left.", hi: "10 मिनट बचे हैं।" }) },
      { at: 300, text: t({ en: "5 minutes left.", hi: "5 मिनट बचे हैं।" }) },
      { at: 60, text: t({ en: "1 minute left.", hi: "1 मिनट बचा है।" }) },
      { at: 30, text: t({ en: "30 seconds left.", hi: "30 सेकंड बचे हैं।" }) },
    ];
    const fixed = list.slice(1).filter((m) => m.at < attempt.limitSeconds);
    // "Halfway" is skipped when it would land within 5 s of a fixed milestone (e.g. a 70 s test).
    return list[0].at > 0 && fixed.every((m) => Math.abs(m.at - list[0].at) > 5) ? [list[0], ...fixed] : fixed;
  };

  // ------------------------------------------------------------ seconds on each question (only while visible)
  function flushSeconds() {
    const a = activeRef.current;
    if (a.since === null || !a.id) return;
    const now = performance.now();
    secondsRef.current[a.id] = (secondsRef.current[a.id] ?? responsesRef.current[a.id]?.seconds ?? 0) + (now - a.since) / 1000;
    a.since = now;
  }

  function payload(): Record<string, AnswerState> {
    flushSeconds();
    const out: Record<string, AnswerState> = {};
    for (const x of questions) {
      const r = responsesRef.current[x.id];
      const seconds = Math.round(secondsRef.current[x.id] ?? r?.seconds ?? 0);
      if (!r && seconds === 0) continue;
      out[x.id] = { answer: r?.answer ?? null, marked: r?.marked ?? false, seconds };
    }
    return out;
  }

  // ------------------------------------------------------------ saving
  async function saveNow() {
    if (finishedRef.current) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    const t0 = Date.now();
    const p0 = performance.now();
    try {
      const res = await quizApi.save(attempt.id, payload());
      anchorRef.current = { serverMs: Date.parse(res.serverNow), perf: (p0 + performance.now()) / 2, date: (t0 + Date.now()) / 2 };
      setSaveState("saved");
    } catch (err) {
      if (err instanceof QuizApiError && err.status === 409) {
        // Time is up or the test was finished elsewhere: submitting returns the stored or final result.
        savingRef.current = false;
        void submit(true);
        return;
      }
      setSaveState("error");
    } finally {
      savingRef.current = false;
    }
    if (queuedRef.current) {
      queuedRef.current = false;
      void saveNow();
    }
  }

  function scheduleSave() {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
  }

  async function submit(auto: boolean) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    window.clearTimeout(debounceRef.current);
    setConfirmOpen(false);
    setSubmitError("");
    setPhase(auto ? "timeup" : "submitting");
    const body = payload();
    for (let tries = 0; ; tries++) {
      try {
        onFinished(await quizApi.submit(attempt.id, body, auto));
        return;
      } catch (err) {
        const status = err instanceof QuizApiError ? err.status : 0;
        if ((status === 0 || status >= 500) && tries < 5) {
          await sleep(1500 * (tries + 1));
          continue;
        }
        setSubmitError(err instanceof Error ? err.message : t({ en: "Could not submit.", hi: "जमा नहीं हो सका।" }));
        finishedRef.current = false;
        // Before the deadline the learner can keep working; after it only "try again" makes sense.
        setPhase(auto ? "error" : "running");
        return;
      }
    }
  }

  // ------------------------------------------------------------ answering
  function update(id: string, patch: Partial<AnswerState>) {
    if (locked) return;
    const cur = responsesRef.current[id] ?? { answer: null, marked: false, seconds: 0 };
    const next = { ...responsesRef.current, [id]: { ...cur, ...patch } };
    responsesRef.current = next;
    setResponses(next);
    scheduleSave();
  }

  function goTo(i: number) {
    const target = Math.max(0, Math.min(total - 1, i));
    if (target === index) return;
    flushSeconds();
    activeRef.current = { id: questions[target].id, since: document.visibilityState === "visible" ? performance.now() : null };
    setIndex(target);
    setPaletteOpen(false);
    questionHeadingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------ effects
  const onTick = useEffectEvent(() => {
    const ms = deadlineMs - serverNowMs();
    const sec = Math.max(0, Math.ceil(ms / 1000));
    setRemaining(sec);
    for (const m of milestones()) {
      if (sec <= m.at && !announcedRef.current.has(m.at)) {
        announcedRef.current.add(m.at);
        if (sec > m.at - 5) setAnnouncement(m.text);
      }
    }
    if (ms <= 0 && !finishedRef.current) void submit(true);
  });
  const onAutosave = useEffectEvent(() => void saveNow());
  const onVisibility = useEffectEvent(() => {
    if (document.visibilityState === "hidden") {
      flushSeconds();
      activeRef.current.since = null;
      if (!finishedRef.current) quizApi.saveOnExit(attempt.id, payload());
    } else {
      activeRef.current.since = performance.now();
      onTick();
      void saveNow(); // also re-reads the server clock after a sleep
    }
  });
  const onPageHide = useEffectEvent(() => {
    if (!finishedRef.current) quizApi.saveOnExit(attempt.id, payload());
  });
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (locked || !q || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (el && (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el instanceof HTMLInputElement && el.type !== "radio"))) return;
    if (document.querySelector("dialog[open]")) return;
    const opt = KEY_TO_OPTION[e.key.toUpperCase()];
    if (opt && q.options.some((o) => o.id === opt)) {
      e.preventDefault();
      update(q.id, { answer: opt });
    }
  });

  useEffect(() => {
    activeRef.current.since = document.visibilityState === "visible" ? performance.now() : null;
    // Milestones already behind us (a resumed test) are not announced again.
    const startSec = Math.ceil((deadlineMs - serverNowMs()) / 1000);
    for (const m of milestones()) if (startSec <= m.at) announcedRef.current.add(m.at);
    const tick = window.setInterval(() => onTick(), TICK_MS);
    const autosave = window.setInterval(() => onAutosave(), SAVE_EVERY_MS);
    const visibility = () => onVisibility();
    const pagehide = () => onPageHide();
    const online = () => onAutosave();
    const keydown = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("online", online);
    window.addEventListener("keydown", keydown);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(autosave);
      window.clearTimeout(debounceRef.current);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("online", online);
      window.removeEventListener("keydown", keydown);
    };
    // Mount-only: the handlers above are effect events and always see current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the page mid-test asks first (answers are saved, but the clock keeps running).
  useEffect(() => {
    if (phase === "error") return;
    const warn = (e: BeforeUnloadEvent) => {
      if (finishedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (confirmOpen && !d.open) d.showModal();
    if (!confirmOpen && d.open) d.close();
  }, [confirmOpen]);

  if (!q) return <p className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">{t({ en: "This test has no questions.", hi: "इस टेस्ट में कोई प्रश्न नहीं है।" })}</p>;

  const r = responses[q.id];
  const timerTone = lowTime ? "bg-rose-600 text-white motion-safe:animate-pulse" : amber ? "bg-amber-100 text-amber-950 ring-1 ring-amber-400" : "bg-slate-100 text-slate-900";
  const timerIcon = lowTime ? "⚠" : amber ? "⏳" : "⏱";

  return (
    <main className="mx-auto w-full max-w-5xl px-3 pb-28 sm:px-4 lg:pb-8">
      {/* Sticky exam bar */}
      <div className="sticky top-0 z-20 -mx-3 border-b border-slate-200 bg-white/95 px-3 pb-2 pt-2 shadow-sm backdrop-blur sm:mx-0 sm:mt-3 sm:rounded-xl sm:border">
        <div className="flex items-center justify-between gap-2">
          <div role="timer" aria-label={t({ en: "Time left", hi: "बचा हुआ समय" })} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-2xl font-bold tabular-nums sm:text-3xl ${timerTone}`}>
            <span aria-hidden="true" className="text-base sm:text-lg">{timerIcon}</span>
            {formatClock(remaining)}
          </div>
          <div className="min-w-0 flex-1 text-xs leading-5 text-slate-600 sm:text-sm">
            <p className="font-semibold text-slate-800">{t({ en: `Question ${index + 1} of ${total}`, hi: `प्रश्न ${index + 1} / ${total}` })}</p>
            <p>
              {t({ en: `${answeredCount} answered`, hi: `${answeredCount} उत्तर दिए` })}
              {markedCount > 0 && <> · {t({ en: `${markedCount} marked`, hi: `${markedCount} चिह्नित` })}</>}
              <SaveBadge state={saveState} />
            </p>
          </div>
          <button type="button" disabled={locked} onClick={() => setConfirmOpen(true)} className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50 sm:px-4">
            {t({ en: "Submit", hi: "जमा करें" })}
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-full rounded-full bg-blue-600 transition-[width] motion-reduce:transition-none" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
        </div>
      </div>
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {phase === "timeup" && <p role="status" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{t({ en: "Time's up – submitting your answers…", hi: "समय समाप्त – आपके उत्तर जमा हो रहे हैं…" })}</p>}
      {phase === "submitting" && <p role="status" className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">{t({ en: "Submitting…", hi: "जमा हो रहा है…" })}</p>}
      {submitError && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="min-w-0 flex-1">{t({ en: `Could not submit: ${submitError}`, hi: `जमा नहीं हो सका: ${submitError}` })}</span>
          <button type="button" onClick={() => void submit(phase === "error")} className="min-h-11 rounded-lg bg-rose-700 px-4 font-semibold text-white">{t({ en: "Try again", hi: "फिर कोशिश करें" })}</button>
        </div>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-labelledby="quiz-q-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="quiz-q-heading" ref={questionHeadingRef} tabIndex={-1} className="text-sm font-bold text-slate-500 outline-none">
              {t({ en: `Question ${index + 1}`, hi: `प्रश्न ${index + 1}` })}
              {r?.marked && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">⚑ {t({ en: "Marked for review", hi: "समीक्षा हेतु चिह्नित" })}</span>}
            </h2>
            <AiGeneratedBadge />
          </div>

          <fieldset key={q.id} disabled={locked} className="mt-3 min-w-0">
            <legend className="mb-4 block w-full whitespace-pre-wrap break-words text-base font-semibold leading-7 text-slate-900">{q.stem}</legend>
            <div className="space-y-2.5">
              {q.options.map((o) => {
                const selected = r?.answer === o.id;
                return (
                  <label
                    key={o.id}
                    className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-blue-600 has-[input:disabled]:cursor-not-allowed motion-reduce:transition-none ${selected ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-400"}`}
                  >
                    <input type="radio" name={`quiz-${q.id}`} value={o.id} checked={selected} onChange={() => update(q.id, { answer: o.id })} className="sr-only" />
                    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"}`}>{o.id}</span>
                    <span className="min-w-0 flex-1 break-words pt-1 text-sm leading-6 text-slate-800">{o.text}</span>
                    {selected && <span aria-hidden="true" className="pt-1 text-sm font-bold text-blue-700">✓</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">{t({ en: "Tip: press A–D or 1–4 to choose.", hi: "सुझाव: चुनने के लिए A–D या 1–4 दबाएँ।" })}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={locked} aria-pressed={r?.marked ?? false} onClick={() => update(q.id, { marked: !r?.marked })} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50 ${r?.marked ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 text-violet-800"}`}>
              ⚑ {r?.marked ? t({ en: "Marked for review", hi: "समीक्षा हेतु चिह्नित" }) : t({ en: "Mark for review", hi: "समीक्षा हेतु चिह्नित करें" })}
            </button>
            <button type="button" disabled={locked || !r?.answer} onClick={() => update(q.id, { answer: null })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">
              {t({ en: "Clear answer", hi: "उत्तर हटाएँ" })}
            </button>
          </div>

          <div className="mt-5 hidden justify-between gap-2 lg:flex">
            <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-40">← {t({ en: "Previous", hi: "पिछला" })}</button>
            {index < total - 1 ? (
              <button type="button" onClick={() => goTo(index + 1)} className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">{t({ en: "Next", hi: "अगला" })} →</button>
            ) : (
              <button type="button" disabled={locked} onClick={() => setConfirmOpen(true)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{t({ en: "Review and submit", hi: "देखें और जमा करें" })}</button>
            )}
          </div>
        </section>

        {/* Palette: side panel on wide screens, bottom sheet on phones */}
        <div className={paletteOpen ? "fixed inset-0 z-40 lg:static lg:z-auto" : "hidden lg:block"}>
          <button type="button" aria-label={t({ en: "Close question list", hi: "प्रश्न सूची बंद करें" })} onClick={() => setPaletteOpen(false)} className="absolute inset-0 bg-slate-900/40 lg:hidden" />
          <div id="quiz-palette" className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl lg:sticky lg:inset-auto lg:top-28 lg:max-h-none lg:rounded-xl lg:border lg:border-slate-200 lg:p-3 lg:shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">{t({ en: "Questions", hi: "प्रश्न" })}</h2>
              <button type="button" onClick={() => setPaletteOpen(false)} className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 lg:hidden">{t({ en: "Close", hi: "बंद करें" })}</button>
            </div>
            <ol className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
              {questions.map((x, i) => {
                const rx = responses[x.id];
                const answered = !!rx?.answer;
                const current = i === index;
                const state = [answered ? t({ en: "answered", hi: "उत्तरित" }) : t({ en: "not answered", hi: "अनुत्तरित" }), rx?.marked ? t({ en: "marked for review", hi: "समीक्षा हेतु चिह्नित" }) : ""].filter(Boolean).join(", ");
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={current ? "step" : undefined}
                      aria-label={t({ en: `Question ${i + 1}, ${state}`, hi: `प्रश्न ${i + 1}, ${state}` })}
                      className={`relative flex h-11 w-full items-center justify-center rounded-lg border text-sm font-semibold tabular-nums ${answered ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"} ${current ? "outline-3 outline-offset-2 outline-slate-900" : ""}`}
                    >
                      {i + 1}
                      {rx?.marked && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[9px] text-white">⚑</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 rounded border border-blue-600 bg-blue-600" />{t({ en: "Answered", hi: "उत्तरित" })}</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 rounded border border-slate-300 bg-white" />{t({ en: "Not answered", hi: "अनुत्तरित" })}</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[9px] text-white">⚑</span>{t({ en: "Marked for review", hi: "समीक्षा हेतु चिह्नित" })}</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 rounded outline-2 outline-offset-1 outline-slate-900" />{t({ en: "Current question", hi: "वर्तमान प्रश्न" })}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Phone action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)} className="min-h-12 flex-1 rounded-lg border border-slate-300 text-sm font-medium disabled:opacity-40">← {t({ en: "Prev", hi: "पिछला" })}</button>
          <button type="button" onClick={() => setPaletteOpen((o) => !o)} aria-expanded={paletteOpen} aria-controls="quiz-palette" className="min-h-12 flex-1 rounded-lg border border-slate-300 text-sm font-semibold tabular-nums text-slate-800">
            {index + 1}/{total} ▴
          </button>
          {index < total - 1 ? (
            <button type="button" onClick={() => goTo(index + 1)} className="min-h-12 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white">{t({ en: "Next", hi: "अगला" })} →</button>
          ) : (
            <button type="button" disabled={locked} onClick={() => setConfirmOpen(true)} className="min-h-12 flex-1 rounded-lg bg-blue-600 text-sm font-semibold text-white disabled:opacity-50">{t({ en: "Submit", hi: "जमा करें" })}</button>
          )}
        </div>
      </div>

      <dialog ref={dialogRef} aria-labelledby="quiz-submit-title" onClose={() => setConfirmOpen(false)} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50">
        <div className="p-5">
          <h2 id="quiz-submit-title" className="text-lg font-bold">{t({ en: "Submit the test?", hi: "टेस्ट जमा करें?" })}</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
            <li>{t({ en: `Answered: ${answeredCount} of ${total}`, hi: `उत्तर दिए: ${total} में से ${answeredCount}` })}</li>
            <li className={total - answeredCount ? "font-semibold text-amber-800" : ""}>{t({ en: `Unanswered: ${total - answeredCount}`, hi: `अनुत्तरित: ${total - answeredCount}` })}</li>
            <li className={markedCount ? "font-semibold text-violet-800" : ""}>⚑ {t({ en: `Marked for review: ${markedCount}`, hi: `समीक्षा हेतु चिह्नित: ${markedCount}` })}</li>
            <li>{t({ en: `Time left: ${formatClock(remaining)}`, hi: `बचा समय: ${formatClock(remaining)}` })}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">{t({ en: "You cannot change answers after submitting.", hi: "जमा करने के बाद उत्तर नहीं बदले जा सकते।" })}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium">{t({ en: "Keep working", hi: "जारी रखें" })}</button>
            <button type="button" onClick={() => void submit(false)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">{t({ en: "Submit now", hi: "अभी जमा करें" })}</button>
          </div>
        </div>
      </dialog>
    </main>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const { t } = useLang();
  if (state === "error") return <span className="ml-1.5 whitespace-nowrap font-semibold text-amber-700">· {t({ en: "Not saved – retrying", hi: "सहेजा नहीं गया – फिर कोशिश" })}</span>;
  if (state === "saving") return <span className="ml-1.5 whitespace-nowrap text-slate-400">· {t({ en: "Saving…", hi: "सहेज रहे हैं…" })}</span>;
  if (state === "saved") return <span className="ml-1.5 whitespace-nowrap text-slate-400">· {t({ en: "Saved", hi: "सहेजा गया" })}</span>;
  return null;
}
