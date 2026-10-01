"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ClaimSources } from "./ClaimSources";
import type { StudyCitation } from "@/lib/study-evidence";
import { AiGeneratedBadge } from "./AiGeneratedBadge";

export interface StudyPackData {
  evidenceVersion?: number;
  topic: { nodeId: string; path: string; pypCount: number; years: number[] } | null;
  topicBasis: "own_tags" | "similar_past_questions" | "none";
  similarPastQuestions: { count: number; years: number[] };
  scope: string;
  examPoints: string[];
  evidence?: StudyCitation[];
  practice: { question: string; options: { id: string; text: string }[]; answer: string; explanation: string; crossChecked: boolean }[];
  generatedBy: string;
  checkedBy: string | null;
  createdAt: string;
}

function years(list: number[]): string {
  if (!list.length) return "";
  return list.length === 1 ? ` (${list[0]})` : ` (${list[0]}–${list[list.length - 1]})`;
}

type RecallKind = "definition" | "formula" | "rule" | "fact";

function recallKind(point: string): RecallKind {
  if (point.includes("=") || /formula|return period|risk \(/i.test(point)) return "formula";
  if (/designed for|as per|typically|must|should|major dams/i.test(point)) return "rule";
  if (/\([A-Z]{2,6}\) is| is derived from| represents /i.test(point)) return "definition";
  return "fact";
}

function recallTitle(point: string, index: number): { title: string; body: string } {
  const colon = point.indexOf(":");
  if (colon > 2 && colon < 88) {
    return { title: point.slice(0, colon).trim(), body: point.slice(colon + 1).trim() };
  }
  const definition = point.match(/^(.{2,78}?\([A-Z]{2,6}\))\s+(is\s+.+)$/);
  if (definition) return { title: definition[1].trim(), body: definition[2].trim() };
  if (/^Major dams/i.test(point)) return { title: "Dam design selection", body: point };
  return { title: `Study note ${index + 1}`, body: point };
}

const RECALL_TONE: Record<RecallKind, { label: string; shell: string; badge: string }> = {
  definition: { label: "Definition", shell: "border-blue-200 bg-blue-50/60", badge: "bg-blue-100 text-blue-800" },
  formula: { label: "Formula", shell: "border-violet-200 bg-violet-50/60", badge: "bg-violet-100 text-violet-800" },
  rule: { label: "Selection rule", shell: "border-amber-200 bg-amber-50/60", badge: "bg-amber-100 text-amber-800" },
  fact: { label: "Study note", shell: "border-slate-200 bg-white", badge: "bg-slate-100 text-slate-700" },
};

function RecallCard({ point, index, evidence }: { point: string; index: number; evidence?: StudyCitation[] }) {
  const kind = recallKind(point);
  const tone = RECALL_TONE[kind];
  const { title, body } = recallTitle(point, index);
  const formulaLines = kind === "formula"
    ? body.split(/,\s+(?=(?:[A-Z][A-Za-z']+(?:'s)? formula|[A-Za-z][A-Za-z ]+\s*=))/)
    : [body];
  return (
    <li className={`overflow-hidden rounded-xl border ${tone.shell}`}>
      <div className="flex items-center gap-3 border-b border-black/5 px-3.5 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">{index + 1}</span>
        <h5 className="min-w-0 flex-1 text-sm font-black leading-5 text-slate-950">{title}</h5>
        <span className={`hidden rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide sm:inline ${tone.badge}`}>{tone.label}</span>
      </div>
      <div className="p-3.5">
        {kind === "formula" ? (
          <div className="space-y-2">
            {formulaLines.map((line, lineIndex) => (
              <p key={lineIndex} className="rounded-lg border border-violet-100 bg-white/80 px-3 py-2 font-mono text-[13px] leading-6 text-slate-800">{line}</p>
            ))}
          </div>
        ) : <p className="text-sm leading-6 text-slate-700">{body}</p>}
        <ClaimSources text={point} evidence={evidence} showUncited />
      </div>
    </li>
  );
}

/** The syllabus topic as a tag, with how often SSC asked it (from the past papers in this app). */
export function TopicTag({ pack }: { pack: StudyPackData }) {
  const { t } = useLang();
  if (!pack.topic) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      <Link href={`/syllabus?node=${encodeURIComponent(pack.topic.nodeId)}`} className="rounded-full bg-teal-100 px-2.5 py-1 font-semibold text-teal-900 hover:underline">{pack.topic.path} ↗</Link>
      {pack.topic.pypCount > 0 && (
        <span className="text-slate-600">
          {t({ en: `${pack.topic.pypCount} stored past-paper questions mapped here${years(pack.topic.years)} · unreviewed tags`, hi: `${pack.topic.pypCount} संग्रहित प्रश्न यहाँ जुड़े हैं${years(pack.topic.years)} · टैग समीक्षा बाकी` })}
        </span>
      )}
    </p>
  );
}

function PracticeQuestion({ item, index, evidence }: { evidence?: StudyCitation[]; item: StudyPackData["practice"][number]; index: number }) {
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
          <ClaimSources text={item.explanation} evidence={evidence} showUncited />
        </div>
      )}
    </li>
  );
}

/** Topic, scope, exam points and practice questions for one question. Everything but the past-paper counts is AI-generated. */
export function StudyPack({ pack }: { pack: StudyPackData }) {
  const { t } = useLang();
  const checkedLabel = pack.checkedBy ? t({ en: `AI-generated practice · another model agreed on the answers (${pack.checkedBy}); this is not source verification`, hi: `उत्तर दूसरे AI (${pack.checkedBy}) से जाँचे गए` }) : t({ en: "answers not cross-checked", hi: "उत्तर दूसरे AI से नहीं जाँचे गए" });
  const scopeParts = pack.scope.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  return (
    <section aria-label={t({ en: "Topic and practice", hi: "विषय और अभ्यास" })} className="mt-3 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
      <div className="border-b border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black uppercase tracking-[0.14em] text-teal-900">{t({ en: "Learn this in small chunks", hi: "छोटे भागों में सीखें" })}</h4>
        <AiGeneratedBadge detail={pack.generatedBy} />
      </div>
      <div className="mt-3">
        {pack.topic ? <TopicTag pack={pack} /> : <p className="text-xs text-slate-600">{t({ en: "No single syllabus topic could be matched from the past papers.", hi: "पिछले पेपरों से कोई एक विषय नहीं मिला।" })}</p>}
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          {pack.topicBasis === "own_tags"
            ? t({ en: "Topic from this question's syllabus tags (AI-suggested, not yet reviewed).", hi: "विषय इस प्रश्न के टैग से (AI-सुझाया, समीक्षा बाकी)।" })
            : pack.similarPastQuestions.count === 0
              ? t({ en: "Suggested from syllabus wording; no related past-paper excerpts found.", hi: "पाठ्यक्रम के शब्दों से सुझाया गया; कोई संबंधित पिछले प्रश्न का अंश नहीं मिला।" })
              : t({ en: `Topic matched through ${pack.similarPastQuestions.count} similar past SSC questions${years(pack.similarPastQuestions.years)}; their tags are AI-suggested.`, hi: `विषय ${pack.similarPastQuestions.count} मिलते-जुलते पिछले SSC प्रश्नों से${years(pack.similarPastQuestions.years)}; उनके टैग AI-सुझाए हैं।` })}
        </p>
      </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
      <section aria-labelledby="study-pack-scope">
        <h5 id="study-pack-scope" className="text-xs font-black uppercase tracking-wide text-slate-500">{t({ en: "First, know the scope", hi: "पहले दायरा समझें" })}</h5>
        <div className="mt-2 grid gap-2">
          {scopeParts.map((part, index) => (
            <div key={index} className={`rounded-xl border p-3.5 ${index === 0 ? "border-cyan-200 bg-cyan-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{index === 0 ? t({ en: "What it covers", hi: "क्या शामिल है" }) : t({ en: "Topic note", hi: "SSC क्या पूछता है" })}</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-800">{part}</p>
              <ClaimSources text={part} evidence={pack.evidence} showUncited />
            </div>
          ))}
        </div>
      </section>

      {pack.examPoints.length > 0 && (
        <section aria-labelledby="study-pack-recall">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h5 id="study-pack-recall" className="text-base font-black text-slate-950">{t({ en: "Quick-recall cards", hi: "त्वरित याद कार्ड" })}</h5>
              <p className="mt-0.5 text-xs text-slate-500">{t({ en: "Read the heading, recall the idea, then check the short answer.", hi: "शीर्षक पढ़ें, विचार याद करें, फिर छोटा उत्तर देखें।" })}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{pack.examPoints.length} {t({ en: "study notes", hi: "मुख्य बिंदु" })}</span>
          </div>
          <ol className="mt-3 grid gap-3 lg:grid-cols-2">{pack.examPoints.map((point, index) => <RecallCard key={index} point={point} index={index} evidence={pack.evidence} />)}</ol>
        </section>
      )}

      {pack.practice.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <summary className="cursor-pointer list-none text-sm font-black text-slate-900 marker:hidden">
            <span className="flex items-center justify-between gap-3"><span>{t({ en: "Now test your recall", hi: "अब अपनी याददाश्त जाँचें" })}</span><span aria-hidden="true" className="text-blue-700">＋</span></span>
          </summary>
          <p className="mt-2 text-xs text-slate-500">{checkedLabel}</p>
          <ol className="mt-3 space-y-2">{pack.practice.map((item, i) => <PracticeQuestion key={i} item={item} index={i} evidence={pack.evidence} />)}</ol>
        </details>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t({ en: "No practice questions passed the second AI's check this time.", hi: "इस बार कोई अभ्यास प्रश्न दूसरे AI की जाँच में पास नहीं हुआ।" })}</p>
      )}
      </div>
    </section>
  );
}
