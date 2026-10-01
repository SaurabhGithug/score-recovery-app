"use client";
import { ClaimSources } from "../ai/ClaimSources";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TopicAnalysis } from "@/lib/syllabus/study-types";

export function TopicAnalysisPanel({ nodeId }: { nodeId: string }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ page: number; data?: TopicAnalysis; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/syllabus/nodes/${encodeURIComponent(nodeId)}/analysis?page=${page}`, { cache: "no-store" })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not load analysis."); return data; })
      .then(data => { if (live) setState({ page, data }); }, error => { if (live) setState({ page, error: error.message }); });
    return () => { live = false; };
  }, [nodeId, page, retry]);
  const data = state?.page === page ? state.data : null;
  return <section aria-label="Topic analysis" className="rounded-2xl border border-teal-200 bg-teal-50/40 p-3">
    <h3 className="text-sm font-bold text-teal-950">Analysis & questions</h3>
    {!data && !state?.error && <p role="status" className="mt-2 text-xs text-slate-500">Loading topic analysis and linked questions…</p>}
    {state?.error && <p role="alert" className="mt-2 text-xs text-rose-700">{state.error} <button type="button" onClick={() => { setState(null); setRetry(n => n + 1); }} className="underline">Retry</button></p>}
    {data && <>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {[["Linked questions", data.total], ["Past-paper questions", data.pyp], ["Incorrect in imported tests", data.recovery.incorrect], ["Unattempted in imported tests", data.recovery.unattempted], ["Slower than group average", data.recovery.slow], ["Practice accuracy", data.practice.accuracy === null ? "No attempts yet" : `${data.practice.accuracy}%`]].map(([label, value]) => <div key={label} className="rounded-lg bg-white p-2.5"><dt className="text-slate-500">{label}</dt><dd className="mt-1 text-base font-bold text-slate-900">{value}</dd></div>)}
      </dl>
      <p className="mt-2 text-xs leading-5 text-slate-600">Includes this topic and its subtopics. Imported tests contain only incorrect and unattempted questions; they do not measure overall subject accuracy. Practice accuracy covers {data.practice.attempts} synced attempts{data.practice.averageSeconds !== null ? `, averaging ${data.practice.averageSeconds}s` : ""}.</p>
      {data.recovery.total > 0 && <p className="mt-2 text-xs font-semibold text-amber-800">{data.recovery.incorrect > 0 ? "Revisit the option traps, then practise without hints." : "Start with the core concept, then attempt the unanswered questions."} Made Easy topic matches are suggestions, not verified tags.</p>}
      {data.years.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Past-paper coverage by exam cycle">{data.years.map(y => <span key={y.year} className="rounded-lg bg-white px-2 py-1 text-xs text-slate-600">{y.year}: <b>{y.count}</b></span>)}</div>}
      {data.lessons.length > 0 && <section className="mt-4" aria-label="Saved topic lessons">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Saved teaching analysis</h4>
        <p className="mt-1 text-xs text-slate-500">AI-generated study notes from questions in this topic. Supporting sources appear beside each cited point.</p>
        {data.lessons.map(lesson => <details key={lesson.questionId} className="mt-2 rounded-xl border border-violet-200 bg-white p-3">
          <summary className="cursor-pointer text-xs font-semibold text-violet-900">{lesson.title}</summary>
          <p className="mt-2 text-sm leading-6 text-slate-700">{lesson.scope}</p><ClaimSources text={lesson.scope} evidence={lesson.evidence} showUncited />
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">{lesson.examPoints.map((point, i) => <li key={i}>{point}<ClaimSources text={point} evidence={lesson.evidence} showUncited /></li>)}</ul>
        </details>)}
      </section>}
      <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-600">All linked questions ({data.total})</h4>
      {!data.questions.length && <p className="mt-2 text-xs text-slate-500">No questions mapped here yet.</p>}
      <ul className="mt-2 space-y-2">{data.questions.map(q => <li key={`${q.kind}:${q.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-teal-800">{q.status}</p>
        <p className="mt-1 text-sm leading-5 text-slate-800">{q.stem || "Open the source to view this question."}</p>
        <Link href={q.href} className="mt-2 inline-block text-xs font-semibold text-blue-700 underline">{q.title} →</Link>
      </li>)}</ul>
      {data.pages > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <button type="button" disabled={data.page === 1} onClick={() => setPage(data.page - 1)} className="min-h-11 rounded-lg border bg-white px-3 disabled:opacity-40">Previous</button>
        <span>Page {data.page} of {data.pages}</span>
        <button type="button" disabled={data.page === data.pages} onClick={() => setPage(data.page + 1)} className="min-h-11 rounded-lg border bg-white px-3 disabled:opacity-40">Next</button>
      </div>}
    </>}
  </section>;
}
