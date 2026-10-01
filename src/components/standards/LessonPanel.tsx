"use client";

import { useLang } from "@/lib/i18n";
import { StructuredAnswer } from "@/components/ai/AskFollowUp";
import { AiGeneratedBadge } from "@/components/ai/AiGeneratedBadge";
import { aiDetail, CheckNote, SearchSuggestions, SourcesList, type Lesson } from "./shared";

export function LessonPanel({ lesson, busy, learned, onRegenerate, onToggleLearned }: { lesson: Lesson; busy: boolean; learned: boolean; onRegenerate: () => void; onToggleLearned: () => void }) {
  const { t } = useLang();
  return (
    <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
      <AiGeneratedBadge detail={aiDetail(lesson.model, lesson.grounded, t)} />
      <StructuredAnswer answer={lesson.text} />
      <SourcesList sources={lesson.sources ?? []} />
      {lesson.searchEntryPointHtml && <SearchSuggestions html={lesson.searchEntryPointHtml} />}
      <CheckNote check={lesson.check} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onToggleLearned} aria-pressed={learned} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${learned ? "bg-emerald-600 text-white" : "border border-emerald-600 text-emerald-700"}`}>{learned ? t({ en: "✓ Learned", hi: "✓ सीख लिया" }) : t({ en: "Mark as learned", hi: "सीखा हुआ चिह्नित करें" })}</button>
        <button type="button" onClick={onRegenerate} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-600 disabled:opacity-50">{t({ en: "Regenerate", hi: "फिर से बनाएँ" })}</button>
      </div>
    </div>
  );
}
