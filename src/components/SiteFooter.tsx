"use client";

import { useLang } from "@/lib/i18n";
import { useAttemptMode } from "@/lib/attempt-mode";
import { CONTENT_VERSION } from "@/lib/exam";
import { usePathname } from "next/navigation";

/** Transparency footer — matches the plan's requirement that content be versioned and dated,
 *  not silently changed. Hidden during an active attempt (nothing useful there, and it would
 *  just eat vertical space on the exam screen). See docs/syllabus-update-process.md. */
export function SiteFooter() {
  const { t } = useLang();
  const { kind } = useAttemptMode();
  const pathname = usePathname();
  if (kind !== null) return null;

  if (pathname.startsWith("/learn")) return null;

  const isTestbookSscJe = pathname.startsWith("/recovery-lab/testbook");
  const patternVersion = isTestbookSscJe ? "SSC-JE-CIVIL-PAPER-I-PORTAL-IMPORT" : CONTENT_VERSION.examPatternVersion;
  const reviewedAt = isTestbookSscJe ? "2026-09-29" : CONTENT_VERSION.lastReviewedAt;

  return (
    <footer className="px-4 py-5 text-center text-xs text-slate-500">
      <details><summary className="cursor-pointer">App details</summary>
      <span>
        {t({ en: "Content version", hi: "सामग्री संस्करण" })} {CONTENT_VERSION.contentVersion} ·{" "}
        {t({ en: "Exam pattern", hi: "परीक्षा पैटर्न" })}: {patternVersion} ·{" "}
        {t({ en: "Last reviewed", hi: "अंतिम समीक्षा" })} {reviewedAt}
      </span>
      </details>
    </footer>
  );
}
