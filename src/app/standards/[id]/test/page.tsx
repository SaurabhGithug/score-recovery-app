"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { QuizApp } from "@/components/standards/quiz/QuizApp";

/** Timed MCQ test on one standard (setup, runner, result). The questions come from the server; no AI runs here. */
export default function StandardTestPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p role="status" className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>}>
      <QuizApp standardId={id} />
    </Suspense>
  );
}
