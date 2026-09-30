"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/user-context";
import { useLang } from "@/lib/i18n";

interface GenerationRun {
  status: "RUNNING" | "DONE" | "FAILED" | "BUDGET_REACHED" | "INTERRUPTED";
  message: string | null;
  finishedAt: string | null;
  pageFrom: number;
  pageTo: number;
  sectionsTotal: number;
  sectionsDone: number;
  ready: number;
  needsReview: number;
  rejected: number;
  duplicates: number;
  rejectionReasons: Record<string, number>;
  provider: string;
  costUsd: number;
  budgetUsd: number;
}

interface GenerationInfo {
  configured: boolean;
  unavailableReason: string | null;
  provider: string | null;
  maxUsdPerRun: number;
  maxUsdPerDay: number;
  dailyRemainingUsd: number;
  pages: { first: number; last: number; count: number };
  rangeError: string | null;
  estimate: {
    sections: number;
    usablePages: number;
    questions: number;
    costUsd: { offPeak: number; peak: number };
  } | null;
  run: GenerationRun | null;
}

function usd(n: number): string {
  if (n === 0) return "$0.00";
  return n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

export function GeneratePracticePanel({
  documentId,
  onQuestionsChanged,
  hasExistingQuestions,
}: {
  documentId: string;
  onQuestionsChanged: () => void;
  hasExistingQuestions: boolean;
}) {
  const { currentUser } = useUser();
  const { t } = useLang();
  const [info, setInfo] = useState<GenerationInfo | null>(null);
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [questionsPerPage, setQuestionsPerPage] = useState("3");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // finishedAt of the last completed run we've seen; undefined until the first load.
  const lastFinishedAt = useRef<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!currentUser) return;
    const qs = new URLSearchParams({ pageFrom, pageTo, questionsPerPage });
    const res = await fetch(`/api/documents/${documentId}/generate?${qs}`, {
      headers: { "x-user-id": currentUser.id },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not load generation settings");
      return;
    }
    setInfo(json);

    // A run finished since we last looked (however fast it was): have the page reload its counts.
    const run = json.run as GenerationRun | null;
    const finishedAt = run && run.status !== "RUNNING" ? run.finishedAt : null;
    if (lastFinishedAt.current === undefined) {
      lastFinishedAt.current = finishedAt;
    } else if (finishedAt && finishedAt !== lastFinishedAt.current) {
      lastFinishedAt.current = finishedAt;
      onQuestionsChanged();
    }

    if (!pageFrom && !pageTo && json.pages.count > 0) {
      setPageFrom(String(json.pages.first));
      setPageTo(String(json.pages.last));
    }
  }, [currentUser, documentId, pageFrom, pageTo, questionsPerPage, onQuestionsChanged]);

  // Refresh the estimate shortly after the range changes.
  useEffect(() => {
    const timer = setTimeout(load, 350);
    return () => clearTimeout(timer);
  }, [load]);

  const running = info?.run?.status === "RUNNING";

  // Poll while a run is in progress.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [running, load]);

  async function start() {
    if (!currentUser) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": currentUser.id },
        body: JSON.stringify({
          pageFrom: Number(pageFrom),
          pageTo: Number(pageTo),
          questionsPerPage: Number(questionsPerPage),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start generation");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation");
    } finally {
      setStarting(false);
    }
  }

  if (!info) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
        {error ?? t({ en: "Loading question generator…", hi: "प्रश्न जनरेटर लोड हो रहा है…" })}
      </div>
    );
  }

  const run = info.run;
  const progress = run && run.sectionsTotal > 0 ? Math.round((run.sectionsDone / run.sectionsTotal) * 100) : 0;
  const runLimit = Math.min(info.maxUsdPerRun, info.dailyRemainingUsd);
  const dailyLimitUsed = info.configured && info.dailyRemainingUsd < 0.01;
  const canStart =
    info.configured && !dailyLimitUsed && !running && !starting && !info.rangeError && (info.estimate?.sections ?? 0) > 0;

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">
          {hasExistingQuestions
            ? t({ en: "Generate more practice questions", hi: "और अभ्यास प्रश्न बनाएँ" })
            : t({ en: "Generate practice questions from this document", hi: "इस दस्तावेज़ से अभ्यास प्रश्न बनाएँ" })}
        </h3>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          {t({
            en: "AI writes exam-style questions from your pages. Each question must quote the sentence that proves its answer, and a second model re-solves it without seeing the answer. Only questions that pass both checks go straight to practice.",
            hi: "AI आपके पन्नों से परीक्षा-शैली के प्रश्न बनाता है। हर प्रश्न को वह वाक्य उद्धृत करना होता है जो उसके उत्तर को सिद्ध करता है, और दूसरा मॉडल उत्तर देखे बिना उसे फिर से हल करता है। दोनों जाँचें पास करने वाले प्रश्न ही सीधे अभ्यास में जाते हैं।",
          })}
        </p>
      </div>

      {info.provider === "mock" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
          Mock mode (LLM_PROVIDER=mock): questions are simple test fill-in-the-blanks, not real practice content.
        </p>
      )}

      {!info.configured && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          {info.unavailableReason}
        </p>
      )}

      {!running && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-[11px] font-semibold text-slate-600">
            {t({ en: "From page", hi: "पृष्ठ से" })}
            <input
              type="number"
              inputMode="numeric"
              min={info.pages.first}
              max={info.pages.last}
              value={pageFrom}
              onChange={(e) => setPageFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            {t({ en: "To page", hi: "पृष्ठ तक" })}
            <input
              type="number"
              inputMode="numeric"
              min={info.pages.first}
              max={info.pages.last}
              value={pageTo}
              onChange={(e) => setPageTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="col-span-2 text-[11px] font-semibold text-slate-600 sm:col-span-1">
            {t({ en: "Questions per page", hi: "प्रति पृष्ठ प्रश्न" })}
            <select
              value={questionsPerPage}
              onChange={(e) => setQuestionsPerPage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!running && info.rangeError && <p className="text-xs text-red-600">{info.rangeError}</p>}

      {!running && dailyLimitUsed && (
        <p className="text-xs text-amber-800">
          {t({
            en: `Today's $${info.maxUsdPerDay.toFixed(2)} generation limit is used up. It frees up over the next 24 hours.`,
            hi: `आज की $${info.maxUsdPerDay.toFixed(2)} की सीमा पूरी हो गई है। अगले 24 घंटों में यह फिर उपलब्ध होगी।`,
          })}
        </p>
      )}

      {!running && info.estimate && !info.rangeError && (
        <p className="text-xs text-slate-600">
          {info.estimate.sections === 0 ? (
            t({
              en: "No readable text in these pages — they may be blank, images only, or badly scanned.",
              hi: "इन पन्नों में पढ़ने योग्य पाठ नहीं है — ये खाली, केवल चित्र या खराब स्कैन हो सकते हैं।",
            })
          ) : (
            <>
              ≈ <strong>{info.estimate.questions}</strong> {t({ en: "questions from", hi: "प्रश्न," })}{" "}
              {info.estimate.usablePages} {t({ en: "readable pages", hi: "पढ़ने योग्य पन्नों से" })} ·{" "}
              {t({ en: "estimated cost", hi: "अनुमानित लागत" })}{" "}
              <strong>
                {usd(info.estimate.costUsd.offPeak)}–{usd(info.estimate.costUsd.peak)}
              </strong>{" "}
              <span className="text-slate-400">
                ({t({ en: "off-peak–peak; stops at", hi: "ऑफ़-पीक–पीक; सीमा" })} {usd(runLimit)})
              </span>
            </>
          )}
        </p>
      )}

      {running && run && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              {t({ en: "Generating…", hi: "प्रश्न बन रहे हैं…" })} {run.sectionsDone}/{run.sectionsTotal}{" "}
              {t({ en: "sections", hi: "खंड" })}
            </span>
            <span>{usd(run.costUsd)} {t({ en: "so far", hi: "अब तक" })}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.max(4, progress)}%` }} />
          </div>
          <RunCounts run={run} />
        </div>
      )}

      {!running && run && (
        <div
          className={`rounded-xl border p-3 text-xs space-y-2 ${
            run.status === "DONE" ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"
          }`}
        >
          <p className="font-semibold text-slate-800">
            {run.status === "DONE" && t({ en: "Last run finished", hi: "पिछला रन पूरा हुआ" })}
            {run.status === "BUDGET_REACHED" && t({ en: "Last run stopped at the spending limit", hi: "पिछला रन खर्च सीमा पर रुका" })}
            {run.status === "FAILED" && t({ en: "Last run failed", hi: "पिछला रन विफल रहा" })}
            {run.status === "INTERRUPTED" && t({ en: "Last run was interrupted", hi: "पिछला रन बीच में रुक गया" })}
            <span className="font-normal text-slate-500">
              {" "}
              · {t({ en: "pages", hi: "पृष्ठ" })} {run.pageFrom}–{run.pageTo} · {usd(run.costUsd)}
            </span>
          </p>
          {run.message && <p className="text-slate-700">{run.message}</p>}
          <RunCounts run={run} />
          {Object.keys(run.rejectionReasons).length > 0 && (
            <details className="text-slate-600">
              <summary className="cursor-pointer">{t({ en: "Why questions were rejected", hi: "प्रश्न क्यों अस्वीकार हुए" })}</summary>
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(run.rejectionReasons).map(([reason, count]) => (
                  <li key={reason}>
                    {reason}: {count}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {run.ready > 0 && (
              <Link
                href={`/library/${documentId}/practice`}
                className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
              >
                {t({ en: "Start practice", hi: "अभ्यास शुरू करें" })}
              </Link>
            )}
            {run.needsReview > 0 && (
              <Link
                href={`/library/${documentId}/review`}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-50"
              >
                {t({ en: "Review flagged", hi: "चिह्नित प्रश्न देखें" })} ({run.needsReview})
              </Link>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!running && (
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-800 sm:w-auto"
        >
          {starting
            ? t({ en: "Starting…", hi: "शुरू हो रहा है…" })
            : t({ en: "Generate questions", hi: "प्रश्न बनाएँ" })}
        </button>
      )}
    </div>
  );
}

function RunCounts({ run }: { run: GenerationRun }) {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span className="text-emerald-700">
        <strong>{run.ready}</strong> {t({ en: "ready", hi: "तैयार" })}
      </span>
      <span className="text-amber-700">
        <strong>{run.needsReview}</strong> {t({ en: "need review", hi: "जाँच बाकी" })}
      </span>
      <span className="text-slate-500">
        <strong>{run.rejected}</strong> {t({ en: "rejected", hi: "अस्वीकृत" })}
      </span>
      {run.duplicates > 0 && (
        <span className="text-slate-500">
          <strong>{run.duplicates}</strong> {t({ en: "repeats skipped", hi: "दोहराव छोड़े" })}
        </span>
      )}
    </div>
  );
}
