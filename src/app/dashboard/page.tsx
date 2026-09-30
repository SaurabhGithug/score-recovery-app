"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { getLedger, listAttempts, listReports } from "@/lib/storage";
import type { Attempt, ErrorLedgerEntry, RecoveryReport } from "@/lib/types";
import { ExamProfileModal } from "@/components/ExamProfileModal";
import { ExamResourcesModal } from "@/components/ExamResourcesModal";
import { useUser } from "@/lib/user-context";

type ResourceTab = "syllabus" | "notification" | "pattern";

export default function DashboardPage() {
  const { currentUser, activeContext } = useUser();
  return <ProgressDashboard key={`${currentUser?.id ?? "guest"}:${activeContext?.id ?? "none"}`} />;
}

function ProgressDashboard() {
  const { t } = useLang();
  const { currentUser, activeContext, openOnboardingModal } = useUser();
  const [records, setRecords] = useState<{ attempts: Attempt[]; reports: RecoveryReport[]; ledger: ErrorLedgerEntry[] } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [resourceTab, setResourceTab] = useState<ResourceTab | null>(null);
  const refresh = useCallback(() => {
    const uid = currentUser?.id;
    const cid = activeContext?.id;
    setRecords({
      attempts: listAttempts(uid, cid).sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")),
      reports: listReports(uid, cid),
      ledger: getLedger(uid, cid),
    });
  }, [currentUser?.id, activeContext?.id]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) refresh(); });
    window.addEventListener("storage", refresh);
    window.addEventListener("user-profile-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("user-profile-changed", refresh);
    };
  }, [refresh]);

  const submitted = records?.attempts.filter(a => a.submittedAt) ?? [];
  const reportByAttempt = new Map(records?.reports.map(r => [r.attemptId, r]));
  const latestReport = submitted.length ? reportByAttempt.get(submitted[0].id) : undefined;
  const openTopics = records?.ledger.filter(e => e.occurrences > e.resolvedCount)
    .sort((a, b) => (b.occurrences - b.resolvedCount) - (a.occurrences - a.resolvedCount)) ?? [];
  const quietButton = "min-h-11 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600";

  return <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
    <header>
      <p className="text-sm text-slate-500">{activeContext?.name || "SSC JE · Civil Engineering"}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{t({ en: "My progress", hi: "मेरी प्रगति" })}</h1>
    </header>

    <section aria-labelledby="next-step" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="next-step" className="text-xl font-semibold text-slate-900">{t({ en: "One step at a time", hi: "एक समय में एक कदम" })}</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">{t({ en: "Practise questions and review your mistakes.", hi: "सवालों का अभ्यास करें और अपनी गलतियाँ समझें।" })}</p>
      <Link href="/learn" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto">{t({ en: "Go to learning →", hi: "पढ़ाई शुरू करें →" })}</Link>
    </section>

    <section aria-labelledby="recorded-progress" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      {/* Only results kept in this browser. Tests and Learn results are under My results (/papers?view=past), which links here. */}
      <h2 id="recorded-progress" className="font-semibold text-slate-900">{t({ en: "Older results saved in this browser", hi: "इस ब्राउज़र में सहेजे पुराने नतीजे" })}</h2>
      <Link href="/papers?view=past" className="mt-1 inline-flex min-h-11 items-center text-sm text-slate-600 underline">{t({ en: "Tests and Learn results are in My results", hi: "टेस्ट और सीखें के नतीजे मेरे परिणाम में हैं" })}</Link>
      {!records ? <p role="status" className="mt-3 text-sm text-slate-500">{t({ en: "Loading results…", hi: "नतीजे लोड हो रहे हैं…" })}</p> : submitted.length === 0 ? <p className="mt-2 text-sm leading-relaxed text-slate-500">{t({ en: "No results saved here yet for your account and study goal.", hi: "इस डिवाइस पर आपके खाते और पढ़ाई के लक्ष्य के लिए अभी कोई नतीजा नहीं है।" })}</p> : <>
        <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
          <div><p className="text-xs text-slate-500">{t({ en: "Completed", hi: "पूर्ण" })}</p><p className="mt-1 text-2xl font-semibold">{submitted.length}</p></div>
          {latestReport && <div><p className="text-xs text-slate-500">{t({ en: "Last score", hi: "पिछला स्कोर" })}</p><p className="mt-1 text-2xl font-semibold">{latestReport.score.totalMarks} <span className="text-sm font-normal text-slate-500">/ {latestReport.score.maxMarks}</span></p></div>}
        </div>
        <p className="mt-3 text-xs text-slate-500">{t({ en: "These are short practice-test results saved on this device, not all your mock tests or an estimate of your exam score.", hi: "ये इस डिवाइस पर सहेजे गए छोटे अभ्यास टेस्ट के नतीजे हैं—सभी मॉक टेस्ट या परीक्षा के स्कोर का अनुमान नहीं।" })}</p>
        <div className="mt-4 border-t border-slate-100 pt-1">
          <ul className="divide-y divide-slate-100">{submitted.map(attempt => {
            const report = reportByAttempt.get(attempt.id);
            return <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div><p className="font-medium">{report ? `${report.score.totalMarks} / ${report.score.maxMarks}` : t({ en: "Report unavailable", hi: "रिपोर्ट उपलब्ध नहीं" })}</p><p className="text-xs text-slate-500">{new Date(attempt.submittedAt!).toLocaleDateString()}</p></div>
              {report && <Link href={`/results/${attempt.id}`} className={quietButton}>{t({ en: "View result →", hi: "परिणाम देखें →" })}</Link>}
            </li>;
          })}</ul>
        </div>
      </>}
      {openTopics.length > 0 && <details className="mt-4 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer py-2 text-sm font-medium text-slate-700">{t({ en: "Topics to practise", hi: "दोबारा पढ़ने के विषय" })}</summary>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">{openTopics.slice(0, 3).map(entry => <li key={`${entry.section}:${entry.concept}:${entry.cause}`}>{entry.concept}</li>)}</ul>
        <Link href="/dashboard/topics" className="mt-3 inline-flex min-h-11 items-center text-sm text-blue-700">{t({ en: "View all topics →", hi: "सभी विषय देखें →" })}</Link>
      </details>}
    </section>

    <details className="rounded-2xl border border-slate-200 bg-white px-5 sm:px-6">
      <summary className="cursor-pointer py-4 text-sm font-medium text-slate-700">{t({ en: "Exam details & settings", hi: "परीक्षा की जानकारी और सेटिंग्स" })}</summary>
      <div className="space-y-4 border-t border-slate-100 pb-5 pt-3">
        <div className="flex flex-col items-start">
          {([
            ["syllabus", "Syllabus", "पाठ्यक्रम"],
            ["notification", "Notification & eligibility", "अधिसूचना और पात्रता"],
            ["pattern", "Exam pattern & rules", "परीक्षा प्रारूप और नियम"],
          ] as const).map(([tab, en, hi]) => <button type="button" key={tab} onClick={() => setResourceTab(tab)} className={quietButton}>{t({ en, hi })}</button>)}
          <Link href="/papers" className={quietButton}>{t({ en: "Previous papers & mock tests →", hi: "पिछले प्रश्नपत्र और मॉक टेस्ट →" })}</Link>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <button type="button" onClick={() => setProfileOpen(true)} className={quietButton}>{t({ en: "Edit exam details", hi: "परीक्षा की जानकारी बदलें" })}</button>
          <button type="button" onClick={openOnboardingModal} className={quietButton}>{t({ en: "Change goal", hi: "लक्ष्य बदलें" })}</button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{t({ en: "Your target score is hidden until we correct the cutoff figures for your category.", hi: "आपकी श्रेणी के कटऑफ अंक ठीक होने तक लक्ष्य स्कोर नहीं दिखाया जाएगा।" })}</p>
        </div>
      </div>
    </details>

    <ExamProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    {resourceTab && <ExamResourcesModal key={resourceTab} isOpen onClose={() => setResourceTab(null)} initialTab={resourceTab} branch={activeContext?.branch || "civil"} />}
  </main>;
}
