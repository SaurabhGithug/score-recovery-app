"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ExamFamilySelector } from "@/components/ExamFamilySelector";

export default function Home() {
  const { t } = useLang();
  return <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-24">
    <p className="text-sm font-medium text-slate-500">SSC JE · Civil Engineering</p>
    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t({en:"A little practice. Clear progress.",hi:"थोड़ा अभ्यास। स्पष्ट प्रगति।"})}</h1>
    <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">{t({en:"Work on one question at a time, understand your mistakes, and return when it is time to review.",hi:"एक बार में एक प्रश्न हल करें, अपनी गलतियाँ समझें और समय पर दोहराएँ।"})}</p>
    <Link href="/learn" className="mt-8 inline-flex rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700">{t({en:"Start learning →",hi:"सीखना शुरू करें →"})}</Link>
    <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-slate-200 pt-6 text-sm text-slate-600">
      <Link href="/papers" className="hover:text-slate-950 hover:underline">{t({en:"Browse papers",hi:"पेपर देखें"})}</Link>
      <Link href="/recovery-lab/testbook/import" className="hover:text-slate-950 hover:underline">{t({en:"Import questions",hi:"प्रश्न इम्पोर्ट करें"})}</Link>
    </div>
    <details className="mt-12 text-sm text-slate-500"><summary className="cursor-pointer">{t({en:"Other preparation goals",hi:"अन्य तैयारी लक्ष्य"})}</summary><div className="mt-5"><ExamFamilySelector /></div></details>
  </div>;
}
