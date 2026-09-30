"use client";

import { useLang } from "@/lib/i18n";

/** "AI-generated" tag used on every AI-written answer or note in the app. */
export function AiGeneratedBadge({ detail }: { detail?: string }) {
  const { t } = useLang();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
      {t({ en: "AI-generated", hi: "AI द्वारा बनाया गया" })}
      {detail && <span className="font-medium normal-case tracking-normal text-violet-700">· {detail}</span>}
    </span>
  );
}
