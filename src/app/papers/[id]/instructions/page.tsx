"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { BankPaperDetail } from "@/lib/bank/api-types";
import { BankApiRequestError, createAttempt, getPaper } from "@/components/bank/api";
import { useUser } from "@/lib/user-context";

type ContentLanguage = "en" | "hi";

export default function PaperInstructionsPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading instructions…</p>}><PaperInstructions /></Suspense>;
}

function PaperInstructions() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { currentUser, isLoading: userLoading, openProfileModal } = useUser();
  const mode = search.get("mode") === "section" ? "section" : "full";
  const requestedSection = search.get("section") ?? "";
  const [paper, setPaper] = useState<BankPaperDetail | null>(null);
  const [language, setLanguage] = useState<ContentLanguage>("en");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPaper(params.id)
      .then((value) => { if (!cancelled) setPaper(value); })
      .catch((err) => { if (!cancelled) setError(err instanceof BankApiRequestError ? err.message : "Could not load this test."); });
    return () => { cancelled = true; };
  }, [params.id]);

  const scope = useMemo(() => {
    if (!paper) return [];
    return mode === "section" ? paper.questions.filter((q) => q.section === requestedSection) : paper.questions;
  }, [mode, paper, requestedSection]);
  const durationMinutes = useMemo(() => {
    if (!paper || mode === "full") return paper?.paper.durationMinutes ?? 0;
    return Math.max(1, Math.round((paper.paper.durationMinutes * scope.length) / Math.max(1, paper.questions.length)));
  }, [mode, paper, scope.length]);
  const marking = paper?.paper.paper === "P2" ? { correct: 3, negative: 1 } : { correct: 1, negative: 0.25 };
  const maxMarks = scope.length * marking.correct;
  const canUseHindi = scope.some((q) => Boolean(q.translations?.hi));

  async function begin() {
    if (!paper || !agreed || busy) return;
    setBusy(true);
    setError("");
    try {
      const { attempt } = await createAttempt({
        paperId: paper.paper.id,
        mode,
        ...(mode === "section" ? { section: requestedSection } : {}),
      });
      router.push(`/papers/${paper.paper.id}/attempt/${attempt.id}?lang=${language}`);
    } catch (err) {
      setError(err instanceof BankApiRequestError ? err.message : "Could not start this test.");
      setBusy(false);
    }
  }

  if (!userLoading && !currentUser) {
    return <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"><p className="text-sm text-slate-600">Sign in before starting a test.</p><button type="button" onClick={openProfileModal} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Sign in</button></div>;
  }
  if (error && !paper) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center"><p className="text-sm font-medium text-rose-700">{error}</p><Link href="/papers" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back to tests</Link></div>;
  }
  if (!paper) return <p className="p-6 text-center text-sm text-slate-500">Loading instructions…</p>;
  if (mode === "section" && scope.length === 0) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center"><p className="text-sm font-medium text-rose-700">This section is not available in the selected test.</p><Link href="/papers" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back to tests</Link></div>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <Link href="/papers" className="text-sm font-semibold text-slate-600 hover:text-slate-950">← Back to tests</Link>
      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white sm:px-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">SSC JE Civil · {mode === "section" ? "Section test" : paper.paper.paper === "P2" ? "Paper II" : "Paper I"}</p>
          <h1 className="mt-2 text-xl font-black sm:text-2xl">{paper.paper.title}</h1>
          {mode === "section" && <p className="mt-1 text-sm text-slate-300">{requestedSection}</p>}
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white/10 p-3"><dt className="text-[11px] text-slate-300">Duration</dt><dd className="mt-1 font-black">{durationMinutes} min</dd></div>
            <div className="rounded-xl bg-white/10 p-3"><dt className="text-[11px] text-slate-300">Questions</dt><dd className="mt-1 font-black">{scope.length}</dd></div>
            <div className="rounded-xl bg-white/10 p-3"><dt className="text-[11px] text-slate-300">Maximum marks</dt><dd className="mt-1 font-black">{maxMarks}</dd></div>
          </dl>
        </header>

        <div className="space-y-7 p-5 sm:p-7">
          <section>
            <h2 className="text-lg font-black text-slate-950">General instructions</h2>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
              <li>The timer starts only after you select <strong>I am ready to begin</strong>. When it reaches zero, the test submits automatically.</li>
              <li>The question palette shows five states: not visited, not answered, answered, marked for review, and answered plus marked for review.</li>
              <li>Choosing an option does not save it. Use <strong>Save &amp; Next</strong> or <strong>Mark for Review &amp; Next</strong>. Navigating directly to another question discards an unsaved choice.</li>
              <li>A saved answer that is also marked for review is included in evaluation. An unanswered marked question is not.</li>
              <li>Use section tabs to move between sections. Only saved answers count when you submit.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-black text-slate-950">Question palette</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <Legend color="border-slate-300 bg-white" label="Not visited" />
              <Legend color="border-red-500 bg-red-500" label="Not answered" />
              <Legend color="border-emerald-600 bg-emerald-600" label="Answered" />
              <Legend color="border-violet-600 bg-violet-600" label="Marked for review" />
              <Legend color="border-violet-600 bg-violet-600" label="Answered and marked" dot />
            </div>
          </section>

          <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h2 className="font-black text-slate-950">Test-specific instructions</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              <li>Each question has one correct option.</li>
              <li>Correct answer: +{marking.correct} mark{marking.correct === 1 ? "" : "s"}; wrong answer: −{marking.negative}; unattempted: 0.</li>
              <li>{scope.length} questions must be completed in {durationMinutes} minutes.</li>
            </ul>
          </section>

          <div className="grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-end">
            <label className="text-sm font-semibold text-slate-700">Default question language
              <select value={language} onChange={(e) => setLanguage(e.target.value as ContentLanguage)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                <option value="en">English</option>
                {canUseHindi && <option value="hi">Hindi</option>}
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>I have read and understood all instructions. I am ready to begin the test.</span>
            </label>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
          <button type="button" onClick={() => void begin()} disabled={!agreed || busy} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
            {busy ? "Starting…" : "I am ready to begin"}
          </button>
        </div>
      </section>
    </main>
  );
}

function Legend({ color, label, dot = false }: { color: string; label: string; dot?: boolean }) {
  return <div className="flex items-center gap-3"><span className={`relative h-7 w-7 shrink-0 rounded-md border ${color}`}>{dot && <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white bg-emerald-300" />}</span><span className="text-slate-700">{label}</span></div>;
}
