"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { TestPlanPanel } from "@/components/calendar/TestPlanPanel";
import { useTestPlan } from "@/components/calendar/useTestPlan";
import { dayMarks } from "@/lib/calendar/test-plan";
import { SSC_JE_PAPER1_SCHEDULE } from "@/lib/ssc-je/config";
import { daysBetween, firstCalendarMonth, localIsoDate, monthCells, monthsBetween } from "@/lib/calendar/dates";
import type { Bilingual } from "@/lib/types";

const WEEKDAYS: Bilingual[] = [
  { en: "Sun", hi: "रवि" }, { en: "Mon", hi: "सोम" }, { en: "Tue", hi: "मंगल" }, { en: "Wed", hi: "बुध" },
  { en: "Thu", hi: "गुरु" }, { en: "Fri", hi: "शुक्र" }, { en: "Sat", hi: "शनि" },
];

const { startDate: EXAM_START, endDate: EXAM_END } = SSC_JE_PAPER1_SCHEDULE;
const EXAM_MONTH = EXAM_END.slice(0, 7);

/** A calendar from this month to the end of SSC's Paper-I window, with today and the exam days marked, and the learner's own test plan for each day. */
export default function CalendarPage() {
  const { t, lang } = useLang();
  const [today, setToday] = useState(() => localIsoDate());
  const { currentUser } = useUser();
  const { items, ready, commit, saveFailed, presetStamp, markPresetSynced } = useTestPlan(currentUser?.id);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? today;
  const marks = dayMarks(items);

  // The date can change while the tab stays open (a phone left on the calendar overnight).
  useEffect(() => {
    const refresh = () => setToday(localIsoDate());
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const monthTitle = (monthKey: string) => new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });

  const daysToExam = daysBetween(today, EXAM_START);
  const windowOver = daysBetween(today, EXAM_END) < 0;
  const windowOn = !windowOver && daysToExam <= 0;
  const dayWord = t({ en: daysToExam === 1 ? "day" : "days", hi: "दिन" });
  const countdown = windowOver
    ? t({ en: "Paper-I window has passed", hi: "पेपर-I की अवधि बीत चुकी है" })
    : windowOn
      ? t({ en: "Paper-I window is on now", hi: "पेपर-I की अवधि अभी चल रही है" })
      : `${daysToExam} ${dayWord} ${t({ en: "to Paper-I", hi: "पेपर-I में" })}`;

  const months = monthsBetween(firstCalendarMonth(today, items.map((item) => item.date), EXAM_MONTH), EXAM_MONTH);

  /** Show the tapped day's tests: they are in the plan above the month grids, often a long way up on a phone. */
  const pickDate = (date: string) => {
    setPicked(date);
    requestAnimationFrame(() => document.getElementById("plan-day")?.scrollIntoView({ block: "start" }));
  };

  return <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
    <header>
      <p className="text-sm text-slate-500">SSC JE · Civil Engineering</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{t({ en: "Calendar to exam day", hi: "परीक्षा के दिन तक कैलेंडर" })}</h1>
    </header>

    <section aria-labelledby="countdown" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="countdown" className="sr-only">{t({ en: "Countdown", hi: "उलटी गिनती" })}</h2>
      <p className="text-3xl font-semibold tracking-tight text-slate-950">{countdown}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {t({ en: "Paper-I (CBE, qualifying):", hi: "पेपर-I (सीबीई, अर्हकारी):" })} <strong className="text-slate-900">{SSC_JE_PAPER1_SCHEDULE.short}</strong> {t({ en: "— proposed dates. Your exact date, shift and centre come on your admit card.", hi: "— प्रस्तावित तिथियाँ। आपकी सटीक तिथि, शिफ्ट और केंद्र प्रवेश पत्र पर मिलेंगे।" })}{" "}
        <a href={SSC_JE_PAPER1_SCHEDULE.noticeUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-700 underline">{t({ en: "SSC notice, 1 Oct 2026 ↗", hi: "एसएससी नोटिस, 1 अक्टूबर 2026 ↗" })}</a>
      </p>
    </section>

    <TestPlanPanel today={today} selected={selected} onSelect={setPicked} items={items} ready={ready} saveFailed={saveFailed} commit={commit} presetStamp={presetStamp} onPresetSynced={markPresetSynced} />

    {months.map((monthKey) => {
      const cells = monthCells(monthKey);
      const weeks = Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
      return <section key={monthKey} aria-labelledby={`month-${monthKey}`} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 id={`month-${monthKey}`} className="text-lg font-semibold text-slate-900">{monthTitle(monthKey)}</h2>
        <table className="mt-3 w-full table-fixed border-separate border-spacing-1">
          <thead>
            <tr>{WEEKDAYS.map((weekday) => <th key={weekday.en} scope="col" className="pb-1 text-center text-[11px] font-medium text-slate-500">{t(weekday)}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => <tr key={index}>
              {week.map((date, column) => {
                if (!date) return <td key={`blank-${column}`} />;
                const isToday = date === today;
                const isExam = date >= EXAM_START && date <= EXAM_END;
                const isPast = date < today;
                const mark = marks[date];
                const isSelected = date === selected;
                return <td key={date} className={`h-14 rounded-lg border text-center align-top ${isExam ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50"} ${isPast && !isExam ? "text-slate-400" : ""} ${isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}>
                  <button type="button" onClick={() => pickDate(date)} aria-pressed={isSelected} aria-label={`${date}${mark ? `, ${mark.done} of ${mark.total} tests done` : ""}`} className="block h-full w-full">
                    <span aria-current={isToday ? "date" : undefined} className={`mt-1.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm ${isToday ? "bg-blue-600 font-bold text-white" : "font-semibold"}`}>{Number(date.slice(8))}</span>
                    {isToday && <span className="sr-only"> {t({ en: "today", hi: "आज" })}</span>}
                    {isExam && <span className="block text-[10px] font-medium leading-tight">{t({ en: "Exam", hi: "परीक्षा" })}</span>}
                    {mark && !isExam && <span className={`block text-[10px] font-medium leading-tight ${mark.done === mark.total ? "text-emerald-600" : ""}`}>{mark.done}/{mark.total}</span>}
                  </button>
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </section>;
    })}
  </main>;
}
