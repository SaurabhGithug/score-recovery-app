"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BankAttempt,
  BankCheckResult,
  BankExplanation,
  BankPaperDetail,
  BankQuestionForAttempt,
  BankResponse,
  BankResponses,
} from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";
import { BankApiRequestError, checkAnswer, explainQuestion, saveResponses, submitAttempt } from "./api";
import { ExplanationBlock } from "./ReviewQuestion";
import { KeyProvenance } from "./KeyProvenance";
import { AskFollowUp } from "../ai/AskFollowUp";
import { EndTestDialog } from "../EndTestDialog";
import { ScientificCalculatorWidget } from "../ScientificCalculatorWidget";
import { displayLabel, displayOrder, imageLed, textReliable, type OptionLayout } from "./optionOrder";

const AUTOSAVE_MS = 15000;

function emptyResponse(): BankResponse {
  return { answer: null, seconds: 0, visits: 0, changes: 0, marked: false };
}

function withDefaults(questions: BankQuestionForAttempt[], initial: BankResponses): BankResponses {
  const out: BankResponses = {};
  for (const q of questions) {
    out[q.id] = initial[q.id] ? { ...initial[q.id] } : emptyResponse();
  }
  return out;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

type PaletteState = "unvisited" | "not-answered" | "answered" | "marked" | "answered-marked";

function paletteState(r: BankResponse | undefined): PaletteState {
  if (!r) return "unvisited";
  if (r.answer != null && r.marked) return "answered-marked";
  if (r.answer != null) return "answered";
  if (r.marked) return "marked";
  return r.visits > 0 ? "not-answered" : "unvisited";
}

const PALETTE_STYLE: Record<PaletteState, string> = {
  unvisited: "bg-white border-slate-300 text-slate-700",
  "not-answered": "bg-red-600 border-red-600 text-white",
  answered: "bg-emerald-600 border-emerald-600 text-white",
  marked: "bg-violet-600 border-violet-600 text-white",
  "answered-marked": "bg-violet-600 border-violet-600 text-white",
};

export function BankRunner({
  paper,
  attempt,
  initialResponses,
  initialLanguage = "en",
}: {
  paper: BankPaperDetail;
  attempt: BankAttempt;
  initialResponses: BankResponses;
  initialLanguage?: "en" | "hi";
}) {
  const router = useRouter();
  const { t } = useLang();
  useDeclareAttemptMode("exam");

  const questions = useMemo(() => {
    if (attempt.mode === "section" && attempt.section) {
      return paper.questions.filter((q) => q.section === attempt.section);
    }
    return paper.questions;
  }, [paper.questions, attempt.mode, attempt.section]);

  const sectionNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const q of questions) {
      if (!seen.has(q.section)) {
        seen.add(q.section);
        names.push(q.section);
      }
    }
    return names;
  }, [questions]);

  const [activeSection, setActiveSection] = useState<string>(sectionNames[0] ?? "");
  const visibleIds = useMemo(
    () => questions.filter((q) => sectionNames.length <= 1 || q.section === activeSection).map((q) => q.id),
    [questions, sectionNames, activeSection]
  );

  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<BankResponses>(() => withDefaults(questions, initialResponses));
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string | null>>(() => Object.fromEntries(questions.map((question) => [question.id, initialResponses[question.id]?.answer ?? null])));
  const [contentLang, setContentLang] = useState<"en" | "hi">(initialLanguage);
  const [viewOriginalOverride, setViewOriginalOverride] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, BankCheckResult>>({});
  const [restoreErrors, setRestoreErrors] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [imageStates, setImageStates] = useState<Record<string, "loaded" | "error">>({});
  const [imageRetry, setImageRetry] = useState(0);
  const mobilePalette = useRef<HTMLDetailsElement>(null);
  const imageViewer = useRef<HTMLDialogElement>(null);

  const anyHasHi = useMemo(() => questions.some((q) => q.translations?.hi), [questions]);

  const responsesRef = useRef(responses);
  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const submittedRef = useRef(false);
  const currentQuestionRef = useRef<string | null>(null);
  // 0 until the mount/navigation effect below stamps it — Date.now() is impure and must not
  // run during render, only inside an effect or event handler.
  const entryTimeRef = useRef<number>(0);

  const currentId = visibleIds[index];
  const q = questions.find((qq) => qq.id === currentId) ?? questions[0];
  const isPractice = attempt.mode === "practice";
  const imageUrl = q?.imageUrl;
  const rememberImage = useCallback((image: HTMLImageElement | null) => {
    // A cached image may finish before hydration attaches onLoad.
    if (imageUrl && image?.complete && image.naturalWidth > 0) {
      setImageStates(prev => prev[imageUrl] === "loaded" ? prev : { ...prev, [imageUrl]: "loaded" });
    }
  }, [imageUrl]);

  // Track visits + reset per-visit entry timer whenever the visible question changes. The
  // state update is deferred a microtask so it isn't a synchronous setState-during-effect.
  useEffect(() => {
    if (!q) return;
    currentQuestionRef.current = q.id;
    entryTimeRef.current = Date.now();
    const qId = q.id;
    queueMicrotask(() => {
      setResponses((prev) => {
        const cur = prev[qId] ?? emptyResponse();
        return { ...prev, [qId]: { ...cur, visits: cur.visits + 1 } };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const flushSeconds = useCallback((forId: string, source: BankResponses): BankResponses => {
    const elapsed = Math.round((Date.now() - entryTimeRef.current) / 1000);
    entryTimeRef.current = Date.now();
    if (elapsed <= 0) return source;
    const cur = source[forId] ?? emptyResponse();
    return { ...source, [forId]: { ...cur, seconds: cur.seconds + elapsed } };
  }, []);

  const doSave = useCallback(
    async (data: BankResponses) => {
      try {
        setSaveState("saving");
        await saveResponses(attempt.id, data);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [attempt.id]
  );

  // Autosave on an interval.
  useEffect(() => {
    if (attempt.submittedAt) return;
    const id = setInterval(() => {
      doSave(responsesRef.current);
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [doSave, attempt.submittedAt]);

  function goTo(newIndex: number) {
    if (!q) return;
    const flushed = flushSeconds(q.id, responsesRef.current);
    if (!isPractice) {
      setDraftAnswers((prev) => ({ ...prev, [q.id]: flushed[q.id]?.answer ?? null }));
    }
    responsesRef.current = flushed;
    setResponses(flushed);
    void doSave(flushed);
    setIndex(Math.max(0, Math.min(visibleIds.length - 1, newIndex)));
  }

  function switchSection(name: string) {
    if (!q) return;
    const flushed = flushSeconds(q.id, responsesRef.current);
    if (!isPractice) setDraftAnswers((prev) => ({ ...prev, [q.id]: flushed[q.id]?.answer ?? null }));
    responsesRef.current = flushed;
    setResponses(flushed);
    void doSave(flushed);
    setActiveSection(name);
    setIndex(0);
  }

  function selectOption(optionId: string | null) {
    if (!q) return;
    if (committedNow || checking || submitting) return;
    if (optionId !== null && (q.unavailable || (imageLed(q) && imageStates[q.imageUrl ?? ""] !== "loaded"))) return;
    if (!isPractice) {
      setDraftAnswers((prev) => ({ ...prev, [q.id]: optionId }));
      return;
    }
    const prev = responsesRef.current;
    const cur = prev[q.id] ?? emptyResponse();
    const changed = cur.answer !== null && cur.answer !== optionId;
    const next = { ...prev, [q.id]: { ...cur, answer: optionId, changes: changed ? cur.changes + 1 : cur.changes } };
    responsesRef.current = next;
    setResponses(next);
    if (optionId === null) void doSave(next);
  }

  function toggleMark() {
    if (!q) return;
    const prev = responsesRef.current;
    const cur = prev[q.id] ?? emptyResponse();
    const next = { ...prev, [q.id]: { ...cur, marked: !cur.marked } };
    responsesRef.current = next;
    setResponses(next);
    void doSave(next);
  }

  function saveAndAdvance(marked: boolean) {
    if (!q || checking || submitting) return;
    const source = responsesRef.current;
    const cur = source[q.id] ?? emptyResponse();
    const answer = draftAnswers[q.id] ?? null;
    const changed = cur.answer !== null && cur.answer !== answer;
    let next: BankResponses = {
      ...source,
      [q.id]: { ...cur, answer, marked, changes: changed ? cur.changes + 1 : cur.changes },
    };
    next = flushSeconds(q.id, next);
    responsesRef.current = next;
    setResponses(next);
    setDraftAnswers((prev) => ({ ...prev, [q.id]: answer }));
    void doSave(next);
    if (index < visibleIds.length - 1) setIndex(index + 1);
    else setConfirmSubmit(true);
  }

  // Answers checked before a reload are locked on the server (attempt.checkedQuestionIds).
  const committedIds = useMemo(() => new Set(attempt.checkedQuestionIds), [attempt.checkedQuestionIds]);
  const committedNow = q ? Boolean(checked[q.id]) || committedIds.has(q.id) : false;
  const orderedOptions = useMemo(() => {
    if (!q) return [];
    return displayOrder(q, attempt.id, q.id, committedNow);
  }, [q, attempt.id, committedNow]);

  // Fetch a question checked before a reload again when it is shown (a repeat /check returns
  // the locked answer's result and changes nothing).
  useEffect(() => {
    if (!q || !committedIds.has(q.id) || checked[q.id]) return;
    const qId = q.id;
    let cancelled = false;
    checkAnswer(attempt.id, qId, responsesRef.current[qId]?.answer ?? "")
      .then((result) => {
        if (!cancelled) setChecked((prev) => ({ ...prev, [qId]: result }));
      })
      .catch((err) => {
        if (!cancelled) setRestoreErrors((prev) => ({ ...prev, [qId]: err instanceof BankApiRequestError ? err.message : "Could not load the result." }));
      });
    return () => {
      cancelled = true;
    };
  }, [q, committedIds, checked, attempt.id]);

  async function handleCheck() {
    if (!q) return;
    const answer = responses[q.id]?.answer;
    if (!answer) return;
    setChecking(true);
    setCheckError("");
    try {
      const result = await checkAnswer(attempt.id, q.id, answer);
      setChecked((prev) => ({ ...prev, [q.id]: result }));
    } catch (err) {
      setCheckError(err instanceof BankApiRequestError ? err.message : "Could not check this answer.");
    } finally {
      setChecking(false);
    }
  }

  const doSubmit = useCallback(async (returnToMenu = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    const flushed = currentQuestionRef.current ? flushSeconds(currentQuestionRef.current, responsesRef.current) : responsesRef.current;
    setResponses(flushed);
    try {
      await submitAttempt(attempt.id, flushed);
      router.push(returnToMenu ? "/papers" : `/papers/attempts/${attempt.id}`);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(err instanceof BankApiRequestError ? err.message : "Could not submit this attempt.");
    }
  }, [attempt.id, flushSeconds, router]);

  // Countdown for timed modes (full/section). Untimed practice has durationSeconds === null.
  const [timeLeft, setTimeLeft] = useState<number | null>(() => {
    if (attempt.durationSeconds == null) return null;
    const startedMs = new Date(attempt.startedAt).getTime();
    const elapsedAlready = Math.floor((Date.now() - startedMs) / 1000);
    return Math.max(0, attempt.durationSeconds - elapsedAlready);
  });
  useEffect(() => {
    if (attempt.durationSeconds == null) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearInterval(id);
          setTimeout(() => doSubmit(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [attempt.durationSeconds, doSubmit]);

  // Keyboard shortcuts: 1-4 select by display position, n/p next/prev, m mark.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!q) return;
      if (document.querySelector("dialog[open]") || (e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(e.target.tagName)))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (/^[1-9]$/.test(key)) {
        const pos = Number(key) - 1;
        if (orderedOptions[pos]) selectOption(orderedOptions[pos].id);
      } else if (key === "n") {
        goTo(index + 1);
      } else if (key === "p") {
        goTo(index - 1);
      } else if (key === "m") {
        if (isPractice) toggleMark();
        else saveAndAdvance(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, orderedOptions, index, committedNow, checking, submitting, imageStates]);

  if (!q) {
    return <div className="mx-auto max-w-md px-4 py-14 text-center text-sm text-slate-500">{t({ en: "No questions in this attempt.", hi: "इस प्रयास में कोई प्रश्न नहीं है।" })}</div>;
  }

  const response = responses[q.id];
  const displayedAnswer = isPractice ? response?.answer ?? null : draftAnswers[q.id] ?? null;
  const isChecked = committedNow;
  const originalDefault = imageLed(q);
  const showOriginal = originalDefault || viewOriginalOverride[q.id];
  const imageState = imageStates[q.imageUrl ?? ""];
  const contentBlocked = Boolean(q.unavailable || (originalDefault && imageState !== "loaded"));
  const showHi = contentLang === "hi" && q.translations?.hi;
  const stemText = showHi ? q.translations!.hi!.stem : q.stem;
  const optionTextFor = (optId: string, fallback: string) => {
    if (!showHi) return fallback;
    const hiOpt = q.translations?.hi?.options.find((o) => o.id === optId);
    return hiOpt ? hiOpt.text : fallback;
  };

  const answeredCount = questions.filter((qq) => responses[qq.id]?.answer != null).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-3 py-3 pb-24 sm:px-4 sm:py-4 sm:pb-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-4">
        <div className="min-w-0 text-xs font-medium text-slate-700 sm:text-sm">
          <span className="truncate">{q.section}</span>
          <span className="mx-2 hidden text-slate-300 lg:inline">·</span>
          <span className="hidden text-slate-500 lg:inline">Q{index + 1}/{visibleIds.length}</span>
          {!q.scored && !checked[q.id] && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {t({ en: "Not scored", hi: "स्कोर नहीं होगा" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
          {!isPractice && <button type="button" onClick={() => setShowCalculator(open => !open)} aria-expanded={showCalculator} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold">{t({ en: "Calculator", hi: "कैलकुलेटर" })}</button>}
          <button type="button" onClick={() => setConfirmSubmit(true)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold">{t({ en: "End test", hi: "टेस्ट समाप्त करें" })}</button>
          {timeLeft !== null ? (
            <span className={`font-mono font-semibold ${timeLeft < 60 ? "text-red-600" : "text-slate-700"}`}>⏱ {formatClock(timeLeft)}</span>
          ) : (
            <span className="text-[11px] text-slate-400">{t({ en: "Untimed", hi: "समय-सीमा नहीं" })}</span>
          )}
          <span className="text-slate-500">{answeredCount}/{questions.length} {t({ en: "answered", hi: "उत्तरित" })}</span>
          <span
            className={`hidden text-[11px] sm:inline ${saveState === "error" ? "text-rose-500" : "text-slate-400"}`}
            aria-live="polite"
          >
            {saveState === "saving" && t({ en: "Saving…", hi: "सहेज रहे हैं…" })}
            {saveState === "saved" && t({ en: "Saved", hi: "सहेजा गया" })}
            {saveState === "error" && t({ en: "Save failed, retrying…", hi: "सहेजना विफल, पुनः प्रयास…" })}
          </span>
        </div>
      </div>

      {/* Section tabs */}
      {sectionNames.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {sectionNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => switchSection(name)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                name === activeSection ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <details ref={mobilePalette} className="rounded-xl border border-slate-200 bg-white p-3 lg:hidden">
        <summary className="flex cursor-pointer items-center text-sm font-medium text-slate-700">Questions · {index + 1} / {visibleIds.length}<span aria-hidden="true" className="ml-auto">⌄</span></summary>
        <div className="mt-2 max-h-[40dvh] overflow-y-auto">
          <Palette questions={questions.filter(qq => visibleIds.includes(qq.id))} responses={responses} currentId={currentId} onJump={id => { goTo(visibleIds.indexOf(id)); if (mobilePalette.current) mobilePalette.current.open = false; }} />
        </div>
      </details>
      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        {/* Question card */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              {!originalDefault && q.imageUrl && (
                <button
                  type="button"
                  onClick={() => setViewOriginalOverride((prev) => ({ ...prev, [q.id]: !showOriginal }))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    showOriginal ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  {t({ en: "View original", hi: "मूल देखें" })}
                </button>
              )}
            </div>
            {anyHasHi && (
              <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-slate-300 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setContentLang("en")}
                  className={`px-2 py-1 ${contentLang === "en" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setContentLang("hi")}
                  disabled={!q.translations?.hi}
                  className={`px-2 py-1 disabled:opacity-40 ${contentLang === "hi" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  हिं
                </button>
              </div>
            )}
          </div>

          {showOriginal && q.imageUrl && imageState !== "error" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={rememberImage} key={`${q.id}:${imageRetry}`} src={q.imageUrl} alt="Source question with its numbered options" onLoad={() => setImageStates(prev => ({ ...prev, [q.imageUrl!]: "loaded" }))} onError={() => setImageStates(prev => ({ ...prev, [q.imageUrl!]: "error" }))} className="mb-4 h-auto w-full rounded-lg border border-slate-200" />
          )}
          {showOriginal && q.imageUrl && imageState === "loaded" && <button type="button" onClick={() => imageViewer.current?.showModal()} className="mb-4 self-start rounded-lg border border-slate-300 px-3 py-2 text-sm">Enlarge question</button>}
          <dialog ref={imageViewer} className="install-dialog w-[calc(100%-2rem)] max-w-5xl rounded-xl bg-white p-4" aria-label="Enlarged source question">
            <form method="dialog" className="mb-3 flex justify-end"><button className="rounded-lg border border-slate-300 px-4 py-2">Close image</button></form>
            <p className="mb-3 text-xs text-slate-500">Scroll sideways to read the source at full size.</p>
            <div className="max-h-[65dvh] overflow-auto">{q.imageUrl && (
              // The authenticated source crop must not go through a public image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.imageUrl} alt="Enlarged source question and options" style={{ maxWidth: "none" }} />
            )}</div>
          </dialog>
          {originalDefault && !q.unavailable && imageState !== "loaded" && <div role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {imageState === "error" || !q.imageUrl ? "The source image is unavailable. Do not guess: retry or move to another question." : "Loading the question image…"}
            {q.imageUrl && imageState === "error" && <button type="button" onClick={() => { setImageStates(prev => { const next = { ...prev }; delete next[q.imageUrl!]; return next; }); setImageRetry(n => n + 1); }} className="mt-2 block rounded-lg border border-amber-300 px-3 py-2">Retry image</button>}
          </div>}

          {q.unavailable && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t({ en: "This question could not be extracted cleanly from the source PDF (its text is incomplete and there is no verified image), so it is not scored.", hi: "यह प्रश्न स्रोत PDF से साफ़ नहीं निकाला जा सका (पाठ अधूरा है और सत्यापित चित्र नहीं है), इसलिए इसे स्कोर नहीं किया जाता।" })}
            </p>
          )}

          {stemText && (!originalDefault || !q.imageUrl ? (
            <p className="mb-5 whitespace-pre-line text-[15px] leading-relaxed text-slate-900">{stemText}</p>
          ) : q.textQuality !== "garbled" && (
            <details className="mb-4 text-sm text-slate-700">
              <summary className="cursor-pointer text-xs font-medium text-slate-500">
                {textReliable(q) ? t({ en: "Show the question as text", hi: "प्रश्न पाठ के रूप में देखें" }) : t({ en: "Machine-read text (may contain errors)", hi: "मशीन से पढ़ा गया पाठ (त्रुटियाँ हो सकती हैं)" })}
              </summary>
              <p className="mt-2 whitespace-pre-line leading-relaxed">{stemText}</p>
            </details>
          ))}
          {originalDefault && imageState === "loaded" && !textReliable(q) && <p className="mb-3 text-xs text-slate-500">{t({ en: "Read the numbered options in the source image, then select the matching number below.", hi: "स्रोत चित्र में क्रमांकित विकल्प पढ़ें, फिर नीचे वही क्रमांक चुनें।" })}</p>}

          <div className="flex flex-col gap-2.5">
            {orderedOptions.map((opt, pos) => {
              const selected = displayedAnswer === opt.id;
              const result = checked[q.id];
              let cls = "flex min-h-[44px] items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors";
              if (result) {
                const isKey = result.key.answer === opt.id;
                if (isKey) cls += " border-green-500 bg-green-50";
                else if (selected) cls += " border-red-400 bg-red-50";
                else cls += " border-slate-200 bg-white";
              } else if (selected) {
                cls += " border-blue-500 bg-blue-50";
              } else {
                cls += " border-slate-200 bg-white active:bg-slate-50";
              }
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isChecked || contentBlocked || checking || submitting}
                  aria-pressed={selected}
                  onClick={() => selectOption(opt.id)}
                  className={`${cls} ${isChecked ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-500"
                    }`}
                  >
                    {displayLabel(q, pos)}
                  </span>
                  {textReliable(q) && optionTextFor(opt.id, opt.text).trim() ? (
                    <span className="text-slate-800">{optionTextFor(opt.id, opt.text)}</span>
                  ) : (
                    <span className="text-slate-600">{t({ en: `Select option ${pos + 1} from the source image`, hi: `स्रोत चित्र का विकल्प ${pos + 1} चुनें` })}</span>
                  )}
                </button>
              );
            })}
          </div>
          {!isChecked && <button type="button" disabled={displayedAnswer == null || checking || submitting} onClick={() => selectOption(null)} className="mt-3 self-start rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40">{t({ en: "Clear response", hi: "उत्तर हटाएँ" })}</button>}

          {isPractice && !isChecked && (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCheck}
                disabled={!response?.answer || checking || contentBlocked}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {checking ? t({ en: "Checking…", hi: "जाँच रहे हैं…" }) : t({ en: "Check", hi: "जाँचें" })}
              </button>
              {checkError && <span className="text-xs font-medium text-rose-600">{checkError}</span>}
            </div>
          )}

          {isChecked && !checked[q.id] && (
            <p className={`mt-4 text-xs ${restoreErrors[q.id] ? "text-amber-800" : "text-slate-400"}`}>
              {restoreErrors[q.id]
                ? `${t({ en: "Answer locked.", hi: "उत्तर लॉक है।" })} ${restoreErrors[q.id]}`
                : t({ en: "Answer locked. Loading the result…", hi: "उत्तर लॉक है। परिणाम लोड हो रहा है…" })}
            </p>
          )}
          {checked[q.id] && (
            <CheckedResultPanel result={checked[q.id]} question={q} />
          )}

          <div className="mt-6 hidden items-center justify-between gap-2 border-t border-slate-100 pt-4 sm:flex">
            {isPractice ? <button
              type="button"
              onClick={toggleMark}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                response?.marked ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"
              }`}
            >
              {response?.marked ? t({ en: "★ Marked", hi: "★ चिह्नित" }) : t({ en: "☆ Mark for review", hi: "☆ समीक्षा हेतु चिह्नित करें" })}
            </button> : <button type="button" onClick={() => saveAndAdvance(true)} className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
              {t({ en: "Mark for Review & Next", hi: "समीक्षा हेतु चिह्नित करें और आगे" })}
            </button>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                {t({ en: "Previous", hi: "पिछला" })}
              </button>
              {isPractice ? (index < visibleIds.length - 1 ? (
                <button type="button" onClick={() => goTo(index + 1)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t({ en: "Next", hi: "अगला" })}</button>
              ) : (
                <button type="button" onClick={() => setConfirmSubmit(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{t({ en: "Submit", hi: "सबमिट करें" })}</button>
              )) : (
                <button type="button" onClick={() => saveAndAdvance(false)} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">{t({ en: "Save & Next", hi: "सहेजें और आगे" })}</button>
              )}
            </div>
          </div>
        </div>

        {/* Palette (desktop) */}
        <div className="hidden flex-col gap-3 lg:flex">
          <Palette
            questions={questions.filter((qq) => visibleIds.includes(qq.id))}
            responses={responses}
            currentId={currentId}
            onJump={(id) => goTo(visibleIds.indexOf(id))}
          />
          <button type="button" onClick={() => setConfirmSubmit(true)} className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white">
            {t({ en: "Submit now", hi: "अभी सबमिट करें" })}
          </button>
        </div>
      </div>

      {/* Sticky bottom nav (mobile) */}
      <div className="mobile-action-bar fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:hidden">
        <button type="button" onClick={isPractice ? toggleMark : () => saveAndAdvance(true)} aria-label={t({ en: "Mark for review and continue", hi: "समीक्षा हेतु चिह्नित करें और आगे" })} className={`flex h-11 w-11 items-center justify-center rounded-lg border text-lg ${response?.marked ? "border-violet-400 bg-violet-50" : "border-slate-200"}`}>{response?.marked ? "★" : "☆"}</button>
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label={t({ en: "Previous question", hi: "पिछला प्रश्न" })}
          className="flex h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          {t({ en: "Prev", hi: "पिछला" })}
        </button>
        {!isPractice ? (
          <button type="button" onClick={() => saveAndAdvance(false)} aria-label={t({ en: "Save answer and go to next question", hi: "उत्तर सहेजें और अगले प्रश्न पर जाएँ" })} className="flex h-11 flex-1 items-center justify-center rounded-lg bg-emerald-700 text-sm font-semibold text-white">{t({ en: "Save & Next", hi: "सहेजें और आगे" })}</button>
        ) : index < visibleIds.length - 1 ? (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label={t({ en: "Next question", hi: "अगला प्रश्न" })}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-slate-900 text-sm font-medium text-white"
          >
            {t({ en: "Next", hi: "अगला" })}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmSubmit(true)}
            aria-label={t({ en: "Submit attempt", hi: "प्रयास सबमिट करें" })}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white"
          >
            {t({ en: "Submit", hi: "सबमिट करें" })}
          </button>
        )}
      </div>

      {confirmSubmit && (
        <EndTestDialog answered={answeredCount} total={questions.length} busy={submitting} error={submitError} onCancel={() => setConfirmSubmit(false)} onSubmit={destination => { void doSubmit(destination); }} />
      )}
      {!isPractice && <ScientificCalculatorWidget isOpen={showCalculator} onClose={() => setShowCalculator(false)} />}
    </div>
  );
}

function Palette({
  questions,
  responses,
  currentId,
  onJump,
}: {
  questions: BankQuestionForAttempt[];
  responses: BankResponses;
  currentId: string;
  onJump: (id: string) => void;
}) {
  const { t } = useLang();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(44px,1fr))] gap-1.5 lg:grid-cols-5">
        {questions.map((qq, i) => {
          const state = paletteState(responses[qq.id]);
          const active = qq.id === currentId;
          return (
            <button
              key={qq.id}
              type="button"
              onClick={() => onJump(qq.id)}
              aria-label={`${t({ en: "Question", hi: "प्रश्न" })} ${i + 1}: ${state}`}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-11 w-full items-center justify-center rounded border text-xs font-semibold ${PALETTE_STYLE[state]} ${
                active ? "ring-2 ring-blue-400" : ""
              } relative`}
            >
              {i + 1}
              {state === "answered-marked" && <span aria-hidden="true" className="absolute bottom-1 right-1 h-2 w-2 rounded-full border border-white bg-emerald-300" />}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <Legend swatch="bg-slate-50 border-slate-200" label={t({ en: "Not visited", hi: "अदेखा" })} />
        <Legend swatch="bg-red-600 border-red-600" label={t({ en: "Not answered", hi: "अनुत्तरित" })} />
        <Legend swatch="bg-emerald-600 border-emerald-600" label={t({ en: "Answered", hi: "उत्तरित" })} />
        <Legend swatch="bg-violet-600 border-violet-600" label={t({ en: "Marked", hi: "चिह्नित" })} />
        <Legend swatch="bg-violet-600 border-violet-600" label={t({ en: "Answered + marked", hi: "उत्तरित + चिह्नित" })} />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border ${swatch}`} />
      {label}
    </div>
  );
}

function CheckedResultPanel({ result, question }: { result: BankCheckResult; question: OptionLayout & { unavailable?: boolean } }) {
  const { t } = useLang();
  const correct = result.outcome === "correct";
  const unscored = result.outcome === "unscored";
  const [explanation, setExplanation] = useState<BankExplanation | null>(result.explanation);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState("");

  async function handleExplain() {
    setExplainLoading(true);
    setExplainError("");
    try {
      setExplanation((await explainQuestion(result.questionId)).explanation);
    } catch (err) {
      setExplainError(err instanceof BankApiRequestError ? err.message : "Could not generate an explanation.");
    } finally {
      setExplainLoading(false);
    }
  }

  return (
    <div className={`mt-4 rounded-lg border p-3 text-sm ${correct ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <p className="mb-1 font-semibold text-slate-800">
        {correct
          ? t({ en: "Correct", hi: "सही" })
          : unscored
            ? question.unavailable
              ? t({ en: "Not scored: this question could not be extracted cleanly", hi: "स्कोर नहीं: यह प्रश्न साफ़ नहीं निकाला जा सका" })
              : result.key.statusLabel
            : t({ en: "Not quite", hi: "बिल्कुल नहीं" })}
      </p>
      {!question.unavailable && <KeyProvenance keyView={result.key} question={question} showStatus={!unscored} />}
      {result.sourceSolution && <p className="mt-2 whitespace-pre-line text-slate-700">{result.sourceSolution}</p>}
      {explanation ? (
        <ExplanationBlock explanation={explanation} question={question} />
      ) : result.key.scored && !question.unavailable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExplain}
            disabled={explainLoading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {explainLoading ? t({ en: "Explaining…", hi: "समझाया जा रहा है…" }) : t({ en: "Explain with AI", hi: "AI से समझाएँ" })}
          </button>
          {explainError && <span className="text-xs font-medium text-rose-600">{explainError}</span>}
        </div>
      ) : null}
      {!question.unavailable && <AskFollowUp kind="bank" id={result.questionId} />}
    </div>
  );
}
