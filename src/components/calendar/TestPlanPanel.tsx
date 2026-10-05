"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import {
  SERIES_LABEL, addItem, askPending, clearOpened, isInternalLink, itemsOn, linkFor, markOpened, syncPreset,
  refreshFromPreset, removeItem, setResult, setStatus, setUrl, summarize, type PlanInput, type PlanItem, type PlanSeries,
} from "@/lib/calendar/test-plan";
import preset from "@/lib/calendar/pyq-plan-preset.json";

type Commit = (update: (current: PlanItem[]) => PlanItem[]) => void;
const PYQ_PRESET = preset.items as unknown as PlanInput[];
/** The version of the built-in plan; a saved plan updated from an older one is offered the update. */
const PRESET_BUILT = preset.built;
const SERIES_OPTIONS: PlanSeries[] = ["ies", "madeeasy", "app", "other"];
/** Series names short enough for a row's second line on a phone. */
const SHORT_SERIES: Record<PlanSeries, string> = { ies: "IES", madeeasy: "Made Easy", app: "This app", other: "To-do" };
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50";

/**
 * Opens in the SAME tab: built-in app browsers (and some phone browsers) silently block new tabs to other sites,
 * which made the button look dead. The "new tab" link is a second way for normal browsers.
 */
function TestLink({ item, onOpen, children, className, label }: { item: PlanItem; onOpen: () => void; children: React.ReactNode; className: string; label: string }) {
  const href = linkFor(item);
  if (!href) return null;
  if (isInternalLink(href)) return <Link href={href} onClick={onOpen} aria-label={label} className={className}>{children}</Link>;
  return <a href={href} onClick={onOpen} aria-label={label} className={className}>{children}</a>;
}

/** A second way in for normal browsers, kept out of the way in the row's details. */
function NewTabLink({ item, onOpen, children }: { item: PlanItem; onOpen: () => void; children: React.ReactNode }) {
  const href = linkFor(item);
  if (!href || isInternalLink(href)) return null;
  return <a href={href} target="_blank" rel="noreferrer" onClick={onOpen} className="text-xs font-medium text-slate-600 underline">{children}</a>;
}

/**
 * A row's title without its bracketed size, which is shown once on the line below:
 * "IES T38 Aggregates (93 Q, 60 min)" -> "IES T38 Aggregates" + "93 Q"; "Reasoning 3/3 (review, 10 min): ..." -> "Reasoning 3/3: ..." + "review".
 */
export function rowTitle(title: string): { text: string; size: string } {
  const m = /^(.*?) \(([^()]*\bmin)\)(.*)$/.exec(title);
  if (!m) return { text: title, size: "" };
  return { text: `${m[1]}${m[3]}`, size: m[2].replace(/,?\s*(?:about |in )?\d+ min$/, "").trim() };
}

/** A day's rows in the order they are done: mock, topic tests, passes, Made Easy, reasoning 1-3, GK, drill; your own rows last. */
const DAY_ORDER = [/^Full mock/, /^Analyse/, /^IES T/, /^Pass /, /^Made Easy subject/, /^Reasoning 1\/3/, /^Reasoning 2\/3/, /^Reasoning 3\/3/, /^GK\/CA/, /^Hot-topic drill/];
const dayRank = (item: PlanItem) => { const n = DAY_ORDER.findIndex((re) => re.test(item.title)); return n === -1 ? DAY_ORDER.length : n; };
const sortForDay = (rows: PlanItem[]) => rows.map((item, index) => ({ item, index })).sort((a, b) => dayRank(a.item) - dayRank(b.item) || a.index - b.index).map(({ item }) => item);

/** The learner's tests for the chosen day, with "Open test", "did you attempt it?" and progress. */
export function TestPlanPanel({ today, selected, onSelect, items, ready, saveFailed, commit, presetStamp, onPresetSynced }: {
  today: string; selected: string; onSelect: (date: string) => void;
  items: PlanItem[]; ready: boolean; saveFailed: boolean; commit: Commit;
  presetStamp: string | null; onPresetSynced: (built: string) => void;
}) {
  const { t, lang } = useLang();
  const [askReady, setAskReady] = useState(true);
  const [resultDraft, setResultDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  /** Neutral outcome of loading or updating the built-in plan (errors still go to `message`). */
  const [planNotice, setPlanNotice] = useState("");
  const [form,setForm] = useState({ title: "", series: "ies" as PlanSeries, url: "", minutes: "" });
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  /** The row whose details are open (one at a time keeps a phone screen short). */
  const [openRow, setOpenRow] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  /**
   * Taps in the panel are ignored until this time: just after the question appears or is answered, the layout moves under
   * the finger, and the second tap of a double tap would otherwise answer the next test or press whatever slid into place.
   */
  const ignoreTapsUntil = useRef(0);
  const holdTaps = () => { ignoreTapsUntil.current = performance.now() + 400; };

  // When the learner comes back from the test tab, ask whether they attempted it.
  useEffect(() => {
    const back = () => { if (document.visibilityState === "visible") setAskReady(true); };
    // "pageshow" covers coming Back to this page from the test (the browser may restore it from its cache).
    const shown = () => setAskReady(true);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    window.addEventListener("pageshow", shown);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); window.removeEventListener("pageshow", shown); };
  }, []);

  // Built-in rows saved earlier pick up fixes to the built-in plan (names, links, which rows have an Open button).
  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(() => {
      try { commit((current) => refreshFromPreset(current, PYQ_PRESET)); } catch { /* still loading */ }
    });
  }, [ready, commit]);

  async function copyName(item: PlanItem) {
    try { await navigator.clipboard.writeText(item.portalName); setCopied(item.id); setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 2000); } catch { setMessage(t({ en: "Could not copy. Select the name and copy it by hand.", hi: "कॉपी नहीं हो सका। नाम चुनकर हाथ से कॉपी करें।" })); }
  }
  const openLabel = (item: PlanItem) => item.url ? t({ en: "Open test ↗", hi: "टेस्ट खोलें ↗" })
    : item.series === "ies" ? t({ en: "Open IES My Tests ↗", hi: "IES के मेरे टेस्ट खोलें ↗" })
    : item.series === "madeeasy" ? t({ en: "Open Made Easy ↗", hi: "Made Easy खोलें ↗" })
    : t({ en: "Open in app ↗", hi: "ऐप में खोलें ↗" });

  const run = (update: (current: PlanItem[]) => PlanItem[]) => {
    try { commit(update); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
  };
  const now = () => new Date().toISOString();
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const dayTitle = new Date(`${selected}T00:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const dayItems = sortForDay(itemsOn(items, selected));
  const summary = summarize(items, today);
  const asking = askReady ? askPending(items)[0] : undefined;
  const preloaded = items.some((item) => item.id.startsWith("preset:"));
  // A plan loaded from an older built-in plan: say so, with the size of the change, until the learner updates.
  const pendingUpdate = useMemo(() => {
    if (!ready || !preloaded || presetStamp === PRESET_BUILT) return null;
    const dryRun = syncPreset(items, PYQ_PRESET, today);
    return dryRun.added + dryRun.removed > 0 ? dryRun : null;
  }, [ready, preloaded, presetStamp, items, today]);

  // Coming back from a test (often by Back on a phone, which restores the old scroll position), bring the question into view.
  const askingId = asking?.id;
  useEffect(() => {
    if (!askingId) return;
    ignoreTapsUntil.current = performance.now() + 400;
    // Never pull the page away from a field the learner is typing in.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
    bannerRef.current?.scrollIntoView({ block: "center" });
    bannerRef.current?.focus({ preventScroll: true });
  }, [askingId]);

  const answer = (update: (current: PlanItem[]) => PlanItem[]) => {
    run(update);
    holdTaps();
  };
  const ignoreQuickTaps = (event: React.MouseEvent) => {
    if (performance.now() < ignoreTapsUntil.current) { event.preventDefault(); event.stopPropagation(); }
  };

  /** Back to the month grid of the chosen day, or the nearest month shown. */
  function showGrid() {
    const months = [...document.querySelectorAll<HTMLElement>("h2[id^='month-']")];
    const wanted = `month-${selected.slice(0, 7)}`;
    const target = months.find((month) => month.id === wanted) ?? (wanted > (months.at(-1)?.id ?? "") ? months.at(-1) : months[0]);
    target?.scrollIntoView({ block: "start" });
  }

  /** Load the built-in plan, or bring a loaded one up to date. Keeps everything the learner touched or added. */
  function loadOrUpdatePlan() {
    const counts = { added: 0, removed: 0, skipped: 0, past: 0 };
    try {
      commit((current) => {
        const synced = syncPreset(current, PYQ_PRESET, today);
        counts.added = synced.added;
        counts.removed = synced.removed;
        counts.skipped = synced.skipped;
        counts.past = synced.past;
        return synced.items;
      });
    } catch (error) {
      setPlanNotice("");
      setMessage(error instanceof Error ? error.message : "Could not load the plan.");
      return;
    }
    setMessage("");
    onPresetSynced(PRESET_BUILT);
    const { added, removed, skipped, past } = counts;
    if (added === 0 && removed === 0) {
      setPlanNotice(t({ en: "Your plan is already up to date.", hi: "आपकी योजना पहले से अद्यतन है।" }));
      return;
    }
    const keptNote = skipped > 0
      ? t({ en: ` ${skipped} ${skipped === 1 ? "test you already opened, scored or linked was" : "tests you already opened, scored or linked were"} kept as ${skipped === 1 ? "it was" : "they were"} and not added a second time.`, hi: ` आपके खोले, स्कोर किए या लिंक किए ${skipped} टेस्ट जैसे थे वैसे ही रखे गए, दोबारा नहीं जोड़े गए।` })
      : "";
    const pastNote = past > 0
      ? t({ en: ` ${past} new ${past === 1 ? "test" : "tests"} on days already past ${past === 1 ? "was" : "were"} left out.`, hi: ` बीते दिनों के ${past} नए टेस्ट नहीं जोड़े गए।` })
      : "";
    setPlanNotice(t({
      en: `Added ${added}, removed ${removed} outdated ${removed === 1 ? "item" : "items"}. Your progress is kept.`,
      hi: `${added} जोड़े, ${removed} पुराने आइटम हटाए। आपकी प्रगति बनी रहती है।`,
    }) + keptNote + pastNote);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      commit((current) => addItem(current, { date: selected, title: form.title, series: form.series, url: form.url, minutes: Number(form.minutes) || 0 }));
      setForm({ ...form, title: "", url: "", minutes: "" });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add the test.");
    }
  }

  return <section aria-labelledby="plan-heading" onClickCapture={ignoreQuickTaps} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="plan-heading" className="text-lg font-semibold text-slate-900">{t({ en: "Test plan", hi: "टेस्ट योजना" })}</h2>
      <p className="text-sm text-slate-600" aria-live="polite">
        {t({ en: "Today", hi: "आज" })}: <strong>{summary.todayDone}/{summary.todayTotal}</strong> {t({ en: "done", hi: "पूरे" })}
        {summary.todayMinutesLeft > 0 && <> · {summary.todayMinutesLeft} {t({ en: "min left", hi: "मिनट बाकी" })}</>}
        {" · "}{t({ en: "All", hi: "कुल" })}: <strong>{summary.overallDone}/{summary.overallTotal}</strong>
        {summary.overdue > 0 && <span className="text-amber-700"> · {summary.overdue} {t({ en: summary.overdue === 1 ? "earlier test not done" : "earlier tests not done", hi: "पिछले टेस्ट बाकी" })}</span>}
      </p>
    </div>

    {!ready && <p className="text-sm text-slate-500">{t({ en: "Loading your plan…", hi: "आपकी योजना लोड हो रही है…" })}</p>}
    {saveFailed && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t({ en: "This browser would not save your plan (private window or full storage). Changes will be lost when you close the page.", hi: "यह ब्राउज़र आपकी योजना सहेज नहीं पा रहा। पेज बंद करने पर बदलाव खो जाएँगे।" })}</p>}
    {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
    {pendingUpdate && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="min-w-0 flex-1">{t({ en: `The built-in plan has changed (${pendingUpdate.added} new or moved, ${pendingUpdate.removed} outdated). Update to get it; your progress is kept.`, hi: `योजना बदल गई है (${pendingUpdate.added} नए या खिसकाए गए, ${pendingUpdate.removed} पुराने)। अपडेट करें; आपकी प्रगति बनी रहेगी।` })}</p>
      <button type="button" className={btnPrimary} onClick={loadOrUpdatePlan}>{t({ en: "Update now", hi: "अभी अपडेट करें" })}</button>
    </div>}

    {asking && <div ref={bannerRef} tabIndex={-1} role="alertdialog" aria-labelledby="ask-heading" className="rounded-xl border-2 border-blue-600 bg-blue-50 p-4 outline-none">
      <p id="ask-heading" className="font-semibold text-slate-900">{t({ en: "Did you attempt this test?", hi: "क्या आपने यह टेस्ट दिया?" })}</p>
      <p className="mt-1 text-sm text-slate-700">{asking.title}</p>
      <label className="mt-3 block text-sm text-slate-700">{t({ en: "Score or how it went (optional)", hi: "स्कोर या कैसा रहा (वैकल्पिक)" })}
        <input value={resultDraft[asking.id] ?? ""} onChange={(e) => setResultDraft({ ...resultDraft, [asking.id]: e.target.value })} maxLength={120} placeholder="32/50, 28 min" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => answer((c) => setStatus(c, asking.id, "attempted", now(), resultDraft[asking.id] ?? ""))}>{t({ en: "Yes, I attempted it", hi: "हाँ, दिया" })}</button>
        <button type="button" className={btn} onClick={() => answer((c) => clearOpened(c, asking.id))}>{t({ en: "Not yet", hi: "अभी नहीं" })}</button>
        <button type="button" className={btn} onClick={() => answer((c) => setStatus(c, asking.id, "skipped", now()))}>{t({ en: "Skip it", hi: "छोड़ें" })}</button>
      </div>
    </div>}

    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="plan-day" className="scroll-mt-4 font-medium text-slate-900">{dayTitle}{selected === today && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">{t({ en: "today", hi: "आज" })}</span>}</h3>
      <div className="flex flex-wrap gap-2">
        {selected !== today && <button type="button" className={btn} onClick={() => onSelect(today)}>{t({ en: "Go to today", hi: "आज पर जाएँ" })}</button>}
        <button type="button" className={btn} onClick={showGrid}>{t({ en: "Pick another day ↓", hi: "दूसरा दिन चुनें ↓" })}</button>
      </div>
    </div>

    {ready && dayItems.length === 0 && <p className="text-sm text-slate-600">{t({ en: "No tests planned for this day. Add one below, or load the PYQ plan.", hi: "इस दिन कोई टेस्ट नहीं है। नीचे जोड़ें या पिछले वर्षों के प्रश्नों की योजना लोड करें।" })}</p>}
    <ul className="space-y-2">
      {dayItems.map((item) => {
        const expanded = openRow === item.id;
        const done = item.status === "attempted";
        const skipped = item.status === "skipped";
        const detailsId = `plan-row-${item.id}`;
        return <li key={item.id} className={`rounded-xl border p-3 ${done ? "border-emerald-200 bg-emerald-50/60" : skipped ? "border-slate-200 bg-slate-50" : "border-slate-200"}`}>
          <div className="flex items-start gap-3">
            {/* One tap marks it done; tap again to undo. */}
            <button type="button" aria-pressed={done} aria-label={done ? t({ en: `Mark not done: ${item.title}`, hi: `बाकी करें: ${item.title}` }) : t({ en: `Mark attempted: ${item.title}`, hi: `दिया गया करें: ${item.title}` })}
              onClick={() => { run((c) => setStatus(c, item.id, done || skipped ? "planned" : "attempted", now())); holdTaps(); }}
              className="group -my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
              <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold ${done ? "border-emerald-600 bg-emerald-600 text-white" : skipped ? "border-slate-300 bg-slate-200 text-slate-500" : "border-slate-400 text-transparent group-hover:border-emerald-600"}`}>{skipped ? "–" : "✓"}</span>
            </button>
            <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setOpenRow(expanded ? null : item.id)} className="min-w-0 flex-1 text-left">
              <span className={`text-sm font-medium ${expanded ? "block" : "line-clamp-2"} ${done ? "text-emerald-900" : skipped ? "text-slate-500 line-through" : "text-slate-900"}`}>{rowTitle(item.title).text}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {SHORT_SERIES[item.series]}{rowTitle(item.title).size && ` · ${rowTitle(item.title).size}`}{item.minutes > 0 && ` · ${item.minutes} min`}
                {done && ` · ${t({ en: "done", hi: "दिया" })}${item.result ? `: ${item.result}` : ""}`}
                {skipped && ` · ${t({ en: "skipped", hi: "छोड़ा" })}`}
              </span>
            </button>
            {item.status === "planned" && <TestLink item={item} label={openLabel(item)} className={`${btnPrimary} shrink-0`} onOpen={() => { setAskReady(false); run((c) => markOpened(c, item.id, now())); }}>{t({ en: "Open ↗", hi: "खोलें ↗" })}</TestLink>}
          </div>
          {expanded && <div id={detailsId} className="mt-3 space-y-3 border-t border-slate-200/70 pt-3 text-xs text-slate-600 sm:pl-10">
            {item.note && <p>{item.note}</p>}
            {item.portalName && <p className="flex flex-wrap items-center gap-2 text-slate-700">
              <span className="min-w-0">{t({ en: "Find on the portal:", hi: "पोर्टल पर यह नाम खोजें:" })} <strong className="break-words font-semibold">{item.portalName}</strong></span>
              <button type="button" onClick={() => void copyName(item)} className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">{copied === item.id ? t({ en: "Copied", hi: "कॉपी हुआ" }) : t({ en: "Copy name", hi: "नाम कॉपी करें" })}</button>
            </p>}
            {done && <label className="block">{t({ en: "Score / notes", hi: "स्कोर / नोट" })}
              {/* Keyed on the saved score, so a score saved in another open copy replaces a stale one here instead of being overwritten on blur. */}
              <input key={item.result} defaultValue={item.result} maxLength={120} placeholder="32/50, 28 min" onBlur={(e) => { if (e.target.value !== item.result) run((c) => setResult(c, item.id, e.target.value)); }} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" />
            </label>}
            <div className="flex flex-wrap items-center gap-2">
              {item.status === "planned" && <button type="button" className={btn} onClick={() => { run((c) => setStatus(c, item.id, "skipped", now())); holdTaps(); }}>{t({ en: "Skip", hi: "छोड़ें" })}</button>}
              <button type="button" className={btn} onClick={() => { run((c) => removeItem(c, item.id)); holdTaps(); }}>{t({ en: "Remove", hi: "हटाएँ" })}</button>
              {item.status === "planned" && <NewTabLink item={item} onOpen={() => { setAskReady(false); run((c) => markOpened(c, item.id, now())); }}>{t({ en: "Open in a new tab ↗", hi: "नए टैब में खोलें ↗" })}</NewTabLink>}
            </div>
            {item.status === "planned" && <details>
              <summary className="cursor-pointer">{item.url ? t({ en: "Change the direct link", hi: "सीधा लिंक बदलें" }) : t({ en: "Add a direct link to this test", hi: "इस टेस्ट का सीधा लिंक जोड़ें" })}</summary>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const value = String(new FormData(e.currentTarget).get("url") ?? ""); run((c) => setUrl(c, item.id, value)); }}>
                <input key={item.url} name="url" defaultValue={item.url} placeholder="https://…" aria-label={t({ en: "Direct link to this test", hi: "इस टेस्ट का सीधा लिंक" })} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm text-slate-900" />
                <button type="submit" className={btn}>{t({ en: "Save", hi: "सहेजें" })}</button>
              </form>
              <p className="mt-1">{t({ en: "IES Master gives no link for each test; paste one here if you find it. Leave it empty to use the series page.", hi: "IES Master हर टेस्ट का अलग लिंक नहीं देता; मिले तो यहाँ चिपकाएँ। खाली छोड़ने पर सीरीज़ का पेज खुलेगा।" })}</p>
            </details>}
          </div>}
        </li>;
      })}
    </ul>

    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-900">{t({ en: "Add a test to this day", hi: "इस दिन में टेस्ट जोड़ें" })}</summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-700 sm:col-span-2">{t({ en: "Test name", hi: "टेस्ट का नाम" })}
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} placeholder="IES T42 Estimating, Costing and Valuation" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-sm text-slate-700">{t({ en: "Series", hi: "सीरीज़" })}
          <select value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value as PlanSeries })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2">
            {SERIES_OPTIONS.map((series) => <option key={series} value={series}>{SERIES_LABEL[series]}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">{t({ en: "Minutes", hi: "मिनट" })}
          <input inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="60" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-sm text-slate-700 sm:col-span-2">{t({ en: "Link to this test (optional; the series page opens if empty)", hi: "इस टेस्ट का लिंक (वैकल्पिक; खाली होने पर सीरीज़ का पेज खुलेगा)" })}
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
        </label>
        {formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}
        <div className="sm:col-span-2"><button type="submit" disabled={!ready} className={btnPrimary}>{t({ en: "Add to this day", hi: "इस दिन में जोड़ें" })}</button></div>
      </form>
    </details>

    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
      <button type="button" disabled={!ready} className={btn} onClick={loadOrUpdatePlan}>{preloaded
        ? t({ en: "Update PYQ plan", hi: "पिछले वर्षों के प्रश्नों की योजना अपडेट करें" })
        : t({ en: "Load PYQ plan (3 Oct - 1 Nov)", hi: "पिछले वर्षों के प्रश्नों की योजना लोड करें (3 अक्टूबर - 1 नवंबर)" })}</button>
      {planNotice && <p role="status" className="text-sm text-slate-700">{planNotice}</p>}
      <details className="w-full text-xs text-slate-500"><summary className="cursor-pointer">{t({ en: "How the plan works", hi: "योजना कैसे काम करती है" })}</summary><p className="mt-2">{t({ en: "Adds the IES topic tests (every hot test three times: the full test, then two shorter redo passes), three reasoning blocks a day, the Made Easy mocks and subject tests, and the daily hot-topic drill. IES gives one attempt per test, so the redo passes and the reasoning review work from the test's Report. Updating keeps your progress: anything you opened, attempted, skipped, scored or linked stays, and your own tests are never changed. A built-in test you remove comes back when you update; press Skip instead if you don't plan to do it. The plan is saved in this browser for your profile.", hi: "IES के विषयवार टेस्ट (हर हॉट टेस्ट तीन बार: पहले पूरा टेस्ट, फिर दो छोटे दोहराव), रोज़ तीन रीज़निंग ब्लॉक, Made Easy के मॉक और विषयवार टेस्ट और रोज़ का हॉट-टॉपिक ड्रिल जोड़ता है। IES हर टेस्ट एक ही बार देने देता है, इसलिए दोहराव और रीज़निंग समीक्षा टेस्ट की Report से होती है। अपडेट करने पर आपकी प्रगति बनी रहती है: जो टेस्ट आपने खोला, दिया, छोड़ा या जिसमें स्कोर या लिंक जोड़ा, वह रहता है, और आपके अपने टेस्ट कभी नहीं बदलते। योजना का जो टेस्ट आप हटाते हैं, वह अपडेट करने पर लौट आता है; अगर उसे नहीं देना है तो 'छोड़ें' दबाएँ। योजना आपकी प्रोफ़ाइल के लिए इसी ब्राउज़र में सहेजी जाती है।" })}</p></details>
    </div>
  </section>;
}
