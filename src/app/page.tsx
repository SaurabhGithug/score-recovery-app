"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";

/** Home: the two things people come to do, one tap each. Everything else is in the tabs. */
export default function Home() {
  const { t } = useLang();
  return <div className="mx-auto w-full max-w-xl px-5 py-12 sm:py-20">
    <p className="text-sm font-medium text-slate-500">SSC JE · Civil Engineering</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{t({ en: "What would you like to do?", hi: "आप क्या करना चाहेंगे?" })}</h1>
    <div className="mt-8 grid gap-3">
      <Link href="/learn" className="rounded-2xl bg-slate-900 px-5 py-4 text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="block text-base font-semibold">{t({ en: "Practise today's questions →", hi: "आज के प्रश्न हल करें →" })}</span>
        <span className="mt-0.5 block text-sm text-slate-300">{t({ en: "A few questions at a time, with reviews when they're due", hi: "कुछ प्रश्न एक बार में, समय पर दोहराव के साथ" })}</span>
      </Link>
      <Link href="/papers" className="rounded-2xl border border-slate-300 bg-white px-5 py-4 text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="block text-base font-semibold">{t({ en: "Take a test →", hi: "टेस्ट दें →" })}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{t({ en: "SSC previous-year papers and mock tests", hi: "SSC पिछले वर्ष के पेपर और मॉक टेस्ट" })}</span>
      </Link>
    </div>
  </div>;
}
