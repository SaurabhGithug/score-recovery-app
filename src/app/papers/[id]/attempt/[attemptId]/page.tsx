"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BankAttempt, BankPaperDetail, BankResponses } from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";
import { BankApiRequestError, getAttempt, getPaper } from "@/components/bank/api";
import { BankRunner } from "@/components/bank/BankRunner";

export default function BankAttemptPage() {
  const { t } = useLang();
  const router = useRouter();
  const params = useParams<{ id: string; attemptId: string }>();

  const [paper, setPaper] = useState<BankPaperDetail | null>(null);
  const [attempt, setAttempt] = useState<BankAttempt | null>(null);
  const [responses, setResponses] = useState<BankResponses>({});
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [paperDetail, attemptState] = await Promise.all([getPaper(params.id), getAttempt(params.attemptId)]);
        if (cancelled) return;
        if (attemptState.attempt.submittedAt) {
          router.replace(`/papers/attempts/${params.attemptId}`);
          return;
        }
        setPaper(paperDetail);
        setAttempt(attemptState.attempt);
        setResponses(attemptState.responses);
      } catch (err) {
        if (cancelled) return;
        setError({
          message: err instanceof BankApiRequestError ? err.message : "Could not load this attempt.",
          status: err instanceof BankApiRequestError ? err.status : undefined,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, params.attemptId, router]);

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-sm font-medium text-rose-700">{error.message}</p>
        <Link href="/papers" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          {t({ en: "Back to papers", hi: "पेपर पर वापस जाएँ" })}
        </Link>
      </div>
    );
  }

  if (!paper || !attempt) {
    return <div className="mx-auto flex-1 px-4 py-16 text-center text-sm text-slate-400">{t({ en: "Loading attempt…", hi: "प्रयास लोड हो रहा है…" })}</div>;
  }

  return <BankRunner paper={paper} attempt={attempt} initialResponses={responses} />;
}
