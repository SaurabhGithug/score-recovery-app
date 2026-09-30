"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/lib/user-context";
import type { MadeEasyOverview } from "@/lib/madeeasy";
import { getMadeEasyOverview, MadeEasyRequestError } from "@/components/madeeasy/api";
import { MadeEasyTestCards } from "@/components/madeeasy/MadeEasyTestCards";

/**
 * Made Easy tests: one card per test; each opens its own page (/recovery-lab/<code>) with that
 * test's questions and practice. Only the account the import belongs to can load it.
 */
export default function MadeEasyTestsPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading your Made Easy tests…</p>}><MadeEasyTests /></Suspense>;
}

function MadeEasyTests() {
  const router = useRouter();
  const param = useSearchParams().get("test");
  const requested = param && /^test-\d{1,3}$/.test(param) ? param : null;
  const { currentUser, isLoading, openProfileModal } = useUser();
  const [overview, setOverview] = useState<MadeEasyOverview | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  // Older links (/recovery-lab?test=test-12) open that test's own page.
  useEffect(() => {
    if (requested) router.replace(`/recovery-lab/${requested}`);
  }, [requested, router]);

  useEffect(() => {
    if (!currentUser || requested) return;
    let live = true;
    getMadeEasyOverview().then(
      (o) => { if (live) setOverview(o); },
      (err) => { if (live) setError({ status: err instanceof MadeEasyRequestError ? err.status : 0, message: err instanceof Error ? err.message : String(err) }); }
    );
    return () => { live = false; };
  }, [currentUser, requested]);

  if (requested) return <p className="p-6 text-sm text-slate-500">Opening the test…</p>;
  if (isLoading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!currentUser) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Sign in to open your Made Easy tests.</p>
        <button type="button" onClick={openProfileModal} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign in</button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm font-medium text-slate-700">{error.status === 403 ? "These Made Easy results belong to another account." : error.message}</p>
        <Link href="/papers" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline">Back to tests</Link>
      </div>
    );
  }
  if (!overview) return <p className="p-6 text-sm text-slate-500">Loading your Made Easy tests…</p>;

  const totals = overview.tests.reduce(
    (t, test) => ({ attention: t.attention + test.counts.attention, ready: t.ready + test.counts.ready, needsSource: t.needsSource + test.counts.needsSource }),
    { attention: 0, ready: 0, needsSource: 0 }
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-7">
      <Link href="/papers?view=past" className="text-xs font-semibold text-blue-700">← My results</Link>
      <p className="mt-3 text-sm text-slate-500">{overview.provider} · {overview.series} · saved {overview.capturedOn}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Your Made Easy tests</h1>
      <p className="mt-2 text-sm text-slate-600">
        {totals.attention} questions you got wrong or left: {totals.ready} ready to practise
        {totals.needsSource > 0 ? `, ${totals.needsSource} still need their table or figure from Made Easy` : ""}. Open a test to review and practise it.
      </p>
      <a href={overview.portalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-slate-600 underline">Open on Made Easy ↗</a>
      <div className="mt-6">
        <MadeEasyTestCards tests={overview.tests} />
      </div>
    </div>
  );
}
