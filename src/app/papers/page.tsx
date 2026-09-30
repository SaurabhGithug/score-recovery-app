"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BankPaperCode, BankPaperKind, BankPaperSummary, BankSection } from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { BankApiRequestError, createAttempt, getPaper, listPapers } from "@/components/bank/api";
import { MADE_EASY_IMPORT } from "@/lib/madeeasy";

type PaperFilter = "all" | BankPaperCode;
type SectionPickerState = BankSection[] | "loading" | "error";

export default function PapersPage() {
  return <Suspense fallback={<p className="p-6">Loading tests…</p>}><TestsPage /></Suspense>;
}

function TestsPage() {
  const { t } = useLang();
  const { currentUser, isLoading: userLoading, openProfileModal } = useUser();
  const router = useRouter();

  const params = useSearchParams();
  const view = params.get("view") === "past" ? "past" : "browse";
  const kind: BankPaperKind = params.get("kind") === "mock" ? "mock" : "pyp";
  function setKind(value: BankPaperKind) { router.replace(`/papers?kind=${value}`, { scroll: false }); }
  const [paperFilter, setPaperFilter] = useState<PaperFilter>("all");
  const [papers, setPapers] = useState<BankPaperSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sectionPicker, setSectionPicker] = useState<Record<string, SectionPickerState>>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      setPapers(null);
      setLoadError("");
      try {
        const res = await listPapers(view === "past" ? {} : { kind });
        if (!cancelled) setPapers(res.papers);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof BankApiRequestError ? err.message : "Could not load papers.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, view, currentUser, reloadToken]);

  const pastAttempts = useMemo(() => (papers ?? [])
    .flatMap(paper => paper.attempts.map(attempt => ({ paper, attempt })))
    .sort((a, b) => b.attempt.startedAt.localeCompare(a.attempt.startedAt)), [papers]);
  const finishedAttempts = pastAttempts.filter(({ attempt }) => attempt.submittedAt);
  const unfinishedAttempts = pastAttempts.filter(({ attempt }) => !attempt.submittedAt);

  const filtered = useMemo(() => {
    if (!papers) return [];
    return paperFilter === "all" ? papers : papers.filter((p) => p.paper === paperFilter);
  }, [papers, paperFilter]);

  const groups = useMemo(() => {
    if (kind !== "pyp") return [{ label: null as string | null, papers: filtered }];
    const byYear = new Map<string, BankPaperSummary[]>();
    for (const p of filtered) {
      const year = p.examDate ? p.examDate.slice(0, 4) : t({ en: "Undated", hi: "बिना तिथि" });
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(p);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([label, ps]) => ({
        label,
        papers: [...ps].sort((a, b) => (b.examDate ?? "").localeCompare(a.examDate ?? "")),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, kind]);

  async function start(paperId: string, mode: "full" | "practice") {
    setBusyId(paperId);
    setActionError("");
    try {
      const { attempt } = await createAttempt({ paperId, mode });
      router.push(`/papers/${paperId}/attempt/${attempt.id}`);
    } catch (err) {
      setActionError(err instanceof BankApiRequestError ? err.message : "Could not start this attempt.");
      setBusyId(null);
    }
  }

  async function toggleSectionPicker(paperId: string) {
    if (sectionPicker[paperId] !== undefined) {
      setSectionPicker((prev) => {
        const next = { ...prev };
        delete next[paperId];
        return next;
      });
      return;
    }
    setSectionPicker((prev) => ({ ...prev, [paperId]: "loading" }));
    try {
      const detail = await getPaper(paperId);
      setSectionPicker((prev) => ({ ...prev, [paperId]: detail.sections }));
    } catch {
      setSectionPicker((prev) => ({ ...prev, [paperId]: "error" }));
    }
  }

  async function startSection(paperId: string, section: string) {
    setBusyId(paperId);
    setActionError("");
    try {
      const { attempt } = await createAttempt({ paperId, mode: "section", section });
      router.push(`/papers/${paperId}/attempt/${attempt.id}`);
    } catch (err) {
      setActionError(err instanceof BankApiRequestError ? err.message : "Could not start this attempt.");
      setBusyId(null);
    }
  }

  if (!userLoading && !currentUser) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-slate-600">{t({ en: "Sign in to open the shared SSC JE Civil question bank.", hi: "साझा प्रश्न बैंक खोलने के लिए साइन इन करें।" })}</p>
        <button type="button" onClick={openProfileModal} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          {t({ en: "Sign in", hi: "साइन इन करें" })}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t({ en: "SSC JE Civil", hi: "SSC JE सिविल" })}</div>
      <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{t({ en: "Tests", hi: "टेस्ट" })}</h1>
      <nav aria-label="Tests pages" className="mt-5 flex gap-2 border-b border-slate-200 pb-3">
        <Link href="/papers" aria-current={view === "browse" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "browse" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t({ en: "Find a test", hi: "टेस्ट खोजें" })}</Link>
        <Link href="/papers?view=past" aria-current={view === "past" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "past" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t({ en: "My past tests", hi: "मेरे पिछले टेस्ट" })}</Link>
      </nav>
      {view === "past" ? <>
        <p className="mt-4 text-sm text-slate-600">Continue an unfinished test or review your answers from a completed test.</p>
        {loadError && <p role="alert" className="mt-4 text-sm text-rose-700">{loadError} <button type="button" onClick={() => setReloadToken(n => n + 1)} className="underline">Retry</button></p>}
        {!loadError && papers === null && <p className="mt-5 text-sm text-slate-500">Loading past tests…</p>}
        {!loadError && papers !== null && pastAttempts.length === 0 && <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="font-semibold text-slate-900">No test history yet</h2>
          <p className="mt-1 text-sm text-slate-600">Start a test and it will appear here.</p>
          <Link href="/papers" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Find a test →</Link>
        </section>}
        {!loadError && papers !== null && pastAttempts.length > 0 && <div className="mt-7 space-y-8">
          {unfinishedAttempts.length > 0 && <section aria-labelledby="continue-tests-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="continue-tests-heading" className="text-lg font-bold text-slate-950">Continue</h2>
              <span className="text-xs font-semibold text-slate-500">{unfinishedAttempts.length} active</span>
            </div>
            <ul className="mt-3 space-y-3">{unfinishedAttempts.map(({ paper, attempt }) => <li key={attempt.id} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-slate-950">{paper.title}</p>
              <p className="mt-1 text-sm text-slate-600">Started {new Date(attempt.startedAt).toLocaleDateString()}</p>
              <Link href={`/papers/${paper.id}/attempt/${attempt.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">Continue test →</Link>
            </li>)}</ul>
          </section>}

          <section aria-labelledby="imported-tests-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="imported-tests-heading" className="text-lg font-bold text-slate-950">Imported from Made Easy</h2>
              <span className="text-xs font-semibold text-slate-500">{MADE_EASY_IMPORT.tests.length} tests</span>
            </div>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">{MADE_EASY_IMPORT.tests.map((test) => {
              const attention = test.summary.incorrect + test.summary.unattempted;
              return <li key={test.code} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{test.code.replace("test-", "Test ")}</p>
                    <p className="mt-1 font-semibold leading-6 text-slate-950">{test.title}</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-bold text-slate-900">{test.summary.score}/{test.summary.maxScore}</p>
                </div>
                <p className="mt-3 text-sm text-slate-600">{test.summary.accuracy}% accuracy · {attention} need attention</p>
                <Link href={`/recovery-lab?test=${test.code}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 hover:text-blue-800">Review questions →</Link>
              </li>;
            })}</ul>
          </section>

          <section aria-labelledby="completed-tests-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="completed-tests-heading" className="text-lg font-bold text-slate-950">Completed</h2>
              {finishedAttempts.length > 0 && <span className="text-xs font-semibold text-slate-500">{finishedAttempts.length} finished</span>}
            </div>
            {finishedAttempts.length === 0 ? <p className="mt-2 text-sm text-slate-600">No completed tests yet.</p> : <ul className="mt-3 space-y-3">{finishedAttempts.map(({ paper, attempt }) => <li key={attempt.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-950">{paper.title}</p>
              <p className="mt-1 text-sm text-slate-600">{new Date(attempt.startedAt).toLocaleDateString()} · {attempt.score ?? "—"}/{attempt.maxScore ?? "—"}</p>
              <Link href={`/papers/attempts/${attempt.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 hover:text-blue-800">Review answers →</Link>
            </li>)}</ul>}
          </section>
        </div>}
      </> : <>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="w-fit cursor-pointer py-1">{t({ en: "Manage questions", hi: "प्रश्न प्रबंधन" })}</summary>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/recovery-lab/testbook/import" className="py-1 underline">{t({ en: "Import questions", hi: "प्रश्न इम्पोर्ट करें" })}</Link>
          <Link href="/recovery-lab/testbook/catalogue" className="py-1 underline">{t({ en: "Import status", hi: "इम्पोर्ट स्थिति" })}</Link>
        </div>
      </details>

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {(["pyp", "mock"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-lg border px-3.5 py-2 text-sm font-semibold ${kind === k ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}
          >
            {k === "pyp" ? t({ en: "Previous-year papers", hi: "पिछले वर्षों के पेपर" }) : t({ en: "Mock tests", hi: "मॉक टेस्ट" })}
          </button>
        ))}
        <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold sm:ml-auto">
          {(["all", "P1", "P2"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPaperFilter(p)}
              aria-pressed={paperFilter === p}
              className={`px-2.5 py-2 ${paperFilter === p ? "bg-slate-900 text-white" : "text-slate-500"}`}
            >
              {p === "all" ? t({ en: "All", hi: "सभी" }) : p}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{actionError}</div>
      )}

      {loadError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
          <button type="button" onClick={() => setReloadToken((n) => n + 1)} className="ml-2 font-semibold underline">
            {t({ en: "Retry", hi: "पुनः प्रयास करें" })}
          </button>
        </div>
      )}

      {!loadError && papers === null && (
        <div className="mt-8 text-center text-sm text-slate-400">{t({ en: "Loading papers…", hi: "पेपर लोड हो रहे हैं…" })}</div>
      )}

      {!loadError && papers !== null && filtered.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            {t({
              en: "No imported tests match this view. Import your test questions to practise here.",
              hi: "अभी यहाँ कोई पेपर नहीं है। पेपर तब जुड़ते हैं जब उन्हें किसी स्रोत से इम्पोर्ट किया जाता है — यहाँ कुछ भी प्लेसहोल्डर नहीं है।",
            })}
          </p>
          <Link href="/recovery-lab/testbook/import" className="mt-3 inline-block text-sm font-semibold text-blue-700 underline">
            {t({ en: "Add answer sources →", hi: "जवाब का स्रोत जोड़ें →" })}
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.label ?? "all"}>
            {group.label && <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{group.label}</h2>}
            <div className="flex flex-col gap-3">
              {group.papers.map((p) => (
                <PaperCard
                  key={p.id}
                  paper={p}
                  busy={busyId === p.id}
                  sectionState={sectionPicker[p.id]}
                  onFull={() => start(p.id, "full")}
                  onPractice={() => start(p.id, "practice")}
                  onToggleSections={() => toggleSectionPicker(p.id)}
                  onPickSection={(section) => startSection(p.id, section)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** True when the title already names this ISO date ("2019-09-23" as "23 Sep 2019"). */
function titleHasDate(title: string, iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? title.includes(`${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`) : title.includes(iso);
}

/** True when the title already names the paper ("P1" as "Paper-I"). */
function titleHasPaper(title: string, paper: string): boolean {
  const roman = paper === "P1" ? "Paper-I" : paper === "P2" ? "Paper-II" : paper;
  return new RegExp(`${roman.replace(/[-]/g, "[- ]?")}(?![I])`, "i").test(title) || title.includes(paper);
}

function PaperCard({
  paper,
  busy,
  sectionState,
  onFull,
  onPractice,
  onToggleSections,
  onPickSection,
}: {
  paper: BankPaperSummary;
  busy: boolean;
  sectionState: SectionPickerState | undefined;
  onFull: () => void;
  onPractice: () => void;
  onToggleSections: () => void;
  onPickSection: (section: string) => void;
}) {
  const { t } = useLang();
  const notScored = paper.questionCount - paper.scoredCount;
  const lastAttempt = paper.attempts.find((a) => a.submittedAt) ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{paper.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {[
              paper.cycleYear ? t({ en: `JE ${paper.cycleYear} cycle`, hi: `JE ${paper.cycleYear} चक्र` }) : null,
              // Only what the title does not already say: PYP titles carry the paper, date and shift.
              paper.examDate && !titleHasDate(paper.title, paper.examDate) ? `${t({ en: "Exam held", hi: "परीक्षा तिथि" })} ${paper.examDate}` : null,
              paper.shift && !paper.title.includes(paper.shift) ? paper.shift : null,
              !titleHasPaper(paper.title, paper.paper) ? paper.paper : null,
            ].filter(Boolean).map((part, i) => (
              <span key={i} className="flex items-center gap-x-2">
                {i > 0 && <span className="text-slate-300">·</span>}
                {part}
              </span>
            ))}
          </div>
        </div>
        <span className="max-w-full rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {paper.publisher}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        <span>{paper.questionCount} {t({ en: "questions", hi: "प्रश्न" })}</span>
        <span className="text-slate-300">·</span>
        <span>{paper.languages.map((l) => l.toUpperCase()).join("/")}</span>
        <span className="text-slate-300">·</span>
        <span>{paper.scoredCount} {t({ en: "scored", hi: "स्कोर होंगे" })}</span>
        {notScored > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            {notScored} {t({ en: "not scored (disputed / no key)", hi: "स्कोर नहीं (विवादित / कोई कुंजी नहीं)" })}
          </span>
        )}
      </div>

      {lastAttempt && (
        <div className="mt-2 text-xs font-medium text-slate-600">
          {t({ en: "Last attempt:", hi: "अंतिम प्रयास:" })} {lastAttempt.score ?? "—"}/{lastAttempt.maxScore ?? "—"}
          <Link href={`/papers/attempts/${lastAttempt.id}`} className="ml-2 inline-block rounded-md px-2 py-1 font-semibold text-blue-700 underline">{t({ en: "See answers and solutions", hi: "जवाब और हल देखें" })}</Link>
          {(lastAttempt.priorExposure ?? 0) > 0 && (
            <span className="ml-1 text-amber-700">
              {t({ en: `(repeat: ${lastAttempt.priorExposure} answers seen before)`, hi: `(दोहराया: ${lastAttempt.priorExposure} उत्तर पहले देखे)` })}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onFull} className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60">
          {t({ en: `Full paper (${paper.durationMinutes} min)`, hi: `पूरा पेपर (${paper.durationMinutes} मिनट)` })}
        </button>
        <button type="button" disabled={busy} onClick={onToggleSections} className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 disabled:opacity-60">
          {t({ en: "Section-wise", hi: "खंड-वार" })}
        </button>
        <button type="button" disabled={busy} onClick={onPractice} className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 disabled:opacity-60">
          {t({ en: "Practice (untimed)", hi: "अभ्यास (बिना समय-सीमा)" })}
        </button>
      </div>

      {sectionState !== undefined && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          {sectionState === "loading" && <span className="text-xs text-slate-400">{t({ en: "Loading sections…", hi: "खंड लोड हो रहे हैं…" })}</span>}
          {sectionState === "error" && <span className="text-xs font-medium text-rose-600">{t({ en: "Could not load sections.", hi: "खंड लोड नहीं हो सके।" })}</span>}
          {Array.isArray(sectionState) && (
            <div className="flex flex-wrap gap-1.5">
              {sectionState.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  disabled={busy}
                  onClick={() => onPickSection(s.name)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  {s.name} ({s.count})
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
