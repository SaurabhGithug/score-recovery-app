import Link from "next/link";
import {
  capturedTestbookTests,
  capturedTestbookTotals,
  testbookCatalogueAudit,
  verifiedTestbookCatalogueItems,
} from "@/lib/testbook-catalogue";

const stateLabel = {
  attempted: "Attempted · solution accessible",
  available_unattempted: "Visible · not attempted",
  portal_hidden: "Not exposed by portal",
  portal_blocked: "Portal access blocked",
};

export default function TestbookCataloguePage() {
  return (
    <div className="min-h-full bg-slate-50 px-4 py-8">
      <main className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl bg-slate-950 p-7 text-white">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">SSC JE Civil · import status</div>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Testbook import status</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Catalogue listings and captured questions are separate. These capture counts are for Reema&apos;s local private bank, not the live deployment.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-3xl font-black">{testbookCatalogueAudit.liveHeaderTotal}</div><div className="text-xs text-slate-400">Tests shown by Testbook</div></div>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-3xl font-black">{testbookCatalogueAudit.requestedCategoryTotal}</div><div className="text-xs text-slate-400">Listings inventoried in the seven requested categories</div></div>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-3xl font-black">{capturedTestbookTotals.questions}</div><div className="text-xs text-slate-400">Questions saved</div></div>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-3xl font-black">{capturedTestbookTotals.verifiedSolutions}</div><div className="text-xs text-slate-400">Solutions from Testbook</div></div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-black">Questions saved locally</h2>
            <span className="font-bold">{capturedTestbookTotals.heldOut} not ready · nothing made up</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {capturedTestbookTests.map((test) => (
              <div key={test.id} className="rounded-xl border border-emerald-200 bg-white p-4">
                <div className="font-black text-slate-950">{test.title}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  {test.capturedQuestions} questions · {test.portalVerifiedSolutions} verified solutions · {test.heldOutQuestions} not ready
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 leading-6">All six saved tests passed question, answer, and solution checks. Question occurrences may overlap between a full paper and its technical-only version.</p>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <div className="font-black">Why this is not marked complete</div>
          <p className="mt-1">{testbookCatalogueAudit.integrityWarning}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">{testbookCatalogueAudit.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700 shadow-xs">
          <h2 className="text-lg font-black text-slate-950">What was found in the Testbook account</h2>
          <p className="mt-1">At the last authenticated catalogue check, the portal showed {testbookCatalogueAudit.observedProgress} attempted tests and {testbookCatalogueAudit.solutionAccessibleAttemptHistory} tests with a solution link in account-wide history. One further chapter test was submitted later; its solutions remain uncaptured because the session ended. A solution link is not counted as saved content: only the {capturedTestbookTests.length} tests listed above have complete captures.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-lg font-black">Test types shown by Testbook</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{testbookCatalogueAudit.categories.map((category) => <div key={category.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black">{category.liveCount}</div><div className="text-sm font-semibold text-slate-600">{category.name}</div></div>)}</div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-black">Sample cards from the live catalogue</h2><p className="mt-1 text-sm text-slate-500">A small sample is shown below; the full seven-category inventory has {testbookCatalogueAudit.requestedCategoryTotal} distinct test listings.</p></div>
          <div className="divide-y divide-slate-100">{verifiedTestbookCatalogueItems.map((item) => <div key={item.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center"><div><div className="font-bold text-slate-950">{item.title}</div><div className="mt-1 font-mono text-[11px] text-slate-500">{item.id} · {item.observedQuestions} questions · {item.observedMinutes} min</div></div><div className="text-xs font-bold text-slate-600">{stateLabel[item.state]}</div></div>)}</div>
        </section>

        <Link href="/recovery-lab/testbook" className="inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">← Back to learning bank</Link>
      </main>
    </div>
  );
}
