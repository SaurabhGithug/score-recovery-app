"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { LessonPanel } from "@/components/standards/LessonPanel";
import { StandardsChat } from "@/components/standards/StandardsChat";
import { api, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronIcon, ClockIcon, type Clause, type LangCode, type Lesson, type StandardInfo } from "@/components/standards/shared";

interface StandardData { standard: StandardInfo; clauses: Clause[]; lessons: Record<string, Lesson> }

const isFront = (c: Clause) => c.clause_no.toLowerCase() === "nf" || c.clause_no.toLowerCase() === "intro";

/** The clause's name as the learner reads it: the front matter has a fixed (translated) name; every other unit uses its own title. */
function clauseName(c: Clause, t: ReturnType<typeof useLang>["t"]): string {
  const k = c.clause_no.toLowerCase();
  if (k === "nf") return t({ en: "National Foreword (BIS)", hi: "राष्ट्रीय प्रस्तावना (BIS)" });
  if (k === "intro") return t({ en: "Introduction", hi: "प्रस्तावना" });
  return c.title;
}

function depthOf(c: Clause, byNo: Map<string, Clause>): number {
  let d = 0;
  let p = c.parent_no;
  while (p && byNo.has(p) && d < 6) { d++; p = byNo.get(p)!.parent_no; }
  return d;
}

const SUB_CLAUSE = /^((?:\d+|[A-Z])(?:\.\d+)+)(?=\s)/;
const ASIDE = /^(NOTE|EXAMPLE)\b|^Note \d|^\[SOURCE/i;
const LIST_ITEM = /^(?:[a-z]|\d{1,2})\)\s|^[-•]\s/;

/** The standard's own words, large and calm. Notes and examples are quieter; sub-clause numbers are marked so they can be found at a glance. */
function BodyText({ body }: { body: string }) {
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return (
    <div className="space-y-5">
      {paras.map((p, i) => {
        if (ASIDE.test(p)) return <p key={i} className="whitespace-pre-wrap break-words text-base leading-7 text-slate-600">{p}</p>;
        const no = p.match(SUB_CLAUSE)?.[1];
        return (
          <p key={i} className={`whitespace-pre-wrap break-words text-lg leading-[1.75] text-slate-900 ${LIST_ITEM.test(p) ? "pl-6" : ""}`}>
            {no ? <><span className="font-semibold tabular-nums text-slate-500">{no}</span>{p.slice(no.length)}</> : p}
          </p>
        );
      })}
    </div>
  );
}

const quietButton = "rounded-xl border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white";

export default function StandardStudyPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang: siteLang } = useLang();
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? "";
  // The lesson follows the site language until the learner picks one under the lesson's Options.
  const [langChoice, setLangChoice] = useState<LangCode | null>(null);
  const lang: LangCode = langChoice ?? (siteLang === "hi" ? "hi" : "en");
  const [data, setData] = useState<StandardData | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [learned, setLearned] = useState<string[]>([]);
  const [busyClause, setBusyClause] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState("");
  const [contentsOpen, setContentsOpen] = useState(false);
  const pollStart = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentsButton = useRef<HTMLButtonElement>(null);
  const contentsPanel = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const load = useCallback(async () => {
    const d = await api<StandardData>(`/api/standards/${encodeURIComponent(id)}?lang=${lang}`);
    setData(d);
    return d;
  }, [id, lang]);

  const start = useCallback(() => {
    void Promise.resolve().then(load).then(d => {
      setSelected(prev => {
        if (prev) return prev;
        const hash = typeof window !== "undefined" ? decodeURIComponent(window.location.hash).replace(/^#cl-/, "") : "";
        return d.clauses.find(c => c.clause_no === hash)?.clause_no ?? d.clauses[0]?.clause_no ?? null;
      });
    }).catch(e => setError(e instanceof Error ? e.message : "Could not load the standard."));
  }, [load]);
  useEffect(() => { start(); }, [start]);

  // Learned marks live in this browser only.
  const storageKey = `standards-learned:${userId}:${id}`;
  useEffect(() => {
    if (!userId) return;
    // Read after mount (localStorage is browser-only), outside the effect body.
    void Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        setLearned(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
      } catch { setLearned([]); }
    });
  }, [storageKey, userId]);
  function toggleLearned(no: string) {
    setLearned(prev => {
      const next = prev.includes(no) ? prev.filter(x => x !== no) : [...prev, no];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }

  // Lesson checks run server-side: refresh every 5 s while any is pending (about 3 minutes at most).
  const anyPending = data ? Object.values(data.lessons).some(l => l.check?.status === "pending") : false;
  useEffect(() => {
    if (!anyPending) { pollStart.current = null; return; }
    pollStart.current ??= Date.now();
    const timer = setInterval(() => {
      if (Date.now() - (pollStart.current ?? Date.now()) > 180_000) { clearInterval(timer); return; }
      load().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [anyPending, load]);

  const clauses = useMemo(() => [...(data?.clauses ?? [])].sort((a, b) => a.ord - b.ord), [data]);
  const byNo = useMemo(() => new Map(clauses.map(c => [c.clause_no, c])), [clauses]);
  const index = clauses.findIndex(c => c.clause_no === selected);
  const clause = index >= 0 ? clauses[index] : null;
  const lesson = clause ? data?.lessons[clause.clause_no] : undefined;

  function select(no: string) {
    moved.current = true;
    setSelected(no);
    setLessonError("");
    setContentsOpen(false);
    try { history.replaceState(null, "", `#cl-${encodeURIComponent(no)}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }
  // After the learner moves to another clause, keyboard and screen-reader focus follows to its heading.
  useEffect(() => {
    if (moved.current) { moved.current = false; headingRef.current?.focus({ preventScroll: true }); }
  }, [selected]);

  // Opening the contents puts focus on the current clause (and scrolls the list to it); Escape closes it again.
  useEffect(() => {
    if (contentsOpen) contentsPanel.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [contentsOpen]);

  async function teach(regenerate: boolean) {
    if (!clause || busyClause) return;
    const no = clause.clause_no;
    setBusyClause(no); setLessonError("");
    try {
      const l = await api<Lesson>(`/api/standards/${encodeURIComponent(id)}/lesson`, { clauseNo: no, regenerate, lang });
      setData(d => d ? { ...d, lessons: { ...d.lessons, [no]: l } } : d);
    } catch (e) {
      setLessonError(e instanceof Error ? e.message : "Could not write the lesson.");
    } finally { setBusyClause(null); }
  }

  const shell = "mx-auto w-full max-w-[38rem] px-4 pb-16 pt-2";
  const backToLearn = <Link href="/learn" className="text-base font-medium text-blue-700 underline">{t({ en: "Back to Learn", hi: "सीखें पर वापस" })}</Link>;
  if (error) {
    return (
      <main className="flex-1 bg-white"><div className={`${shell} pt-6`}>
        <p role="alert" className="text-base text-rose-700">{error}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <button type="button" onClick={() => { setError(""); start(); }} className={`min-h-11 px-5 text-base font-semibold ${quietButton}`}>{t({ en: "Try again", hi: "फिर कोशिश करें" })}</button>
          {backToLearn}
        </div>
      </div></main>
    );
  }
  if (!data) return <main className="flex-1 bg-white"><div className={`${shell} pt-6`}><p role="status" className="text-base text-slate-600">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</p></div></main>;

  const learnedCount = clauses.filter(c => learned.includes(c.clause_no)).length;
  const isLearned = clause ? learned.includes(clause.clause_no) : false;

  return (
    <main className="flex-1 bg-white">
      <div className={shell} onKeyDown={e => { if (e.key === "Escape" && contentsOpen) { setContentsOpen(false); contentsButton.current?.focus(); } }}>
        {/* Slim top line: back, where you are, contents, test. */}
        <div className="flex items-center">
          <Link href="/learn" aria-label={t({ en: "Back to Learn", hi: "सीखें पर वापस" })} className="-ml-3 grid size-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"><ArrowLeftIcon /></Link>
          {clause && <p className="text-sm tabular-nums text-slate-600"><span className="sr-only">{t({ en: "Clause", hi: "क्लॉज़" })} </span>{index + 1} / {clauses.length}</p>}
          <div className="ml-auto flex items-center">
            <button ref={contentsButton} type="button" onClick={() => setContentsOpen(o => !o)} aria-expanded={contentsOpen} aria-controls="contents-panel" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {t({ en: "Contents", hi: "विषय-सूची" })}
              <ChevronIcon className={`h-4 w-4 ${contentsOpen ? "-rotate-90" : "rotate-90"}`} />
            </button>
            <Link href={`/standards/${encodeURIComponent(id)}/test`} className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-blue-700 hover:bg-blue-50"><ClockIcon className="h-4 w-4" />{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</Link>
          </div>
        </div>

        {contentsOpen && (
          <div id="contents-panel" ref={contentsPanel} className="mt-1 max-h-[min(26rem,65vh)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50 pb-1">
            <p className="sticky top-0 bg-slate-50 px-4 pb-2 pt-3 text-sm tabular-nums text-slate-600">{t({ en: `${learnedCount} of ${clauses.length} learned`, hi: `${clauses.length} में से ${learnedCount} सीखे` })}</p>
            <nav aria-label={t({ en: "Contents", hi: "विषय-सूची" })}>
              <ul>
                {clauses.map(c => (
                  <li key={c.clause_no}>
                    <button type="button" onClick={() => select(c.clause_no)} aria-current={c.clause_no === selected ? "true" : undefined} style={{ paddingLeft: `${1 + Math.min(depthOf(c, byNo), 3) * 0.75}rem` }} className={`flex min-h-11 w-full items-center gap-2 pr-4 text-left text-base leading-6 ${c.clause_no === selected ? "bg-blue-50 font-semibold text-blue-900" : "text-slate-800 hover:bg-white"}`}>
                      <span className="min-w-0 flex-1 break-words">{isFront(c) ? "" : <span className="tabular-nums text-slate-500">{c.clause_no} </span>}{clauseName(c, t)}</span>
                      {learned.includes(c.clause_no) && <><CheckIcon className="h-4 w-4 text-emerald-700" /><span className="sr-only">{t({ en: "learned", hi: "सीख लिया" })}</span></>}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}

        {clause ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="mt-4 break-words text-2xl font-semibold leading-snug tracking-tight text-slate-900 outline-none sm:text-[1.75rem]">
              {!isFront(clause) && <span className="mr-2 tabular-nums text-slate-400">{clause.clause_no}</span>}{clauseName(clause, t)}
            </h1>
            {clause.page != null && <p className="mt-1 text-sm text-slate-600">{t({ en: `Page ${clause.page}`, hi: `पृष्ठ ${clause.page}` })}</p>}

            <div className="mt-6">
              {clause.body.trim()
                ? <BodyText body={clause.body} />
                : <p className="text-base leading-7 text-slate-600">{t({ en: "This heading has no text of its own; see its sub-clauses.", hi: "इस शीर्षक का अपना पाठ नहीं है; उप-क्लॉज़ देखें।" })}</p>}
            </div>

            <div className="mt-10">
              <LessonPanel key={clause.clause_no} lesson={lesson} lang={lang} onLang={setLangChoice} writing={busyClause === clause.clause_no} otherWriting={busyClause !== null && busyClause !== clause.clause_no} error={lessonError} onExplain={regenerate => void teach(regenerate)} />
            </div>

            <nav aria-label={t({ en: "Move between clauses", hi: "क्लॉज़ बदलें" })} className="mt-10 flex gap-2">
              <button type="button" disabled={index <= 0} onClick={() => select(clauses[index - 1].clause_no)} aria-label={t({ en: "Previous clause", hi: "पिछला क्लॉज़" })} className={`grid size-12 shrink-0 place-items-center ${quietButton}`}><ArrowLeftIcon /></button>
              <button type="button" onClick={() => toggleLearned(clause.clause_no)} aria-pressed={isLearned} className={`flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-base font-medium leading-snug ${isLearned ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}>
                <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${isLearned ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-400"}`}>{isLearned && <CheckIcon className="h-3.5 w-3.5" />}</span>
                {isLearned ? t({ en: "Learned", hi: "सीख लिया" }) : t({ en: "Mark as learned", hi: "सीखा चिह्नित करें" })}
              </button>
              <button type="button" disabled={index >= clauses.length - 1} onClick={() => select(clauses[index + 1].clause_no)} className={`inline-flex min-h-12 shrink-0 items-center gap-2 px-4 text-base font-semibold ${quietButton}`}>{t({ en: "Next", hi: "अगला" })}<ArrowRightIcon className="h-5 w-5" /></button>
            </nav>

            <div className="mt-6">
              <StandardsChat key={id} standardId={id} clauseNo={clause.clause_no} lang={lang} />
            </div>
          </>
        ) : <p className="mt-6 text-base text-slate-600">{t({ en: "This standard has no clauses yet.", hi: "इस मानक में अभी कोई क्लॉज़ नहीं है।" })}</p>}
      </div>
    </main>
  );
}
