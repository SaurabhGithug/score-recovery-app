"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { EmptyStandards, StandardCard, StandardCardSkeleton, StandardsError } from "./StandardCards";
import { useStandardsList } from "./standards-data";

/**
 * The Mechanical profile's Learn page: one card for the first Indian Standard, nothing else.
 * (The practice tabs stay reachable by /learn?tab=… but are no longer advertised here.)
 */
export function MechanicalLearnHub() {
  const { t } = useLang();
  const { currentUser } = useUser();
  const { rows, loading, error, reload } = useStandardsList();
  const first = rows?.[0];

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 text-slate-900 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t({ en: "Learn", hi: "सीखें" })}</h1>
      <div className="mt-5">
        {loading ? <StandardCardSkeleton />
          : error ? <StandardsError message={error} onRetry={reload} />
          : !first ? <EmptyStandards />
          : <StandardCard key={first.id} standard={first} userId={currentUser?.id ?? ""} />}
      </div>
      {rows && rows.length > 1 && (
        <Link href="/standards" className="mt-2 inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-blue-700 hover:underline">{t({ en: "All standards", hi: "सभी मानक" })}</Link>
      )}
    </main>
  );
}
