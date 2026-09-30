"use client";

import Link from "next/link";
import type { MadeEasyTestCard } from "@/lib/madeeasy";

/** One card per Made Easy test; each opens that test's own page. */
export function MadeEasyTestCards({ tests }: { tests: MadeEasyTestCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tests.map((test) => (
        <li key={test.code}>
          <Link href={`/recovery-lab/${test.code}`} className="block h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{test.code.replace("test-", "Test ")}</span>
              <span className="font-mono text-sm font-black text-slate-900">{test.summary.score}/{test.summary.maxScore}</span>
            </div>
            <h3 className="mt-3 text-sm font-bold leading-5 text-slate-900">{test.title}</h3>
            <p className="mt-2 text-xs text-slate-500">{test.summary.accuracy}% accuracy · rank {test.summary.rank}/{test.summary.participants} · {test.summary.timeMinutes} min</p>
            <p className="mt-3 text-xs font-semibold text-slate-700">
              {test.counts.attention} to review · <span className="text-emerald-700">{test.counts.ready} ready to practise</span>
              {test.counts.needsSource > 0 && <span className="text-amber-700"> · {test.counts.needsSource} need the source</span>}
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-blue-700">Open test →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
