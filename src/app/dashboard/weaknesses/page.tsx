"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { getLedger } from "@/lib/storage";
import { ERROR_CAUSE_LABEL, ErrorLedgerEntry, SECTION_LABEL } from "@/lib/types";

import { useUser } from "@/lib/user-context";

export default function WeaknessesDetailPage() {
  const { t } = useLang();
  const { currentUser, activeContext } = useUser();
  const [ledger, setLedger] = useState<ErrorLedgerEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all");

  useEffect(() => {
    function load() {
      setLedger(getLedger(currentUser?.id, activeContext?.id));
    }
    load();
    const handleContextChange = () => load();
    window.addEventListener("preparation-context-changed", handleContextChange);
    return () => window.removeEventListener("preparation-context-changed", handleContextChange);
  }, [currentUser, activeContext]);

  const sortedLedger = [...ledger].sort(
    (a, b) => b.occurrences - b.resolvedCount - (a.occurrences - a.resolvedCount)
  );

  const filteredEntries = sortedLedger.filter((e) => {
    const outstanding = e.occurrences - e.resolvedCount;
    if (filter === "unresolved") return outstanding > 0;
    if (filter === "resolved") return outstanding <= 0;
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
        >
          <span>←</span>
          <span>{t({ en: "Back to Dashboard", hi: "डैशबोर्ड पर वापस जाएँ" })}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              {t({ en: "Persistent Error Memory", hi: "स्थायी त्रुटि लेजर" })}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            {t({ en: "Complete Recurring Weaknesses Ledger", hi: "पूर्ण आवर्ती कमजोरी लेजर" })}
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-xl sm:text-sm">
            {t({
              en: "Longitudinal record of error causes, trap frequency, and verified unseen retest resolutions across attempts.",
              hi: "प्रयासों के दौरान त्रुटि कारणों, भ्रम आवृत्ति और सत्यापित अनदेखे पुनर्परीक्षणों का अनुदैर्ध्य रिकॉर्ड।",
            })}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg px-3 py-1.5 font-bold transition ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t({ en: "All Tracked", hi: "सभी ट्रैक किए गए" })} ({ledger.length})
        </button>
        <button
          onClick={() => setFilter("unresolved")}
          className={`rounded-lg px-3 py-1.5 font-bold transition ${
            filter === "unresolved"
              ? "bg-amber-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t({ en: "Unresolved", hi: "अपूर्ण" })} (
          {ledger.filter((e) => e.occurrences > e.resolvedCount).length})
        </button>
        <button
          onClick={() => setFilter("resolved")}
          className={`rounded-lg px-3 py-1.5 font-bold transition ${
            filter === "resolved"
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t({ en: "Resolved on Retest", hi: "पुनर्परीक्षण पर ठीक हुए" })} (
          {ledger.filter((e) => e.occurrences <= e.resolvedCount).length})
        </button>
      </div>

      {/* Ledger Table / List */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t({
            en: "No items match the selected filter.",
            hi: "चयनित फ़िल्टर से कोई आइटम मेल नहीं खाता।",
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((e) => {
            const outstanding = e.occurrences - e.resolvedCount;
            const isResolved = outstanding <= 0;

            return (
              <div
                key={`${e.section}-${e.concept}`}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{e.concept}</h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                      {t(SECTION_LABEL[e.section])}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>
                      <strong className="text-slate-500 font-medium">
                        {t({ en: "Observed cause: ", hi: "देखा गया कारण: " })}
                      </strong>
                      <span className="font-semibold text-slate-800">{t(ERROR_CAUSE_LABEL[e.cause])}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      <strong className="text-slate-500 font-medium">
                        {t({ en: "Cost you marks in:", hi: "अंक कटे:" })}
                      </strong>{" "}
                      <span className="font-bold text-slate-900">{e.occurrences}×</span> {t({ en: "attempts", hi: "प्रयास" })}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                      isResolved
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {e.resolvedCount}/{e.occurrences} {t({ en: "Resolved", hi: "ठीक हुआ" })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
