"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ChevronRightIcon } from "./icons";
import { ProgressMeter, Skeleton } from "./ProgressMeter";
import {
  MIN_TEST_QUESTIONS, clauseLabel, computeProgress, studyHref, testHref, useClauses, useLearned, useQuizOverview,
  type QuizState, type StandardRow,
} from "./standards-data";

// One accent (blue) plus slate. No shadows, gradients, icons or motion: the page stays still.
// Keyboard focus uses the app-wide outline from globals.css.

const btn = "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-base font-semibold sm:w-auto";
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700 sm:flex-1`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 sm:px-6`;
const btnDisabled = `${btn} cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500 sm:px-6`;

type Translate = ReturnType<typeof useLang>["t"];

/** "12 of 65 clauses learned", "Not started · 65 clauses" or "All 65 clauses learned". */
function progressText(t: Translate, done: number, total: number): string {
  if (total > 0 && done >= total) return t({ en: `All ${total} clauses learned`, hi: `सभी ${total} क्लॉज़ सीख लिए` });
  if (done === 0) return t({ en: `Not started · ${total} clauses`, hi: `शुरू नहीं किया · ${total} क्लॉज़` });
  return t({ en: `${done} of ${total} clauses learned`, hi: `${total} में से ${done} क्लॉज़ सीखे` });
}

// ---------------------------------------------------------------- the one card on the Learn hub

export function StandardCard({ standard, userId }: { standard: StandardRow; userId: string }) {
  const { t } = useLang();
  const learned = useLearned(userId, standard.id);
  const { clauses, loading: clausesLoading } = useClauses(standard.id);
  const quiz = useQuizOverview(standard.id);
  const progress = computeProgress(standard.clauses, learned, clauses);
  const headingId = `std-card-${standard.id}`;
  const noteId = `std-note-${standard.id}`;

  const label = progress.allDone ? t({ en: "Review", hi: "दोहराएँ" }) : progress.done > 0 ? t({ en: "Continue", hi: "जारी रखें" }) : t({ en: "Start", hi: "शुरू करें" });
  const target = progress.allDone ? null : progress.next;
  const test = testAction(quiz, t);

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <p className="break-words text-sm text-slate-600">{standard.code}</p>
      <h2 id={headingId} className="mt-1 break-words text-xl font-semibold leading-snug text-slate-900">{standard.title}</h2>

      <div className="mt-5">
        {clausesLoading ? <Skeleton className="h-6 w-48" /> : (
          <>
            <p className="text-base tabular-nums text-slate-800">{progressText(t, progress.done, progress.total)}</p>
            {progress.done > 0 && (
              <ProgressMeter
                className="mt-2.5" value={progress.done} max={progress.total}
                label={t({ en: "Clauses learned", hi: "सीखे गए क्लॉज़" })}
                valueText={t({ en: `${progress.done} of ${progress.total}`, hi: `${progress.total} में से ${progress.done}` })}
              />
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {clausesLoading ? <Skeleton className="h-12 w-full rounded-xl sm:flex-1" /> : (
          <Link href={studyHref(standard.id, target)} aria-label={target ? `${label}, ${clauseLabel(target, t)}` : undefined} className={btnPrimary}>{label}</Link>
        )}
        {test.kind === "loading" ? <Skeleton className="h-12 w-full rounded-xl sm:w-36" />
          : test.kind === "disabled" ? <button type="button" disabled aria-describedby={noteId} className={btnDisabled}>{test.label}</button>
          : <Link href={testHref(standard.id)} aria-describedby={test.note ? noteId : undefined} className={btnSecondary}>{test.label}</Link>}
      </div>
      {test.kind !== "loading" && test.note && <p id={noteId} className="mt-3 text-sm text-slate-600">{test.note}</p>}
    </section>
  );
}

type TestAction =
  | { kind: "loading" }
  | { kind: "link" | "disabled"; label: string; note: string | null };

/** What the quiet "Timed test" action says and does. A missing or broken quiz endpoint just means a plain link without stats. */
function testAction(quiz: QuizState, t: Translate): TestAction {
  const label = t({ en: "Timed test", hi: "समयबद्ध टेस्ट" });
  if (quiz.status === "loading") return { kind: "loading" };
  if (quiz.status === "unavailable") return { kind: "link", label, note: null };

  const { overview } = quiz;
  if (overview.active) {
    const ends = new Date(overview.active.deadlineAt);
    const endsAt = Number.isNaN(ends.getTime()) ? "" : ends.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return { kind: "link", label: t({ en: "Resume test", hi: "टेस्ट जारी रखें" }), note: endsAt ? t({ en: `Ends at ${endsAt}`, hi: `${endsAt} पर समाप्त` }) : null };
  }
  if (overview.available.total < MIN_TEST_QUESTIONS) {
    return { kind: "disabled", label, note: t({ en: "Questions are being prepared", hi: "प्रश्न तैयार किए जा रहे हैं" }) };
  }
  return {
    kind: "link", label,
    note: overview.bestPercent === null ? null : t({ en: `Best score ${Math.round(overview.bestPercent)}%`, hi: `सर्वश्रेष्ठ स्कोर ${Math.round(overview.bestPercent)}%` }),
  };
}

export function StandardCardSkeleton() {
  const { t } = useLang();
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <span className="sr-only">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-6 w-full" />
      <Skeleton className="mt-2 h-6 w-2/3" />
      <Skeleton className="mt-5 h-5 w-48" />
      <Skeleton className="mt-6 h-12 w-full rounded-xl" />
    </div>
  );
}

// ---------------------------------------------------------------- one row on /standards

export function StandardListItem({ standard, userId }: { standard: StandardRow; userId: string }) {
  const { t } = useLang();
  const learned = useLearned(userId, standard.id);
  const progress = computeProgress(standard.clauses, learned, null);
  return (
    <Link href={studyHref(standard.id, null)} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 sm:p-5">
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm text-slate-600">{standard.code}</span>
        <span className="mt-0.5 block break-words text-base font-semibold leading-snug text-slate-900">{standard.title}</span>
        <span className="mt-1 block text-sm tabular-nums text-slate-600">{progressText(t, progress.done, progress.total)}</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 text-slate-400" />
    </Link>
  );
}

// ---------------------------------------------------------------- shared states

export function EmptyStandards() {
  const { t } = useLang();
  return (
    <p className="rounded-2xl border border-slate-200 bg-white p-5 text-base text-slate-700 sm:p-6">{t({ en: "No standards in your account yet.", hi: "आपके खाते में अभी कोई मानक नहीं है।" })}</p>
  );
}

export function StandardsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 sm:p-6">
      <p className="text-base font-semibold text-rose-900">{t({ en: "Could not load your standards", hi: "आपके मानक लोड नहीं हो सके" })}</p>
      {message && <p className="mt-1 break-words text-sm text-rose-900">{message}</p>}
      <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-900 hover:bg-rose-100">{t({ en: "Try again", hi: "फिर कोशिश करें" })}</button>
    </div>
  );
}
