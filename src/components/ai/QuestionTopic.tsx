"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { QuestionStudyContext } from "@/lib/syllabus/study-types";

export function useQuestionContext(kind: "made_easy" | "bank", id: string) {
  const [state, setState] = useState<{ key: string; data?: QuestionStudyContext; error?: string } | null>(null);
  const key = `${kind}:${id}`;
  useEffect(() => {
    let live = true;
    fetch(`/api/ai/question-context?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not load the syllabus topic."); return data; })
      .then(data => { if (live) setState({ key, data }); }, error => { if (live) setState({ key, error: error.message }); });
    return () => { live = false; };
  }, [kind, id, key]);
  return state?.key === key ? state : null;
}

export function QuestionTopic({ kind, id }: { kind: "made_easy" | "bank"; id: string }) {
  const state = useQuestionContext(kind, id);
  if (!state) return <p className="mt-3 text-xs text-slate-500">Finding syllabus topic…</p>;
  if (!state.data) return <p className="mt-3 text-xs text-slate-500">{state.error}</p>;
  return <TopicLinks context={state.data} />;
}

export function TopicLinks({ context }: { context: QuestionStudyContext }) {
  return <div className="mt-3 space-y-1.5 text-xs">
    <p className="font-semibold text-slate-500">{context.exam}</p>
    <div className="flex flex-wrap gap-2">
      {context.subject && <Link href={`/syllabus?node=${encodeURIComponent(context.subject.id)}`} className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 hover:underline">Subject: {context.subject.name}</Link>}
      {context.topic && <Link href={`/syllabus?node=${encodeURIComponent(context.topic.id)}`} className="rounded-lg bg-teal-50 px-2.5 py-1.5 font-semibold text-teal-900 hover:underline">Topic: {context.topic.name} ↗</Link>}
    </div>
    <p className="text-slate-500">{context.basis === "unmapped" ? "Topic not confidently matched yet." : context.basis === "suggested" ? "Suggested syllabus match · open for analysis and questions" : "From saved syllabus tags · open for analysis and questions"}</p>
  </div>;
}
