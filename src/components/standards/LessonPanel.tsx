"use client";

import { useId, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { StructuredAnswer } from "@/components/ai/AskFollowUp";
import { AiGeneratedBadge } from "@/components/ai/AiGeneratedBadge";
import { aiDetail, CheckNote, ChevronIcon, SearchSuggestions, SourcesList, type LangCode, type Lesson } from "./shared";

/**
 * AI-written text in calm reading type: 16px with generous leading, bold as plain bold (no highlighter), list markers
 * in quiet grey rather than a second accent colour, and any mini-headings in sentence case. Wraps the shared answer
 * renderer so markup and maths handling stay in one place.
 */
export function ReadingAnswer({ text }: { text: string }) {
  return (
    <div className="[&>div]:mt-0 [&>div]:text-base [&>div]:leading-7 [&>div]:text-slate-800 [&_strong]:bg-transparent [&_strong]:px-0 [&_li]:marker:text-slate-500 [&_h5]:border-0 [&_h5]:pt-0 [&_h5]:text-base [&_h5]:normal-case [&_h5]:tracking-normal [&_h5]:text-slate-900">
      <StructuredAnswer answer={text} />
    </div>
  );
}

interface Section { title: string; body: string }

/** The lesson is Markdown with '## ' headings (eight of them). Anything before the first heading is kept as an intro. */
function splitLesson(text: string): { intro: string; sections: Section[] } {
  const sections: Section[] = [];
  const intro: string[] = [];
  let current: { title: string; body: string[] } | null = null;
  const flush = () => {
    if (current && current.body.join("\n").trim()) sections.push({ title: current.title, body: current.body.join("\n").trim() });
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/)?.[1];
    if (heading) {
      flush();
      current = { title: heading.replace(/\*\*/g, "").replace(/:$/, "").trim(), body: [] };
    } else (current ? current.body : intro).push(line);
  }
  flush();
  return { intro: intro.join("\n").trim(), sections };
}

/** Sections open at first; the rest stay folded under their headings so the lesson can be scanned. */
const OPEN_SECTIONS = 2;

/**
 * Everything under the clause text: the one button that writes a lesson, or the lesson itself once it exists.
 * Language, sources and regenerate sit behind a single quiet Options button.
 */
export function LessonPanel({ lesson, lang, onLang, writing, otherWriting, error, onExplain }: {
  lesson: Lesson | undefined;
  lang: LangCode;
  onLang: (l: LangCode) => void;
  /** A lesson for this clause is being written now. */
  writing: boolean;
  /** A lesson for a different clause is being written now. */
  otherWriting: boolean;
  error: string;
  onExplain: (regenerate: boolean) => void;
}) {
  const { t } = useLang();
  const optionsId = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { intro, sections } = useMemo(() => splitLesson(lesson?.text ?? ""), [lesson?.text]);
  const sources = lesson?.sources ?? [];
  const busy = writing || otherWriting;

  const optionsButton = (
    <button type="button" onClick={() => setOptionsOpen(o => !o)} aria-expanded={optionsOpen} aria-controls={optionsId} className="-mr-2 ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-600 hover:text-slate-900">
      {t({ en: "Options", hi: "विकल्प" })}
      <ChevronIcon className={`h-4 w-4 ${optionsOpen ? "rotate-90" : ""}`} />
    </button>
  );
  const optionsPanel = optionsOpen && (
    <div id={optionsId} className="mt-2 space-y-5 rounded-xl bg-slate-50 p-4">
      <div>
        <p id={`${optionsId}-lang`} className="text-sm font-semibold text-slate-700">{t({ en: "Lesson language", hi: "पाठ की भाषा" })}</p>
        <div role="group" aria-labelledby={`${optionsId}-lang`} className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
          {(["en", "hi"] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)} className={`min-h-11 px-5 font-medium ${lang === l ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}>{l === "en" ? "English" : "हिंदी"}</button>)}
        </div>
      </div>
      {lesson && <SourcesList sources={sources} />}
      {lesson && <button type="button" onClick={() => onExplain(true)} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t({ en: "Regenerate", hi: "फिर से बनाएँ" })}</button>}
    </div>
  );
  const status = (writing || otherWriting) && (
    <p role="status" className="mt-3 text-base text-slate-700">
      {writing ? t({ en: "Researching and writing the lesson… (up to a minute)", hi: "शोध करके पाठ लिखा जा रहा है… (एक मिनट तक)" }) : t({ en: "Another lesson is still being written. Please wait.", hi: "दूसरा पाठ अभी लिखा जा रहा है। कृपया प्रतीक्षा करें।" })}
    </p>
  );
  const failure = error && <p role="alert" className="mt-3 text-base text-rose-700">{error}</p>;

  if (!lesson) {
    return (
      <section aria-label={t({ en: "Lesson", hi: "पाठ" })}>
        <button type="button" onClick={() => onExplain(false)} disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-600 px-5 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{t({ en: "Explain this clause", hi: "इस क्लॉज़ को समझाइए" })}</button>
        {status}
        {failure}
        <div className="mt-1 flex justify-end">{optionsButton}</div>
        {optionsPanel}
      </section>
    );
  }
  return (
    <section aria-label={t({ en: "Lesson", hi: "पाठ" })}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <AiGeneratedBadge detail={aiDetail(lesson.model, lesson.grounded, t)} />
        {optionsButton}
      </div>
      {optionsPanel}
      {status}
      <CheckNote check={lesson.check} className="mt-1" />
      {intro && <div className="mt-4"><ReadingAnswer text={intro} /></div>}
      {sections.length > 0 ? (
        <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {sections.map((s, i) => (
            <details key={`${lesson.createdAt}:${i}`} open={i < OPEN_SECTIONS} className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
                <h2 className="text-lg font-semibold leading-snug text-slate-900">{s.title}</h2>
                <ChevronIcon className="h-5 w-5 text-slate-500 group-open:rotate-90" />
              </summary>
              <div className="pb-6"><ReadingAnswer text={s.body} /></div>
            </details>
          ))}
        </div>
      ) : !intro && <div className="mt-4"><ReadingAnswer text={lesson.text} /></div>}
      {lesson.searchEntryPointHtml && <SearchSuggestions html={lesson.searchEntryPointHtml} />}
      {failure}
    </section>
  );
}
