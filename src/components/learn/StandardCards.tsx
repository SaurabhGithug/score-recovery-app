"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { AlertIcon, ArrowRightIcon, BookOpenIcon, CheckIcon, ChevronRightIcon, ClockIcon, PlayIcon, SparkleIcon } from "./icons";
import { ProgressMeter, Skeleton } from "./ProgressMeter";
import {
  MIN_TEST_QUESTIONS, clauseLabel, computeProgress, studyHref, testHref, useClauses, useLearned, useQuizOverview,
  type QuizState, type StandardRow,
} from "./standards-data";

// ---------------------------------------------------------------- shared look

const btn = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 motion-safe:active:scale-[0.98]";
const btnPrimary = `${btn} bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50`;
const btnResume = `${btn} bg-violet-600 text-white shadow-sm shadow-violet-600/25 hover:bg-violet-700`;
const btnDisabled = `${btn} cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400`;
/** Lifts the clickable bits above the card-wide link, which is stretched with an ::after layer. */
const above = "relative z-10";
/** Stretched link: its ::after covers the whole (relative) card, so the card is one big target. */
const stretched = "after:absolute after:inset-0 after:content-['']";
/** globals.css sets an unlayered focus outline that utility classes cannot override; the card ring (cardFocus) replaces it on the stretched link. */
const noOutline = { outline: "none" } as const;
const cardFocus = "has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-blue-600 has-[[data-card-link]:focus-visible]:ring-offset-2";

export function IsBadge({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-blue-600 to-violet-600 font-black tracking-tight text-white shadow-md shadow-blue-600/25 ${small ? "h-10 w-10 rounded-xl text-sm" : "h-12 w-12 rounded-2xl text-lg"}`}>IS</span>
  );
}

function Chip({ tone, icon, children }: { tone: "violet" | "slate"; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "violet" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>{icon}{children}</span>
  );
}

function useCounts(standard: StandardRow) {
  const { t } = useLang();
  return {
    clauses: t({ en: `${standard.clauses} clauses`, hi: `${standard.clauses} क्लॉज़` }),
    lessons: standard.lessons > 0
      ? t({ en: `${standard.lessons} AI ${standard.lessons === 1 ? "lesson" : "lessons"} ready`, hi: `${standard.lessons} AI पाठ तैयार` })
      : t({ en: "No AI lessons yet", hi: "अभी कोई AI पाठ नहीं" }),
  };
}

/** "12 of 65 clauses learned" with the count emphasised. */
function LearnedLine({ done, total }: { done: number; total: number }) {
  const { lang } = useLang();
  return lang === "hi"
    ? <>{total} में से <b className="text-2xl font-bold tabular-nums">{done}</b> क्लॉज़ सीखे</>
    : <><b className="text-2xl font-bold tabular-nums">{done}</b> of {total} clauses learned</>;
}

// ---------------------------------------------------------------- hero (Learn hub)

const tile = "flex flex-col rounded-2xl border border-slate-200/80 bg-white/85 p-4 sm:p-5";
const tileLabel = "flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500";

export function StandardHeroCard({ standard, userId }: { standard: StandardRow; userId: string }) {
  const { t } = useLang();
  const learned = useLearned(userId, standard.id);
  const { clauses, loading: clausesLoading } = useClauses(standard.id);
  const quiz = useQuizOverview(standard.id);
  const progress = computeProgress(standard.clauses, learned, clauses);
  const study = studyHref(standard.id, progress.next);
  const counts = useCounts(standard);
  const headingId = `is-hero-${standard.id}`;
  const label = t({ en: "Clauses learned", hi: "सीखे गए क्लॉज़" });
  const valueText = t({ en: `${progress.done} of ${progress.total}`, hi: `${progress.total} में से ${progress.done}` });

  return (
    <article aria-labelledby={headingId} className={`group relative isolate overflow-clip rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-5 shadow-sm transition hover:border-blue-200 hover:shadow-lg sm:p-8 ${cardFocus}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-violet-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />

      <div className="flex items-center gap-3">
        <IsBadge />
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-slate-900">{t({ en: "Indian Standards", hi: "भारतीय मानक" })}</h2>
          <p className="text-sm text-slate-600">{t({ en: "Clause by clause, with AI lessons checked against the text.", hi: "क्लॉज़ दर क्लॉज़, मानक के पाठ से जाँचे गए AI पाठों के साथ।" })}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-blue-700">{standard.code}</p>
        <h3 className="mt-1 break-words text-xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-2xl">
          <Link href={study} data-card-link style={noOutline} className={`${stretched} group-hover:underline group-hover:decoration-blue-300 group-hover:underline-offset-4`}>{standard.title}</Link>
        </h3>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Study */}
        <div className={tile}>
          <p className={tileLabel}><BookOpenIcon className="h-4 w-4" />{t({ en: "Your progress", hi: "आपकी प्रगति" })}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-sm font-medium text-slate-700"><LearnedLine done={progress.done} total={progress.total} /></p>
            <p className="text-sm font-semibold tabular-nums text-blue-700">{progress.percent}%</p>
          </div>
          <ProgressMeter className="mt-2.5" value={progress.done} max={progress.total} label={label} valueText={valueText} />
          <div className="mt-3"><Chip tone={standard.lessons > 0 ? "violet" : "slate"} icon={<SparkleIcon className="h-3.5 w-3.5" />}>{counts.lessons}</Chip></div>

          <div className="mt-4 min-h-[3.25rem]">
            {clausesLoading ? <Skeleton className="h-[3.25rem] w-full" />
              : progress.allDone ? (
                <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800"><CheckIcon className="h-4 w-4" />{t({ en: "All clauses learned", hi: "सभी क्लॉज़ सीख लिए" })}</p>
              ) : progress.next ? (
                <p className="flex items-start gap-3 rounded-xl bg-blue-50/70 px-3 py-2.5">
                  <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><PlayIcon className="ml-px h-3 w-3" /></span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-blue-700">{progress.done > 0 ? t({ en: "Continue at", hi: "यहाँ से आगे बढ़ें" }) : t({ en: "Start at", hi: "यहाँ से शुरू करें" })}</span>
                    <span className="line-clamp-2 break-words text-sm font-medium text-slate-900">{clauseLabel(progress.next, t)}</span>
                  </span>
                </p>
              ) : null}
          </div>

          <div className={`${above} mt-auto pt-4`}>
            <Link href={study} className={btnPrimary}>{t({ en: "Study", hi: "पढ़ें" })}<ArrowRightIcon className="h-4 w-4" /></Link>
          </div>
        </div>

        {/* Timed test */}
        <div className={tile}>
          <p className={tileLabel}><ClockIcon className="h-4 w-4" />{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</p>
          <TestStatus standardId={standard.id} quiz={quiz} />
        </div>
      </div>
    </article>
  );
}

/** Body of the "Timed test" tile: quiz status plus the one action that fits it. */
function TestStatus({ standardId, quiz }: { standardId: string; quiz: QuizState }) {
  const { t } = useLang();
  const href = testHref(standardId);

  if (quiz.status === "loading") {
    return (
      <>
        <div className="mt-3 space-y-2.5"><Skeleton className="h-9 w-24" /><Skeleton className="h-4 w-40" /></div>
        <div className="mt-auto pt-4"><Skeleton className="h-12 w-full rounded-xl" /></div>
      </>
    );
  }

  if (quiz.status === "unavailable") {
    return (
      <>
        <p className="mt-3 text-sm leading-6 text-slate-600">{t({ en: "Timed multiple-choice questions on this standard.", hi: "इस मानक पर समयबद्ध बहुविकल्पीय प्रश्न।" })}</p>
        <div className={`${above} mt-auto pt-4`}><Link href={href} className={btnSecondary}>{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</Link></div>
      </>
    );
  }

  const { overview } = quiz;
  const attempts = overview.history.filter(h => h.submittedAt).length;

  if (overview.active) {
    const ends = new Date(overview.active.deadlineAt);
    const endsAt = Number.isNaN(ends.getTime()) ? "" : ends.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return (
      <>
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-violet-900">{t({ en: "A test is in progress", hi: "एक टेस्ट चल रहा है" })}</p>
          <p className="mt-0.5 break-words text-xs text-violet-800">{overview.active.scopeLabel}{endsAt && <> · {t({ en: `ends at ${endsAt}`, hi: `${endsAt} पर समाप्त` })}</>}</p>
        </div>
        <div className={`${above} mt-auto pt-4`}><Link href={href} className={btnResume}>{t({ en: "Resume test", hi: "टेस्ट जारी रखें" })}<ArrowRightIcon className="h-4 w-4" /></Link></div>
      </>
    );
  }

  if (overview.available.total < MIN_TEST_QUESTIONS) {
    return (
      <>
        <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700"><SparkleIcon className="mt-0.5 h-4 w-4 text-violet-500" />{t({ en: "Questions are being prepared", hi: "प्रश्न तैयार किए जा रहे हैं" })}</p>
        <div className="mt-auto pt-4"><button type="button" disabled className={btnDisabled}>{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</button></div>
      </>
    );
  }

  return (
    <>
      <div className="mt-3 flex items-end gap-5">
        <div>
          <p className="text-xs text-slate-500">{t({ en: "Best score", hi: "सर्वश्रेष्ठ स्कोर" })}</p>
          <p className="text-3xl font-bold leading-tight tabular-nums text-slate-900">{overview.bestPercent === null ? "–" : `${Math.round(overview.bestPercent)}%`}</p>
        </div>
        <ul className="pb-1 text-sm leading-6 text-slate-600">
          <li>{attempts === 0 ? t({ en: "No attempts yet", hi: "अभी कोई प्रयास नहीं" }) : t({ en: `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`, hi: `${attempts} प्रयास` })}</li>
          <li>{t({ en: `${overview.available.total} questions ready`, hi: `${overview.available.total} प्रश्न तैयार` })}</li>
        </ul>
      </div>
      <div className={`${above} mt-auto pt-4`}><Link href={href} className={btnSecondary}>{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}<ArrowRightIcon className="h-4 w-4" /></Link></div>
    </>
  );
}

export function StandardHeroSkeleton() {
  return (
    <div role="status" aria-live="polite" className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-5 sm:p-8">
      <span className="sr-only">Loading your standards…</span>
      <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-2xl" /><div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></div></div>
      <div className="mt-6 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-7 w-full max-w-md" /></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2"><Skeleton className="h-60 rounded-2xl" /><Skeleton className="h-60 rounded-2xl" /></div>
    </div>
  );
}

// ---------------------------------------------------------------- compact row (extra standards on the hub)

export function StandardRowLink({ standard, userId }: { standard: StandardRow; userId: string }) {
  const { t } = useLang();
  const learned = useLearned(userId, standard.id);
  const progress = computeProgress(standard.clauses, learned, null);
  const counts = useCounts(standard);
  return (
    <Link href={studyHref(standard.id, null)} className="group flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 pr-4 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600 motion-safe:active:scale-[0.99]">
      <IsBadge small />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-blue-700">{standard.code}</span>
        <span className="line-clamp-2 break-words text-sm font-medium text-slate-900">{standard.title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{counts.clauses} · {t({ en: `${progress.done} learned`, hi: `${progress.done} सीखे` })}</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </Link>
  );
}

// ---------------------------------------------------------------- list card (/standards)

export function StandardListCard({ standard, userId }: { standard: StandardRow; userId: string }) {
  const { t } = useLang();
  const learned = useLearned(userId, standard.id);
  const progress = computeProgress(standard.clauses, learned, null);
  const counts = useCounts(standard);
  const headingId = `std-${standard.id}`;
  return (
    <article aria-labelledby={headingId} className={`group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6 ${cardFocus}`}>
      <div className="flex items-start gap-3">
        <IsBadge small />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{standard.code}</p>
          <h2 id={headingId} className="mt-0.5 break-words text-lg font-semibold leading-snug text-slate-900">
            <Link href={studyHref(standard.id, null)} data-card-link style={noOutline} className={`${stretched} group-hover:underline group-hover:decoration-blue-300 group-hover:underline-offset-4`}>{standard.title}</Link>
          </h2>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone="slate" icon={<BookOpenIcon className="h-3.5 w-3.5" />}>{counts.clauses}</Chip>
        <Chip tone={standard.lessons > 0 ? "violet" : "slate"} icon={<SparkleIcon className="h-3.5 w-3.5" />}>{counts.lessons}</Chip>
      </div>
      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-medium text-slate-700"><LearnedLine done={progress.done} total={progress.total} /></p>
          <p className="text-sm font-semibold tabular-nums text-blue-700">{progress.percent}%</p>
        </div>
        <ProgressMeter className="mt-2" value={progress.done} max={progress.total} label={t({ en: "Clauses learned", hi: "सीखे गए क्लॉज़" })} valueText={t({ en: `${progress.done} of ${progress.total}`, hi: `${progress.total} में से ${progress.done}` })} />
      </div>
      <div className={`${above} mt-5 grid gap-3 sm:grid-cols-2`}>
        <Link href={studyHref(standard.id, null)} className={btnPrimary}>{t({ en: "Study", hi: "पढ़ें" })}<ArrowRightIcon className="h-4 w-4" /></Link>
        <Link href={testHref(standard.id)} className={btnSecondary}><ClockIcon className="h-4 w-4" />{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- shared states

export function EmptyStandards() {
  const { t } = useLang();
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-10">
      <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><BookOpenIcon className="h-6 w-6" /></span>
      <p className="mt-4 text-base font-semibold text-slate-900">{t({ en: "No standards in your account yet.", hi: "आपके खाते में अभी कोई मानक नहीं है।" })}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{t({ en: "Standards added to your account will appear here, ready to study.", hi: "आपके खाते में जोड़े गए मानक यहाँ पढ़ने के लिए दिखेंगे।" })}</p>
    </div>
  );
}

export function StandardsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <p className="flex items-start gap-3 text-sm text-rose-900"><AlertIcon className="mt-0.5 h-5 w-5 text-rose-600" /><span><b className="block font-semibold">{t({ en: "Could not load your standards", hi: "आपके मानक लोड नहीं हो सके" })}</b>{message}</span></p>
      <button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-900 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600">{t({ en: "Try again", hi: "फिर कोशिश करें" })}</button>
    </div>
  );
}
