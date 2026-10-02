"use client";

import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { HubBackLink } from "@/components/learn/HubBackLink";
import { EmptyStandards, StandardListItem, StandardsError } from "@/components/learn/StandardCards";
import { Skeleton } from "@/components/learn/ProgressMeter";
import { useStandardsList } from "@/components/learn/standards-data";

export default function StandardsPage() {
  const { t } = useLang();
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? "";
  const { rows, loading, error, reload } = useStandardsList();
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-4 text-slate-900 sm:py-8">
      <HubBackLink />
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t({ en: "Indian Standards", hi: "भारतीय मानक" })}</h1>
      <div className="mt-5">
        {loading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</span>
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : error ? <StandardsError message={error} onRetry={reload} />
          : rows && rows.length === 0 ? <EmptyStandards />
          : <ul className="space-y-3">{rows?.map(s => <li key={s.id}><StandardListItem standard={s} userId={userId} /></li>)}</ul>}
      </div>
    </main>
  );
}
