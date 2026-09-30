"use client";

import { useState } from "react";
import type { LearningOverview } from "@/lib/learning/types";

export function learningSectionLabel(name: string) {
  const match = name.match(/^(P[12])\s*·\s*(.*)$/);
  const original = match?.[2] ?? name;
  const title = original.replace(/^Part-A\s+General Engineering\s*\(Civil\s*(?:&|and)\s*Structural\)$/i, "Civil & Structural Engineering");
  return { title, paper: match ? `Paper ${match[1].slice(1)}` : "" };
}

const action = "min-h-11 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40";
const panel = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";
const accuracy = (correct: number, total: number) => `${Math.round(100 * correct / total)}% correct · ${correct}/${total}`;

export function LearningProgress({ data, busy, onPractice, onResume }: {
  data: LearningOverview;
  busy: boolean;
  onPractice: (groupId?: string) => void;
  onResume: () => void;
}) {
  const [group, setGroup] = useState("");
  const recorded = data.groups.filter(g => g.attempts > 0);
  const ready = data.practiceReadyGroupIds ?? [];
  const canStart = group ? ready.includes(group) : ready.length > 0;
  return <>
    <p className="text-sm text-slate-500">Based on your saved practice—not an exam-score prediction.</p>
    {!recorded.length && <section className={panel}>
      <h2 className="text-lg font-semibold">No practice results yet</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">After you answer questions here, you can see what went well and what to practise next.</p>
    </section>}

    {recorded.map(g => {
      const label = learningSectionLabel(g.name);
      return <section className={panel} key={g.id}>
        {label.paper && <p className="text-xs text-slate-500">{label.paper}</p>}
        <h2 className="mt-1 font-semibold" title={g.name}>{label.title}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {g.newAttempts > 0 && <div><dt className="text-sm text-slate-600">New questions answered without help</dt><dd className="mt-1 font-semibold">{accuracy(g.newCorrect, g.newAttempts)}</dd></div>}
          {/* Equal to the row above until a question has been repeated: show it only when it adds something. */}
          {g.independent > g.newAttempts && <div><dt className="text-sm text-slate-600">All answers without help</dt><dd className="mt-1 font-semibold">{accuracy(g.correct, g.independent)}</dd></div>}
          {g.retentionChecks > 0 && <div><dt className="text-sm text-slate-600">Correct when tried again later</dt><dd className="mt-1 font-semibold">{g.retained} of {g.retentionChecks}</dd></div>}
          {g.assisted > 0 && <div><dt className="text-sm text-slate-600">Answers using help</dt><dd className="mt-1 font-semibold">{g.assisted}</dd></div>}
        </dl>
        {g.independent === 0 && <p className="mt-3 text-sm text-slate-500">No answers without help yet.</p>}
        {g.due > 0 && <p className="mt-4 text-sm text-slate-600">{g.due} questions due for review</p>}
        {g.medianSeconds !== null && <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer py-2">Answer time</summary><p className="mt-2">Middle time for correct answers without help: {g.medianSeconds} seconds. This is the median, not a speed target. Questions can differ in difficulty.</p></details>}
      </section>;
    })}

    <section className={panel} aria-label="Next practice">
      {data.activeSessionId ? <><p className="mb-3 text-sm text-slate-600">You have an unfinished session.</p><button disabled={busy} onClick={onResume} className={action}>{busy ? "Opening…" : "Continue practice →"}</button></> : <>
        <label className="block text-sm font-medium">Choose a section<select value={group} onChange={e => setGroup(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3 font-normal"><option value="">Let the app choose</option>{data.groups.map(g => { const label = learningSectionLabel(g.name); return <option key={g.id} value={g.id}>{label.paper ? `${label.paper} · ` : ""}{label.title}</option>; })}</select></label>
        {canStart ? <button disabled={busy} onClick={() => onPractice(group || undefined)} className={`${action} mt-4`}>{busy ? "Opening…" : "Start practice →"}</button> : <p role="status" className="mt-3 text-sm text-slate-500">No new questions or reviews are ready {group ? "for this section " : ""}right now. Choose another section or check back later.</p>}
      </>}
    </section>

    {data.recent.length > 0 && <details className={panel}><summary className="cursor-pointer text-sm font-medium">Recent answers</summary><ul className="mt-3 divide-y divide-slate-100">{data.recent.map(e => <li key={e.id} className="py-3 text-sm"><span className="font-medium">{e.correct === null ? "Skipped" : e.correct ? "Correct" : "Needs review"}</span> · {learningSectionLabel(e.groupName).title}<p className="mt-1 text-xs text-slate-500">{new Date(e.at).toLocaleDateString()} · {e.assisted ? "Used help" : "Without help"} · {e.repeated ? "Tried before" : "New in your saved history"}</p></li>)}</ul></details>}

    <details className="border-t border-slate-200 pt-2 text-sm text-slate-600"><summary className="cursor-pointer py-3 font-medium">How this works</summary><ul className="list-disc space-y-2 pl-5 leading-6">
      <li>“New” means not previously recorded in this app or your imported history. We cannot tell what you studied elsewhere.</li>
      <li>New-question results are part of “All answers without help”, not a separate total.</li>
      <li>Later checks are attempts made at least a day afterwards.</li>
      <li>Section results do not show that you know every topic. Missing results mean there is not enough data—not that you are weak at it.</li>
      <li>Review dates and speed targets are adjustable app rules, not proven exam-score predictions.</li>
    </ul></details>
  </>;
}
