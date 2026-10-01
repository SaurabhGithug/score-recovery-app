"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import type { Clause, StandardInfo } from "@/components/standards/shared";
import type { AttemptView, QuizOverview, QuizScope } from "@/lib/standards/quiz-types";
import { formatClock, formatDuration, quizApi, QuizApiError, withClock, type ClockAnchor } from "./api";

const SECTIONS = ["4", "5", "6", "7", "8"] as const;
type Section = (typeof SECTIONS)[number];
const COUNT_CHOICES = [10, 20, 30, 40];
const TIME_CHOICES = [45, 60, 90, 120];
const MIN_Q = 5;
const MAX_Q = 60;
const MIN_LIMIT = 60;
const MAX_LIMIT = 4 * 3600;

interface ClauseOption { clauseNo: string; label: string; depth: number; count: number }

/** Every clause that has questions in it or below it (7.8 counts 7.8.1 … 7.8.8), in document order. */
function clauseOptions(clauses: Clause[], byClause: Record<string, number>): ClauseOption[] {
  const sorted = [...clauses].sort((a, b) => a.ord - b.ord);
  const children = new Map<string, string[]>();
  for (const c of sorted) if (c.parent_no) children.set(c.parent_no, [...(children.get(c.parent_no) ?? []), c.clause_no]);
  const total = (no: string, seen = new Set<string>()): number => {
    if (seen.has(no)) return 0;
    seen.add(no);
    return (byClause[no] ?? 0) + (children.get(no) ?? []).reduce((s, child) => s + total(child, seen), 0);
  };
  const byNo = new Map(sorted.map((c) => [c.clause_no, c]));
  const depth = (c: Clause) => {
    let d = 0;
    for (let p = c.parent_no; p && byNo.has(p) && d < 6; p = byNo.get(p)!.parent_no) d++;
    return d;
  };
  return sorted
    .map((c) => ({ clauseNo: c.clause_no, label: /^(nf|intro)$/i.test(c.clause_no) ? c.title : `${c.clause_no} ${c.title}`.trim(), depth: depth(c), count: total(c.clause_no) }))
    .filter((o) => o.count > 0);
}

export function QuizSetup({ standardId, standard, clauses, onStarted, onOpen }: {
  standardId: string;
  standard: StandardInfo;
  clauses: Clause[];
  onStarted: (view: AttemptView, anchor: ClockAnchor) => void;
  onOpen: (attemptId: string) => void;
}) {
  const { t, lang } = useLang();
  const [overview, setOverview] = useState<QuizOverview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [scopeKind, setScopeKind] = useState<QuizScope["kind"]>("all");
  const [section, setSection] = useState<Section | null>(null);
  const [clauseNo, setClauseNo] = useState<string | null>(null);
  const [countChoice, setCountChoice] = useState<number | "custom">(20);
  const [customCount, setCustomCount] = useState("15");
  const [timeChoice, setTimeChoice] = useState<number | "custom">(60);
  const [customTime, setCustomTime] = useState("75");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<{ message: string; activeAttemptId?: string } | null>(null);

  useEffect(() => {
    let live = true;
    quizApi.overview(standardId).then((o) => { if (live) setOverview(o); }).catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : "Could not load the tests."); });
    return () => { live = false; };
  }, [standardId]);

  const options = useMemo(() => clauseOptions(clauses, overview?.available.byClause ?? {}), [clauses, overview]);
  const sectionTitle = (s: string) => clauses.find((c) => c.clause_no === s)?.title ?? "";
  const sectionCount = (s: string) => overview?.available.bySection[s] ?? 0;
  const firstSection = SECTIONS.find((s) => sectionCount(s) >= MIN_Q) ?? null;
  const firstClause = options.find((o) => o.count >= MIN_Q)?.clauseNo ?? null;
  const activeSection = section ?? firstSection;
  const activeClause = clauseNo ?? firstClause;

  const scope: QuizScope | null =
    scopeKind === "all" ? { kind: "all" } : scopeKind === "section" ? (activeSection ? { kind: "section", section: activeSection } : null) : activeClause ? { kind: "clause", clauseNo: activeClause } : null;
  const available = !overview || !scope ? 0 : scope.kind === "all" ? overview.available.total : scope.kind === "section" ? sectionCount(scope.section) : options.find((o) => o.clauseNo === scope.clauseNo)?.count ?? 0;

  const wanted = countChoice === "custom" ? Number.parseInt(customCount, 10) : countChoice;
  const countValid = Number.isInteger(wanted) && wanted >= MIN_Q && wanted <= MAX_Q;
  const count = countValid ? Math.min(wanted, available) : 0;
  const perQuestion = timeChoice === "custom" ? Number.parseInt(customTime, 10) : timeChoice;
  const perQuestionValid = Number.isInteger(perQuestion) && perQuestion >= 5 && perQuestion <= 3600;
  const totalSeconds = count * (perQuestionValid ? perQuestion : 0);
  const totalValid = totalSeconds >= MIN_LIMIT && totalSeconds <= MAX_LIMIT;
  const canStart = !!scope && available >= MIN_Q && countValid && perQuestionValid && totalValid && !starting && !overview?.active;

  const countChips = [...COUNT_CHOICES.filter((c) => c <= available)];
  if (available >= MIN_Q && available < 40 && available <= MAX_Q && !countChips.includes(available)) countChips.push(available);
  // A preset larger than this scope has is shown as the largest chip (the test is capped to it anyway).
  const shownChoice = countChoice === "custom" || countChips.includes(countChoice) ? countChoice : countChips[countChips.length - 1];

  async function start() {
    if (!scope || !canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const { value, anchor } = await withClock(() => quizApi.start(standardId, { scope, count, secondsPerQuestion: perQuestion }), (v) => v.serverNow);
      onStarted(value, anchor!);
    } catch (e) {
      setStartError({ message: e instanceof Error ? e.message : "Could not start the test.", activeAttemptId: e instanceof QuizApiError ? e.activeAttemptId : undefined });
      setStarting(false);
    }
  }

  const header = (
    <>
      <Link href={`/standards/${encodeURIComponent(standardId)}`} className="text-xs text-blue-700 underline">← {t({ en: "Back to study", hi: "अध्ययन पर वापस" })}</Link>
      <header className="mt-2">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{standard.code}</p>
        <h1 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">{t({ en: "Timed test", hi: "समयबद्ध टेस्ट" })}</h1>
        <p className="mt-0.5 break-words text-sm text-slate-600">{standard.title}</p>
      </header>
    </>
  );

  if (loadError) return <main className="mx-auto w-full max-w-3xl px-4 py-6">{header}<p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{loadError}</p></main>;
  if (!overview) return <main className="mx-auto w-full max-w-3xl px-4 py-6">{header}<p role="status" className="mt-4 text-sm text-slate-500">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</p></main>;

  const enough = overview.available.total >= MIN_Q;
  const deadline = overview.active ? new Date(overview.active.deadlineAt).toLocaleTimeString(lang === "hi" ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
  const chip = (on: boolean) => `min-h-11 rounded-lg border px-4 text-sm font-semibold tabular-nums disabled:opacity-40 ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"}`;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <div>{header}</div>

      {overview.active && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-blue-950">
            <span className="font-semibold">{t({ en: "You have a test running.", hi: "आपका एक टेस्ट चल रहा है।" })}</span>{" "}
            <span className="break-words">{overview.active.scopeLabel}</span> · {t({ en: `time runs out at ${deadline}`, hi: `समय ${deadline} पर समाप्त होगा` })}
          </p>
          <button type="button" onClick={() => onOpen(overview.active!.id)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">{t({ en: "Resume test", hi: "टेस्ट फिर शुरू करें" })}</button>
        </div>
      )}

      {!enough ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-base font-semibold text-slate-800">{t({ en: "Questions for this standard are still being prepared", hi: "इस मानक के प्रश्न अभी तैयार किए जा रहे हैं" })}</p>
          <p className="mt-1 text-sm text-slate-600">
            {t({ en: `${overview.available.total} checked question${overview.available.total === 1 ? "" : "s"} so far; a test needs at least ${MIN_Q}. Keep studying the clauses meanwhile.`, hi: `अभी तक ${overview.available.total} जाँचे गए प्रश्न; टेस्ट के लिए कम से कम ${MIN_Q} चाहिए। तब तक क्लॉज़ पढ़ते रहें।` })}
          </p>
          <Link href={`/standards/${encodeURIComponent(standardId)}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">{t({ en: "Back to study", hi: "अध्ययन पर वापस" })}</Link>
        </section>
      ) : (
        <section aria-labelledby="quiz-setup-title" className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <h2 id="quiz-setup-title" className="text-base font-bold text-slate-900">{t({ en: "Set up your test", hi: "अपना टेस्ट चुनें" })}</h2>
            <p className="mt-0.5 text-sm text-slate-600">{t({ en: `${overview.available.total} checked questions are ready.`, hi: `${overview.available.total} जाँचे गए प्रश्न तैयार हैं।` })}</p>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">{t({ en: "What should it cover?", hi: "टेस्ट किस भाग पर हो?" })}</legend>
            <div className="mt-2 space-y-2">
              {(["all", "section", "clause"] as const).map((k) => (
                <label key={k} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-blue-600 ${scopeKind === k ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
                  <input type="radio" name="quiz-scope" value={k} checked={scopeKind === k} onChange={() => setScopeKind(k)} className="h-5 w-5 accent-blue-600" />
                  <span className="text-sm font-medium text-slate-800">
                    {k === "all" ? t({ en: `Whole standard (${overview.available.total})`, hi: `पूरा मानक (${overview.available.total})` }) : k === "section" ? t({ en: "One section (clauses 4–8)", hi: "एक खंड (क्लॉज़ 4–8)" }) : t({ en: "One clause", hi: "एक क्लॉज़" })}
                  </span>
                </label>
              ))}
            </div>
            {scopeKind === "section" && (
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-600">{t({ en: "Section", hi: "खंड" })}</span>
                <select value={activeSection ?? ""} onChange={(e) => setSection(e.target.value as Section)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                  {SECTIONS.map((s) => (
                    <option key={s} value={s} disabled={sectionCount(s) < MIN_Q}>
                      {`${t({ en: "Clause", hi: "क्लॉज़" })} ${s} – ${sectionTitle(s)} (${sectionCount(s)})${sectionCount(s) < MIN_Q ? ` – ${t({ en: "not enough yet", hi: "अभी पर्याप्त नहीं" })}` : ""}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {scopeKind === "clause" && (
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-600">{t({ en: "Clause", hi: "क्लॉज़" })}</span>
                <select value={activeClause ?? ""} onChange={(e) => setClauseNo(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                  {options.map((o) => (
                    <option key={o.clauseNo} value={o.clauseNo} disabled={o.count < MIN_Q}>
                      {`${"  ".repeat(o.depth)}${o.label} (${o.count})${o.count < MIN_Q ? ` – ${t({ en: "not enough yet", hi: "अभी पर्याप्त नहीं" })}` : ""}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {scope === null && <p className="mt-2 text-sm text-amber-800">{t({ en: "No part of this kind has 5 checked questions yet.", hi: "इस प्रकार के किसी भाग में अभी 5 जाँचे गए प्रश्न नहीं हैं।" })}</p>}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">{t({ en: "Number of questions", hi: "प्रश्नों की संख्या" })}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {countChips.map((c) => (
                <button key={c} type="button" aria-pressed={shownChoice === c} onClick={() => setCountChoice(c)} className={chip(shownChoice === c)}>
                  {c === available && !COUNT_CHOICES.includes(c) ? t({ en: `All ${c}`, hi: `सभी ${c}` }) : c}
                </button>
              ))}
              <button type="button" aria-pressed={countChoice === "custom"} onClick={() => setCountChoice("custom")} className={chip(countChoice === "custom")}>{t({ en: "Custom", hi: "अपनी संख्या" })}</button>
            </div>
            {countChoice === "custom" && (
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                {t({ en: "Questions:", hi: "प्रश्न:" })}
                <input type="number" inputMode="numeric" min={MIN_Q} max={Math.min(MAX_Q, Math.max(MIN_Q, available))} value={customCount} onChange={(e) => setCustomCount(e.target.value)} className="min-h-11 w-24 rounded-lg border border-slate-300 px-2 text-base tabular-nums" />
                <span className="text-xs text-slate-500">{t({ en: `${MIN_Q}–${Math.min(MAX_Q, available)}`, hi: `${MIN_Q}–${Math.min(MAX_Q, available)}` })}</span>
              </label>
            )}
            {!countValid && <p className="mt-1 text-sm text-rose-700">{t({ en: `Choose ${MIN_Q} to ${MAX_Q} questions.`, hi: `${MIN_Q} से ${MAX_Q} प्रश्न चुनें।` })}</p>}
            {countChoice === "custom" && countValid && wanted > available && available >= MIN_Q && <p className="mt-1 text-sm text-slate-600">{t({ en: `Only ${available} questions are available here, so the test will have ${available}.`, hi: `यहाँ केवल ${available} प्रश्न उपलब्ध हैं, इसलिए टेस्ट में ${available} होंगे।` })}</p>}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">{t({ en: "Time per question", hi: "प्रति प्रश्न समय" })}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIME_CHOICES.map((s) => (
                <button key={s} type="button" aria-pressed={timeChoice === s} onClick={() => setTimeChoice(s)} className={chip(timeChoice === s)}>
                  {s === 120 ? t({ en: "2 min", hi: "2 मिनट" }) : t({ en: `${s} s`, hi: `${s} सेकंड` })}
                </button>
              ))}
              <button type="button" aria-pressed={timeChoice === "custom"} onClick={() => setTimeChoice("custom")} className={chip(timeChoice === "custom")}>{t({ en: "Custom", hi: "अपना समय" })}</button>
            </div>
            {timeChoice === "custom" && (
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                {t({ en: "Seconds per question:", hi: "प्रति प्रश्न सेकंड:" })}
                <input type="number" inputMode="numeric" min={5} max={3600} value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="min-h-11 w-24 rounded-lg border border-slate-300 px-2 text-base tabular-nums" />
              </label>
            )}
            {!perQuestionValid && <p className="mt-1 text-sm text-rose-700">{t({ en: "Enter 5 to 3600 seconds per question.", hi: "प्रति प्रश्न 5 से 3600 सेकंड दें।" })}</p>}
          </fieldset>

          <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t({ en: "Total time", hi: "कुल समय" })}</p>
            <p className="font-mono text-3xl font-bold tabular-nums">{formatClock(totalSeconds)}</p>
            <p className="text-sm text-slate-300">
              {count > 0 && perQuestionValid ? t({ en: `${count} questions × ${formatDuration(perQuestion, "en")}`, hi: `${count} प्रश्न × ${formatDuration(perQuestion, "hi")}` }) : "—"}
            </p>
            {count > 0 && perQuestionValid && !totalValid && <p className="mt-1 text-sm font-semibold text-amber-300">{t({ en: "The whole test must last between 1 minute and 4 hours.", hi: "पूरा टेस्ट 1 मिनट से 4 घंटे के बीच होना चाहिए।" })}</p>}
          </div>

          <button type="button" disabled={!canStart} onClick={() => void start()} className="min-h-12 w-full rounded-xl bg-blue-600 px-4 text-base font-bold text-white disabled:opacity-50 sm:w-auto sm:px-8">
            {starting ? t({ en: "Starting…", hi: "शुरू हो रहा है…" }) : t({ en: "Start test", hi: "टेस्ट शुरू करें" })}
          </button>
          {overview.active && <p className="text-xs text-slate-500">{t({ en: "Finish or resume the running test before starting a new one.", hi: "नया टेस्ट शुरू करने से पहले चल रहा टेस्ट पूरा करें।" })}</p>}
          {startError && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <span className="min-w-0 flex-1">{startError.message}</span>
              {startError.activeAttemptId && <button type="button" onClick={() => onOpen(startError.activeAttemptId!)} className="min-h-11 rounded-lg bg-rose-700 px-3 font-semibold text-white">{t({ en: "Resume it", hi: "उसे जारी रखें" })}</button>}
            </div>
          )}
        </section>
      )}

      {overview.history.length > 0 && (
        <section aria-labelledby="quiz-history" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="quiz-history" className="text-base font-bold text-slate-900">{t({ en: "Past tests", hi: "पिछले टेस्ट" })}</h2>
            {overview.bestPercent !== null && <p className="text-sm text-slate-600">{t({ en: `Best score: ${overview.bestPercent}%`, hi: `सर्वश्रेष्ठ स्कोर: ${overview.bestPercent}%` })}</p>}
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {overview.history.map((h) => {
              const done = h.submittedAt !== null && h.correct !== null;
              const p = done && h.total ? Math.round((100 * h.correct!) / h.total) : null;
              const when = new Date(h.startedAt).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" });
              return (
                <li key={h.id}>
                  <button type="button" onClick={() => onOpen(h.id)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                    <span className={`w-14 shrink-0 text-center text-lg font-bold tabular-nums ${p === null ? "text-blue-700" : p >= 70 ? "text-emerald-700" : p >= 40 ? "text-amber-700" : "text-rose-700"}`}>{p === null ? "▶" : `${p}%`}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-slate-800">{h.scopeLabel}</span>
                      <span className="block text-xs text-slate-500">
                        {when} · {done ? t({ en: `${h.correct} of ${h.total} right`, hi: `${h.total} में से ${h.correct} सही` }) : t({ en: "In progress", hi: "चल रहा है" })} · {formatDuration(h.limitSeconds, lang === "hi" ? "hi" : "en")}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-slate-400">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
