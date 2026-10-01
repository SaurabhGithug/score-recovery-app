"use client";

import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { HubBackLink } from "@/components/learn/HubBackLink";
import { EmptyStandards, StandardListCard, StandardsError } from "@/components/learn/StandardCards";
import { Skeleton } from "@/components/learn/ProgressMeter";
import { useStandardsList } from "@/components/learn/standards-data";

export default function StandardsPage() {
  const { t } = useLang();
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? "";
  const { rows, loading, error, reload } = useStandardsList();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 text-slate-900 sm:py-8">
      <HubBackLink />
      <header className="mt-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t({ en: "Indian Standards", hi: "भारतीय मानक" })}</h1>
        <p className="mt-2 max-w-xl text-base text-slate-600">{t({ en: "Read each standard clause by clause and get an AI lesson checked against its text.", hi: "हर मानक को क्लॉज़ दर क्लॉज़ पढ़ें और उसके पाठ से जाँचा हुआ AI पाठ पाएँ।" })}</p>
      </header>
      <div className="mt-6">
        {loading ? (
          <div role="status" aria-live="polite" className="space-y-4">
            <span className="sr-only">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</span>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : error ? <StandardsError message={error} onRetry={reload} />
          : rows && rows.length === 0 ? <EmptyStandards />
          : <ul className="space-y-4">{rows?.map(s => <li key={s.id}><StandardListCard standard={s} userId={userId} /></li>)}</ul>}
      </div>
    </main>
  );
}
