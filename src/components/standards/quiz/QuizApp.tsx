"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { api, type Clause, type StandardInfo } from "@/components/standards/shared";
import type { AttemptView, ResultView } from "@/lib/standards/quiz-types";
import { isResult, quizApi, QuizApiError, withClock, type ClockAnchor } from "./api";
import { QuizSetup } from "./QuizSetup";
import { QuizRunner } from "./QuizRunner";
import { QuizResult } from "./QuizResult";

type Loaded = { kind: "attempt"; view: AttemptView; anchor: ClockAnchor } | { kind: "result"; result: ResultView };

/**
 * /standards/<id>/test: setup → runner → result. The attempt id lives in ?attempt= so a refresh
 * resumes the running test (or reopens its result) from the server.
 */
export function QuizApp({ standardId }: { standardId: string }) {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const attemptId = useSearchParams().get("attempt");
  const [standard, setStandard] = useState<{ info: StandardInfo; clauses: Clause[] } | null>(null);
  const [error, setError] = useState("");
  // A freshly started attempt is handed over directly instead of being fetched again.
  const [handoff, setHandoff] = useState<{ id: string; loaded: Loaded } | null>(null);

  useEffect(() => {
    let live = true;
    api<{ standard: StandardInfo; clauses: Clause[] }>(`/api/standards/${encodeURIComponent(standardId)}?lang=en`)
      .then((d) => { if (live) setStandard({ info: d.standard, clauses: d.clauses }); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the standard."); });
    return () => { live = false; };
  }, [standardId]);

  const open = (id: string, loaded?: Loaded) => {
    setHandoff(loaded ? { id, loaded } : null);
    router.replace(`${pathname}?attempt=${encodeURIComponent(id)}`, { scroll: true });
  };
  const home = () => {
    setHandoff(null);
    router.replace(pathname, { scroll: true });
  };

  if (error) return <main className="mx-auto max-w-3xl px-4 py-6"><p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p><Link href="/standards" className="mt-3 inline-block text-sm text-blue-700 underline">{t({ en: "Back to standards", hi: "मानकों पर वापस" })}</Link></main>;
  if (!standard) return <main className="mx-auto max-w-3xl px-4 py-6"><p role="status" className="text-sm text-slate-500">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</p></main>;

  if (!attemptId) {
    return <QuizSetup standardId={standardId} standard={standard.info} clauses={standard.clauses} onStarted={(view, anchor) => open(view.id, { kind: "attempt", view, anchor })} onOpen={(id) => open(id)} />;
  }
  return <AttemptScreen key={attemptId} attemptId={attemptId} standardId={standardId} initial={handoff?.id === attemptId ? handoff.loaded : undefined} onOpen={open} onHome={home} />;
}

function AttemptScreen({ attemptId, standardId, initial, onOpen, onHome }: {
  attemptId: string;
  standardId: string;
  initial: Loaded | undefined;
  onOpen: (id: string, loaded?: Loaded) => void;
  onHome: () => void;
}) {
  const { t } = useLang();
  const [loaded, setLoaded] = useState<Loaded | null>(initial ?? null);
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; activeAttemptId?: string } | null>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    withClock(() => quizApi.get(attemptId), (v) => (isResult(v) ? undefined : v.serverNow))
      .then(({ value, anchor }) => {
        if (!live) return;
        setLoaded(isResult(value) ? { kind: "result", result: value } : { kind: "attempt", view: value, anchor: anchor! });
      })
      .catch((e) => { if (live) setError({ notFound: e instanceof QuizApiError && e.status === 404, message: e instanceof Error ? e.message : "Could not load the test." }); });
    return () => { live = false; };
  }, [attemptId, initial]);

  async function retake(result: ResultView) {
    setBusy(true);
    setActionError(null);
    try {
      const { value, anchor } = await withClock(
        () => quizApi.start(standardId, { scope: result.scope ?? { kind: "all" }, count: Math.max(5, result.total), limitSeconds: result.limitSeconds }),
        (v) => v.serverNow
      );
      onOpen(value.id, { kind: "attempt", view: value, anchor: anchor! });
    } catch (e) {
      setActionError({ message: e instanceof Error ? e.message : "Could not start the test.", activeAttemptId: e instanceof QuizApiError ? e.activeAttemptId : undefined });
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error.notFound ? t({ en: "This test was not found.", hi: "यह टेस्ट नहीं मिला।" }) : error.message}</p>
        <button type="button" onClick={onHome} className="mt-3 min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold">{t({ en: "Back to tests", hi: "टेस्ट पर वापस" })}</button>
      </main>
    );
  }
  if (!loaded) return <main className="mx-auto max-w-3xl px-4 py-6"><p role="status" className="text-sm text-slate-500">{t({ en: "Loading the test…", hi: "टेस्ट लोड हो रहा है…" })}</p></main>;

  if (loaded.kind === "attempt") {
    return <QuizRunner attempt={loaded.view} anchor={loaded.anchor} onFinished={(result) => { setLoaded({ kind: "result", result }); window.scrollTo({ top: 0 }); }} />;
  }
  return (
    <QuizResult
      result={loaded.result}
      standardId={standardId}
      busy={busy}
      onRetake={() => void retake(loaded.result)}
      onNewTest={onHome}
      actionError={actionError && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span className="min-w-0 flex-1">{actionError.message}</span>
          {actionError.activeAttemptId && <button type="button" onClick={() => onOpen(actionError.activeAttemptId!)} className="min-h-11 rounded-lg bg-rose-700 px-3 font-semibold text-white">{t({ en: "Resume it", hi: "उसे जारी रखें" })}</button>}
        </div>
      )}
    />
  );
}
