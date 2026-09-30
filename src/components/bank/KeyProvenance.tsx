"use client";

import type { BankEvidenceView, BankKeyView } from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";
import { optionRef, type OptionLayout } from "./optionOrder";

function same(a: BankEvidenceView, b: BankEvidenceView): boolean {
  return a.authority === b.authority && a.sourceLabel === b.sourceLabel && a.answer === b.answer && a.dropped === b.dropped;
}

/**
 * Where the key came from, stated once. The resolver can put the same rows in `basis` and
 * `dissent` (SSC or provider sources that disagree among themselves), so:
 * - unscored: one list of every source (with the answer it gives, when they disagree);
 * - scored: the supporting sources (the key itself is marked on the options), then any source
 *   that says otherwise, with its answer.
 * `showStatus` is false when the caller already printed the status line as its heading.
 */
export function KeyProvenance({ keyView, question, showStatus = true }: { keyView: BankKeyView; question: OptionLayout; showStatus?: boolean }) {
  const { t } = useLang();
  const answerOf = (row: BankEvidenceView) =>
    row.dropped || !row.answer ? t({ en: "dropped", hi: "हटाया गया" }) : optionRef(question, row.answer);
  const others = keyView.dissent;
  const support = keyView.basis.filter((row) => !others.some((d) => same(row, d)));

  return (
    <div className="text-xs">
      {showStatus && <p className="font-semibold text-slate-700">{keyView.statusLabel}</p>}
      {keyView.scored ? (
        <>
          {support.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-slate-500">
              {support.map((row, i) => <li key={i}>{row.sourceLabel}</li>)}
            </ul>
          )}
          {others.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
              <p className="font-semibold">{t({ en: "Other sources say otherwise:", hi: "अन्य स्रोत अलग उत्तर देते हैं:" })}</p>
              <ul className="mt-1 list-disc pl-4">
                {others.map((row, i) => <li key={i}>{row.sourceLabel}: {answerOf(row)}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : (
        [...support, ...others].length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-slate-600">
            {/* Answers only where sources disagree: with no key, the only rows can be AI solves, and an
                AI answer shown alone would read as a key. */}
            {[...support, ...others].map((row, i) => <li key={i}>{row.sourceLabel}{keyView.status === "disputed" ? `: ${answerOf(row)}` : ""}</li>)}
          </ul>
        )
      )}
    </div>
  );
}
