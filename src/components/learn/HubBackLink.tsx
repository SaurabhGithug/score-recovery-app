"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ArrowLeftIcon } from "./icons";

/** "← Learn": the way back to the Learn hub from the practice tools and the standards pages. */
export function HubBackLink() {
  const { t } = useLang();
  return (
    <Link href="/learn" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 pr-3 text-sm font-medium text-slate-600 transition hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600">
      <ArrowLeftIcon className="h-4 w-4" />{t({ en: "Learn", hi: "सीखें" })}
    </Link>
  );
}
