"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { ChartIcon, ChevronRightIcon, LayersIcon, NoteIcon, PencilIcon } from "./icons";
import { EmptyStandards, StandardHeroCard, StandardHeroSkeleton, StandardRowLink, StandardsError } from "./StandardCards";
import { useStandardsList } from "./standards-data";

/** The existing practice workspace tabs (src/app/learn/page.tsx), one click away from the hub. */
const TOOLS: { tab: "today" | "revision" | "syllabus" | "progress"; icon: ReactNode; tone: string; title: { en: string; hi: string }; text: { en: string; hi: string } }[] = [
  {
    tab: "today", icon: <PencilIcon />, tone: "bg-blue-50 text-blue-700",
    title: { en: "Question practice", hi: "प्रश्न अभ्यास" },
    text: { en: "Short sessions of up to eight questions, with no time pressure.", hi: "आठ तक प्रश्नों के छोटे सत्र, बिना समय के दबाव के।" },
  },
  {
    tab: "revision", icon: <NoteIcon />, tone: "bg-violet-50 text-violet-700",
    title: { en: "Revision notes", hi: "रिवीज़न नोट्स" },
    text: { en: "Your saved short notes. Hide the answer and test your recall.", hi: "आपके सहेजे हुए छोटे नोट्स। उत्तर छिपाकर याद करने की जाँच करें।" },
  },
  {
    tab: "syllabus", icon: <LayersIcon />, tone: "bg-violet-50 text-violet-700",
    title: { en: "Study material", hi: "अध्ययन सामग्री" },
    text: { en: "Browse the syllabus and the notes available for each topic.", hi: "पाठ्यक्रम देखें और हर विषय के उपलब्ध नोट्स पढ़ें।" },
  },
  {
    tab: "progress", icon: <ChartIcon />, tone: "bg-blue-50 text-blue-700",
    title: { en: "Practice results", hi: "अभ्यास परिणाम" },
    text: { en: "Your saved answers, review dates and progress.", hi: "आपके सहेजे गए उत्तर, रिव्यू की तारीखें और प्रगति।" },
  },
];

export function MechanicalLearnHub() {
  const { t } = useLang();
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? "";
  const { rows, loading, error, reload } = useStandardsList();
  const hero = rows?.[0];
  const others = rows?.slice(1) ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-6 text-slate-900 sm:py-10">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{t({ en: "Learn", hi: "सीखें" })}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t({ en: "Your learning space", hi: "आपका अध्ययन स्थान" })}</h1>
        <p className="mt-2 max-w-xl text-base text-slate-600">{t({ en: "Pick up where you left off.", hi: "जहाँ छोड़ा था, वहीं से आगे बढ़ें।" })}</p>
      </header>

      <section aria-label={t({ en: "Indian Standards", hi: "भारतीय मानक" })}>
        {loading ? <StandardHeroSkeleton />
          : error ? <StandardsError message={error} onRetry={reload} />
          : !hero ? <EmptyStandards />
          : (
            <>
              <StandardHeroCard key={hero.id} standard={hero} userId={userId} />
              {others.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-slate-700">{t({ en: "Other standards", hi: "अन्य मानक" })}</h2>
                    <Link href="/standards" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">{t({ en: "View all standards", hi: "सभी मानक देखें" })}<ChevronRightIcon className="h-4 w-4" /></Link>
                  </div>
                  <ul className="mt-2 space-y-3">{others.map(s => <li key={s.id}><StandardRowLink standard={s} userId={userId} /></li>)}</ul>
                </div>
              )}
            </>
          )}
      </section>

      <section aria-labelledby="more-ways-heading">
        <h2 id="more-ways-heading" className="text-lg font-semibold tracking-tight">{t({ en: "More ways to learn", hi: "सीखने के और तरीके" })}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {TOOLS.map(tool => (
            <li key={tool.tab}>
              <Link href={`/learn?tab=${tool.tab}`} className="group flex h-full min-h-24 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 sm:p-5">
                <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tool.tone}`}>{tool.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-slate-900">{t(tool.title)}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-slate-600">{t(tool.text)}</span>
                </span>
                <ChevronRightIcon className="mt-3 h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
