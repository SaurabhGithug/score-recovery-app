"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { AiGeneratedBadge } from "./AiGeneratedBadge";

export interface StudyPackData {
  topic: { nodeId: string; path: string; pypCount: number; years: number[] } | null;
  topicBasis: "own_tags" | "similar_past_questions" | "none";
  similarPastQuestions: { count: number; years: number[] };
  scope: string;
  examPoints: string[];
  practice: { question: string; options: { id: string; text: string }[]; answer: string; explanation: string; crossChecked: boolean }[];
  generatedBy: string;
  checkedBy: string | null;
  createdAt: string;
}

function years(list: number[]): string {
  if (!list.length) return "";
  return list.length === 1 ? ` (${list[0]})` : ` (${list[0]}–${list[list.length - 1]})`;
}

/** The syllabus topic as a tag, with how often SSC asked it (from the past papers in this app). */
export function TopicTag({ pack }: { pack: StudyPackData }) {
  const { t } = useLang();
  if (!pack.topic) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-teal-100 px-2.5 py-1 font-semibold text-teal-900">{pack.topic.path}</span>
      {pack.topic.pypCount > 0 && (
        <span className="text-slate-600">
          {t({ en: `SSC asked ${pack.topic.pypCount} question(s) on this${years(pack.topic.years)}`, hi: `SSC ने इस पर ${pack.topic.pypCount} प्रश्न पूछे${years(pack.topic.years)}` })}
        </span>
      )}
    </p>
  );
}

function PracticeQuestion({ item, index }: { item: StudyPackData["practice"][number]; index: number }) {
  const { t } = useLang();
  const [choice, setChoice] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">
        {index + 1}. <span className="whitespace-pre-line">{item.question}</span>
      </p>
      <div className="mt-2 grid gap-1.5">
        {item.options.map((o) => {
          const tone = !checked
            ? choice === o.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
            : o.id === item.answer ? "border-emerald-500 bg-emerald-50" : o.id === choice ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50 text-slate-500";
          return (
            <button key={o.id} type="button" disabled={checked} onClick={() => setChoice(o.id)} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm ${tone}`}>
              <span className="font-bold">{o.id}.</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
      {!checked ? (
        <button type="button" disabled={!choice} onClick={() => setChecked(true)} className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          {t({ en: "Check", hi: "जाँचें" })}
        </button>
      ) : (
        <div className="mt-2 text-xs leading-5 text-slate-700">
          <p className={`font-bold ${choice === item.answer ? "text-emerald-700" : "text-rose-700"}`}>
            {choice === item.answer ? t({ en: "Correct", hi: "सही" }) : t({ en: `Answer: ${item.answer}`, hi: `उत्तर: ${item.answer}` })}
          </p>
          <p className="mt-1 whitespace-pre-line">{item.explanation}</p>
        </div>
      )}
    </li>
  );
}

/** Topic, scope, exam points and practice questions for one question. Everything but the past-paper counts is AI-generated. */
export function StudyPack({ pack }: { pack: StudyPackData }) {
  const { t } = useLang();
  const checkedLabel = pack.checkedBy ? t({ en: `answers checked by a second AI (${pack.checkedBy})`, hi: `उत्तर दूसरे AI (${pack.checkedBy}) से जाँचे गए` }) : t({ en: "answers not cross-checked", hi: "उत्तर दूसरे AI से नहीं जाँचे गए" });
  return (
    <section aria-label={t({ en: "Topic and practice", hi: "विषय और अभ्यास" })} className="mt-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-teal-900">{t({ en: "Syllabus topic and practice", hi: "पाठ्यक्रम विषय और अभ्यास" })}</h4>
        <AiGeneratedBadge detail={pack.generatedBy} />
      </div>
      <div className="mt-2">
        {pack.topic ? <TopicTag pack={pack} /> : <p className="text-xs text-slate-600">{t({ en: "No single syllabus topic could be matched from the past papers.", hi: "पिछले पेपरों से कोई एक विषय नहीं मिला।" })}</p>}
        <p className="mt-1 text-[11px] text-slate-500">
          {pack.topicBasis === "own_tags"
            ? t({ en: "Topic from this question's syllabus tags (AI-suggested, not yet reviewed).", hi: "विषय इस प्रश्न के टैग से (AI-सुझाया, समीक्षा बाकी)।" })
            : t({ en: `Topic matched through ${pack.similarPastQuestions.count} similar past SSC questions${years(pack.similarPastQuestions.years)}; their tags are AI-suggested.`, hi: `विषय ${pack.similarPastQuestions.count} मिलते-जुलते पिछले SSC प्रश्नों से${years(pack.similarPastQuestions.years)}; उनके टैग AI-सुझाए हैं।` })}
        </p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-800"><span className="font-semibold">{t({ en: "Scope: ", hi: "दायरा: " })}</span>{pack.scope}</p>
      {pack.examPoints.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-700">{t({ en: "Worth remembering for the exam", hi: "परीक्षा के लिए याद रखें" })}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800">{pack.examPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {pack.practice.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-700">
            {t({ en: "Practise this topic", hi: "इस विषय का अभ्यास" })} <span className="font-normal text-slate-500">· {checkedLabel}</span>
          </p>
          <ol className="mt-2 space-y-2">{pack.practice.map((item, i) => <PracticeQuestion key={i} item={item} index={i} />)}</ol>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t({ en: "No practice questions passed the second AI's check this time.", hi: "इस बार कोई अभ्यास प्रश्न दूसरे AI की जाँच में पास नहीं हुआ।" })}</p>
      )}
    </section>
  );
}
