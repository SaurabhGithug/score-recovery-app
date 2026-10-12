"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import type { ActivityEvent, ActivityOverview, CoverageState, MadeEasyCoverage } from "@/lib/activity";
import type { Bilingual } from "@/lib/types";

const STATE: Record<CoverageState, { label: Bilingual; bar: string; dot: string }> = {
  correct: { label: { en: "Practised, right", hi: "अभ्यास, सही" }, bar: "bg-emerald-500", dot: "bg-emerald-500" },
  wrong: { label: { en: "Practised, wrong", hi: "अभ्यास, गलत" }, bar: "bg-rose-500", dot: "bg-rose-500" },
  viewed: { label: { en: "Only looked at", hi: "केवल देखा" }, bar: "bg-amber-400", dot: "bg-amber-400" },
  untouched: { label: { en: "Not touched", hi: "छुआ नहीं" }, bar: "bg-slate-200", dot: "bg-slate-300" },
};
const ORDER: CoverageState[] = ["correct", "wrong", "viewed", "untouched"];

const PAGES: Record<string, Bilingual> = {
  "/": { en: "Home", hi: "होम" }, "/learn": { en: "Learn", hi: "सीखें" }, "/papers": { en: "Tests", hi: "टेस्ट" },
  "/recovery-lab": { en: "Made Easy tests", hi: "Made Easy टेस्ट" }, "/dashboard": { en: "Progress", hi: "प्रगति" },
  "/syllabus": { en: "Syllabus", hi: "पाठ्यक्रम" }, "/calendar": { en: "Calendar", hi: "कैलेंडर" },
  "/marked": { en: "Marked questions", hi: "चिह्नित प्रश्न" }, "/activity": { en: "My activity", hi: "मेरी गतिविधि" },
  "/standards": { en: "Indian Standards", hi: "भारतीय मानक" }, "/library": { en: "Study documents", hi: "अध्ययन दस्तावेज़" },
};

const testName = (code: string) => `Made Easy ${code.replace(/^test-0?/, "Test ")}`;

function questionName(kind: string | null, id: string | null): string {
  if (!id) return "";
  const me = kind === "made_easy" ? id.match(/^(test-\d+)-q0?(\d+)$/) : null;
  if (me) return `${testName(me[1])} · Q${me[2]}`;
  return kind === "bank" ? `past-paper question ${id}` : id;
}

function pageName(path: string, t: (b: Bilingual) => string): string {
  const [pathname, query] = path.split("?");
  const test = pathname.match(/^\/recovery-lab\/(test-\d+)$/);
  if (test) return testName(test[1]);
  const base = PAGES[pathname] ?? PAGES[`/${pathname.split("/")[1]}`];
  const name = base ? t(base) : pathname;
  const tab = new URLSearchParams(query ?? "").get("tab");
  return tab ? `${name} · ${tab}` : name;
}

/** One line of the timeline, in the learner's language. */
function describe(e: ActivityEvent, t: (b: Bilingual) => string): string {
  const q = questionName(e.targetKind, e.targetId);
  const d = e.detail;
  switch (e.type) {
    case "page.view": return t({ en: `Opened ${pageName(e.targetId ?? "/", t)}`, hi: `${pageName(e.targetId ?? "/", t)} खोला` });
    case "auth.signin": return t({ en: "Signed in", hi: "साइन इन किया" });
    case "me.answer.view": return t({ en: `Looked at the answer of ${q}`, hi: `${q} का उत्तर देखा` });
    case "me.teach.open": return t({ en: `Opened "Teach me" for ${q}`, hi: `${q} के लिए "Teach me" खोला` });
    case "me.practice.start": return t({ en: `Started practising ${d.questions ?? ""} question(s) in ${testName(e.targetId ?? "")}`, hi: `${testName(e.targetId ?? "")} में ${d.questions ?? ""} प्रश्नों का अभ्यास शुरू किया` });
    case "me.practice.finish": return t({ en: `Finished practising in ${testName(e.targetId ?? "")}`, hi: `${testName(e.targetId ?? "")} का अभ्यास पूरा किया` });
    case "me.practice.leave": return t({ en: `Left practice in ${testName(e.targetId ?? "")} at question ${d.reached ?? "?"} of ${d.questions ?? "?"}`, hi: `${testName(e.targetId ?? "")} का अभ्यास ${d.questions ?? "?"} में से ${d.reached ?? "?"} पर छोड़ा` });
    case "me.practice.answer": return t({ en: `Practised ${q}: ${d.correct ? "right" : "wrong"} (chose ${d.selected ?? "?"}, ${d.seconds ?? "?"} s)`, hi: `${q} का अभ्यास: ${d.correct ? "सही" : "गलत"} (${d.selected ?? "?"} चुना, ${d.seconds ?? "?"} सेकंड)` });
    case "ai.followup.ask": return t({ en: `Asked the AI about ${q}${d.question ? `: "${d.question}"` : ""}`, hi: `${q} के बारे में AI से पूछा${d.question ? `: "${d.question}"` : ""}` });
    case "ai.studypack.open": return t({ en: `Opened topic study notes for ${q}`, hi: `${q} के विषय नोट्स खोले` });
    case "chatgpt.send": return t({ en: `Sent ${q} to ChatGPT`, hi: `${q} ChatGPT को भेजा` });
    case "mark.set": return t({ en: `Marked ${q} as ${String(d.level ?? "").replace("_", " ")}`, hi: `${q} को ${String(d.level ?? "").replace("_", " ")} चिह्नित किया` });
    case "mark.clear": return t({ en: `Removed the mark on ${q}`, hi: `${q} का निशान हटाया` });
    case "note.save": return t({ en: `Saved a revision note on ${q}`, hi: `${q} पर रिविज़न नोट सहेजा` });
    case "bank.attempt.start": return t({ en: `Started a past paper (${e.targetId}, ${d.mode ?? ""})`, hi: `पिछले वर्ष का पेपर शुरू किया (${e.targetId}, ${d.mode ?? ""})` });
    case "bank.attempt.submit": return t({ en: "Submitted a past-paper attempt", hi: "पिछले वर्ष के पेपर का प्रयास जमा किया" });
    default: return e.type;
  }
}

/** What this account has done in the app: Made Easy coverage first, then a timeline. Each account sees only its own. */
export default function ActivityPage() {
  const { currentUser } = useUser();
  return <ActivityView key={currentUser?.id ?? "guest"} />;
}

function ActivityView() {
  const { t, lang } = useLang();
  const [data, setData] = useState<ActivityOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/activity", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as ActivityOverview & { error?: string };
        if (!res.ok) throw new Error(body.error || "Could not load your activity.");
        setData(body);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load your activity."); });
    return () => controller.abort();
  }, []);

  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const days = new Map<string, ActivityEvent[]>();
  for (const e of data?.events ?? []) {
    const key = day(e.at);
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  return <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{t({ en: "My activity", hi: "मेरी गतिविधि" })}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{t({ en: "This app records what you do here (pages you open, questions you look at or practise, AI questions, marks, past papers) so you can see what is done and what is left. It stays in this app and is not shared.", hi: "यह ऐप यहाँ आपकी गतिविधि दर्ज करता है (खोले गए पेज, देखे या अभ्यास किए प्रश्न, AI से प्रश्न, निशान, पिछले पेपर), ताकि आप देख सकें कि क्या हो गया और क्या बाकी है। यह इसी ऐप में रहता है, साझा नहीं होता।" })}</p>
      {data?.trackingSince && <p className="mt-1 text-xs text-slate-500">{t({ en: `Recorded since ${day(data.trackingSince)}.`, hi: `${day(data.trackingSince)} से दर्ज।` })}{data.hiddenTestEvents > 0 && t({ en: ` ${data.hiddenTestEvents} actions from Claude's testing browser are not shown.`, hi: ` Claude के टेस्ट ब्राउज़र की ${data.hiddenTestEvents} गतिविधियाँ नहीं दिखाई गईं।` })}</p>}
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-slate-500">{t({ en: "Loading your activity…", hi: "गतिविधि लोड हो रही है…" })}</p>}

    {data?.coverage && <section aria-labelledby="coverage" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="coverage" className="font-semibold text-slate-900">{t({ en: "Made Easy: done and left", hi: "Made Easy: क्या हुआ, क्या बाकी" })}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t({ en: "For the questions saved from each test (the ones answered wrong or left in the test). Practice counts from 1 Oct 2026; drills done before that were kept only in the browser used.", hi: "हर टेस्ट से सहेजे गए प्रश्नों (टेस्ट में गलत या छोड़े गए) के लिए। अभ्यास 1 अक्टूबर 2026 से गिना जाता है; उससे पहले का अभ्यास केवल उसी ब्राउज़र में रहा।" })}</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label={t({ en: "Legend", hi: "संकेत" })}>
        {ORDER.map((s) => <li key={s} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATE[s].dot}`} />{t(STATE[s].label)}</li>)}
      </ul>
      <ul className="mt-4 divide-y divide-slate-100">
        {data.coverage.map((test) => <CoverageRow key={test.code} test={test} />)}
      </ul>
    </section>}

    {data && <section aria-labelledby="timeline" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="timeline" className="font-semibold text-slate-900">{t({ en: "Recent activity", hi: "हाल की गतिविधि" })}</h2>
      {data.events.length === 0 && <p className="mt-2 text-sm text-slate-500">{t({ en: "Nothing recorded yet.", hi: "अभी कुछ दर्ज नहीं हुआ।" })}</p>}
      {[...days.entries()].map(([label, events]) => <div key={label} className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
        <ol className="mt-2 space-y-1.5">
          {events.map((e) => <li key={e.id} className="flex gap-3 text-sm text-slate-700">
            <span className="w-12 shrink-0 tabular-nums text-slate-400">{time(e.at)}</span>
            <span className="min-w-0 break-words">{describe(e, t)}{e.client && <span className="ml-1 text-xs text-slate-400">· {e.client}</span>}</span>
          </li>)}
        </ol>
      </div>)}
      {data.events.length >= 300 && <p className="mt-3 text-xs text-slate-500">{t({ en: "Showing the latest 300 actions.", hi: "नवीनतम 300 गतिविधियाँ दिखाई जा रही हैं।" })}</p>}
    </section>}
  </main>;
}

function CoverageRow({ test }: { test: MadeEasyCoverage }) {
  const { t } = useLang();
  const total = test.questions.length;
  const left = test.questions.filter((q) => q.state === "untouched").map((q) => `Q${q.number}`);
  const wrong = test.questions.filter((q) => q.state === "wrong").map((q) => `Q${q.number}`);
  const done = test.counts.correct + test.counts.wrong;
  return <li className="py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Link href={`/recovery-lab/${test.code}`} className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline">{testName(test.code)} · {test.title}</Link>
      <span className="text-xs tabular-nums text-slate-600">{t({ en: `${done} of ${total} practised · ${test.counts.untouched} not touched`, hi: `${total} में से ${done} का अभ्यास · ${test.counts.untouched} छुए नहीं` })}</span>
    </div>
    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={ORDER.map((s) => `${t(STATE[s].label)}: ${test.counts[s]}`).join(", ")}>
      {ORDER.map((s) => test.counts[s] > 0 && <span key={s} className={STATE[s].bar} style={{ width: `${(100 * test.counts[s]) / total}%` }} />)}
    </div>
    {wrong.length > 0 && <p className="mt-2 text-xs text-rose-800">{t({ en: "Still wrong in practice:", hi: "अभ्यास में अब भी गलत:" })} {wrong.join(", ")}</p>}
    {left.length > 0 && left.length < total && <p className="mt-1 text-xs text-slate-600">{t({ en: "Left:", hi: "बाकी:" })} {left.join(", ")}</p>}
    {left.length === total && <p className="mt-1 text-xs text-slate-500">{t({ en: "No question from this test opened or practised yet.", hi: "इस टेस्ट का कोई प्रश्न अभी खोला या अभ्यास नहीं किया गया।" })}</p>}
  </li>;
}
