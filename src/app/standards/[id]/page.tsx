"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { LessonPanel } from "@/components/standards/LessonPanel";
import { StandardsChat } from "@/components/standards/StandardsChat";
import { api, type Clause, type LangCode, type Lesson, type StandardInfo } from "@/components/standards/shared";

interface StandardData { standard: StandardInfo; clauses: Clause[]; lessons: Record<string, Lesson> }

function clauseLabel(c: Clause, t: ReturnType<typeof useLang>["t"]): string {
  const k = c.clause_no.toLowerCase();
  if (k === "nf") return t({ en: "National Foreword (BIS)", hi: "राष्ट्रीय प्रस्तावना (BIS)" });
  if (k === "intro") return t({ en: "Introduction", hi: "प्रस्तावना" });
  return `${c.clause_no} ${c.title}`.trim();
}

function depthOf(c: Clause, byNo: Map<string, Clause>): number {
  let d = 0;
  let p = c.parent_no;
  while (p && byNo.has(p) && d < 6) { d++; p = byNo.get(p)!.parent_no; }
  return d;
}

function BodyText({ body }: { body: string }) {
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {paras.map((p, i) => /^NOTE\b/i.test(p)
        ? <p key={i} className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{p}</p>
        : <p key={i} className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{p}</p>)}
    </div>
  );
}

export default function StandardStudyPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang: siteLang } = useLang();
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? "";
  const [lang, setLang] = useState<LangCode>(siteLang === "hi" ? "hi" : "en");
  const [data, setData] = useState<StandardData | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [learned, setLearned] = useState<string[]>([]);
  const [busyClause, setBusyClause] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState("");
  const pollStart = useRef<number | null>(null);

  const load = useCallback(async () => {
    const d = await api<StandardData>(`/api/standards/${encodeURIComponent(id)}?lang=${lang}`);
    setData(d);
    return d;
  }, [id, lang]);

  useEffect(() => {
    void Promise.resolve().then(load).then(d => {
      setSelected(prev => {
        if (prev) return prev;
        const hash = typeof window !== "undefined" ? decodeURIComponent(window.location.hash).replace(/^#cl-/, "") : "";
        return d.clauses.find(c => c.clause_no === hash)?.clause_no ?? d.clauses[0]?.clause_no ?? null;
      });
    }).catch(e => setError(e instanceof Error ? e.message : "Could not load the standard."));
  }, [load]);

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
    setSelected(no);
    setLessonError("");
    try { history.replaceState(null, "", `#cl-${encodeURIComponent(no)}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }

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

  if (error) return <main className="mx-auto max-w-3xl px-4 py-6"><p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p><Link href="/standards" className="mt-3 inline-block text-sm text-blue-700 underline">{t({ en: "Back to standards", hi: "मानकों पर वापस" })}</Link></main>;
  if (!data) return <main className="mx-auto max-w-3xl px-4 py-6"><p role="status" className="text-sm text-slate-500">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</p></main>;

  const learnedCount = clauses.filter(c => learned.includes(c.clause_no)).length;
  const marker = (no: string) => learned.includes(no) ? "✓" : data.lessons[no] ? "•" : " ";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Link href="/standards" className="text-xs text-blue-700 underline">← {t({ en: "All standards", hi: "सभी मानक" })}</Link>
      <header className="mt-2">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{data.standard.code}</p>
        <h1 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">{data.standard.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t({ en: `Your progress: ${learnedCount} of ${clauses.length} clauses learned`, hi: `आपकी प्रगति: ${clauses.length} में से ${learnedCount} क्लॉज़ सीखे` })}</p>
        <Link href={`/standards/${encodeURIComponent(id)}/test`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"><span aria-hidden="true">⏱</span>{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</Link>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <label className="block lg:hidden">
            <span className="text-xs font-semibold text-slate-600">{t({ en: "Contents", hi: "विषय-सूची" })}</span>
            <select value={selected ?? ""} onChange={e => select(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
              {clauses.map(c => <option key={c.clause_no} value={c.clause_no}>{marker(c.clause_no)} {clauseLabel(c, t)}</option>)}
            </select>
          </label>
          <nav aria-label={t({ en: "Contents", hi: "विषय-सूची" })} className="hidden max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 lg:sticky lg:top-4 lg:block">
            <ul>
              {clauses.map(c => (
                <li key={c.clause_no}>
                  <button type="button" onClick={() => select(c.clause_no)} aria-current={c.clause_no === selected ? "true" : undefined} style={{ paddingLeft: `${0.5 + depthOf(c, byNo) * 0.75}rem` }} className={`flex w-full items-start gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs leading-5 ${c.clause_no === selected ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span aria-hidden="true" className={`mt-0.5 w-3 shrink-0 text-center ${learned.includes(c.clause_no) ? "text-emerald-600" : "text-violet-500"}`}>{marker(c.clause_no)}</span>
                    <span className="min-w-0 break-words">{clauseLabel(c, t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="min-w-0 space-y-4">
          {clause ? (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{t({ en: `Clause ${clause.clause_no}`, hi: `क्लॉज़ ${clause.clause_no}` })}{clause.page != null && <> · {t({ en: `page ${clause.page}`, hi: `पृष्ठ ${clause.page}` })}</>}</p>
                <h2 className="break-words text-lg font-bold text-slate-900">{clause.title}</h2>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{t({ en: "Text of the standard", hi: "मानक का पाठ" })}</p>
                  {clause.body.trim() ? <BodyText body={clause.body} /> : <p className="text-xs text-slate-500">{t({ en: "This heading has no text of its own; see its sub-clauses.", hi: "इस शीर्षक का अपना पाठ नहीं है; उप-क्लॉज़ देखें।" })}</p>}
                </div>
                <div className="mt-3 flex justify-between gap-2">
                  <button type="button" disabled={index <= 0} onClick={() => select(clauses[index - 1].clause_no)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-40">← {t({ en: "Previous", hi: "पिछला" })}</button>
                  <button type="button" disabled={index >= clauses.length - 1} onClick={() => select(clauses[index + 1].clause_no)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-40">{t({ en: "Next", hi: "अगला" })} →</button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">{t({ en: "Lesson", hi: "पाठ" })}</h2>
                  <div role="group" aria-label={t({ en: "Lesson language", hi: "पाठ की भाषा" })} className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
                    {(["en", "hi"] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`min-h-9 px-3 ${lang === l ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{l === "en" ? "English" : "हिंदी"}</button>)}
                  </div>
                </div>
                {busyClause === clause.clause_no ? (
                  <p role="status" className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-900">{t({ en: "Researching and writing the lesson… (up to a minute)", hi: "शोध करके पाठ लिखा जा रहा है… (एक मिनट तक)" })}</p>
                ) : lesson ? (
                  <LessonPanel lesson={lesson} busy={busyClause !== null} learned={learned.includes(clause.clause_no)} onRegenerate={() => void teach(true)} onToggleLearned={() => toggleLearned(clause.clause_no)} />
                ) : (
                  <div className="space-y-2">
                    <button type="button" onClick={() => void teach(false)} className="min-h-11 w-full rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white sm:w-auto">{t({ en: "Teach me this clause", hi: "यह क्लॉज़ मुझे सिखाइए" })}</button>
                    <div><button type="button" onClick={() => toggleLearned(clause.clause_no)} aria-pressed={learned.includes(clause.clause_no)} className="min-h-9 rounded-lg border border-emerald-600 px-3 text-xs font-medium text-emerald-700">{learned.includes(clause.clause_no) ? t({ en: "✓ Learned", hi: "✓ सीख लिया" }) : t({ en: "Mark as learned", hi: "सीखा हुआ चिह्नित करें" })}</button></div>
                  </div>
                )}
                {lessonError && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{lessonError}</p>}
              </section>

              <StandardsChat key={id} standardId={id} clauseNo={clause.clause_no} lang={lang} />
            </>
          ) : <p className="text-sm text-slate-500">{t({ en: "This standard has no clauses yet.", hi: "इस मानक में अभी कोई क्लॉज़ नहीं है।" })}</p>}
        </div>
      </div>
    </main>
  );
}
