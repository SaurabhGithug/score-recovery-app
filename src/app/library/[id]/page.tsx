"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/user-context";
import { useLang } from "@/lib/i18n";
import { GeneratePracticePanel } from "@/components/GeneratePracticePanel";

interface DocumentDetail {
  document: {
    id: string;
    original_name: string;
    mime_type: string;
    file_size_bytes: number;
    document_type: string;
    extraction_status: string;
    status_message: string | null;
    parser_used: string | null;
    page_count: number;
    questions_count: number;
    ready_questions_count: number;
    review_questions_count: number;
    metadata?: string | Record<string, unknown>;
    created_at: string;
  };
  questions: {
    id: string;
    question_number: number | null;
    question_text: string;
    options: string;
    correct_answer: string | null;
    subject: string | null;
    topic: string | null;
    source_page: number;
    verification_status: string;
    source_type: string;
  }[];
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    currentUser,
    activeContext,
    switchContext,
    allContexts,
    openOnboardingModal,
  } = useUser();
  const { t } = useLang();
  const router = useRouter();
  const [data, setData] = useState<DocumentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const fetchDocument = useCallback(async (): Promise<DocumentDetail | null> => {
    if (!currentUser) return null;
    const res = await fetch(`/api/documents/${id}`, {
      headers: { "x-user-id": currentUser.id },
    });
    if (!res.ok) {
      throw new Error("Failed to load document");
    }
    return res.json();
  }, [id, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchDocument()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error loading document"))
      .finally(() => setIsLoading(false));
  }, [currentUser, fetchDocument]);

  // Refresh counts and the sample after a generation run finishes.
  const reload = useCallback(() => {
    fetchDocument().then((json) => json && setData(json)).catch(() => {});
  }, [fetchDocument]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-500 text-sm">
        Loading document analysis...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-red-600 mb-4">{error || "Document not found"}</p>
        <button
          onClick={() => router.push("/library")}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const { document, questions } = data;

  // Aggregate questions by subject
  const subjectBreakdown: Record<string, number> = {};
  questions.forEach((q) => {
    const sub = q.subject || "Unclassified";
    subjectBreakdown[sub] = (subjectBreakdown[sub] || 0) + 1;
  });

  const isLearningContent = document.questions_count === 0 && document.page_count > 0;

  let branchCompat: {
    isCompatible: boolean;
    inferredBranch?: string;
    targetBranch?: string;
    warningMessage?: string;
  } | null = null;
  if (typeof document.metadata === "string") {
    try {
      const parsed = JSON.parse(document.metadata);
      branchCompat = parsed.branchCompatibility || null;
    } catch {
      // ignore
    }
  } else if (document.metadata && typeof document.metadata === "object") {
    branchCompat = (document.metadata as Record<string, unknown>).branchCompatibility as typeof branchCompat;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 space-y-7">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/library" className="hover:text-blue-600 transition">
          ← {t({ en: "My Library", hi: "मेरी लाइब्रेरी" })}
        </Link>
        <span>/</span>
        <span className="truncate max-w-xs text-slate-700">{document.original_name}</span>
      </div>

      {/* Branch Mismatch Compatibility Warning Banner */}
      {branchCompat && branchCompat.isCompatible === false && !dismissedWarning && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/95 p-5 text-amber-900 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5">⚠️</span>
            <div className="flex-1 space-y-2">
              <h3 className="font-bold text-sm text-amber-900">
                Discipline / Branch Mismatch Detected
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                {branchCompat.warningMessage ||
                  `This material appears to be ${(branchCompat.inferredBranch || "").toUpperCase()} Engineering, but your current preparation goal is ${activeContext?.name || "different"}.`}
              </p>
              <p className="text-xs text-amber-700">
                Questions from this document are available for practice, but practicing them under a different target exam may dilute discipline-specific readiness analytics.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const matching = allContexts.find(
                      (c) =>
                        c.branch?.toLowerCase() === branchCompat?.inferredBranch?.toLowerCase() ||
                        c.name.toLowerCase().includes(branchCompat?.inferredBranch?.toLowerCase() || "")
                    );
                    if (matching) {
                      switchContext(matching.id);
                    } else {
                      openOnboardingModal();
                    }
                  }}
                  className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-800 transition"
                >
                  Switch Preparation Goal
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedWarning(true)}
                  className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                >
                  Import Here Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Overview Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 mb-2">
              {document.document_type || "DOCUMENT"}
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              {document.original_name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{document.page_count} pages analyzed</span>
              <span>•</span>
              <span>{(document.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
              {document.parser_used && (
                <>
                  <span>•</span>
                  <span>Parser: <strong className="text-slate-700">{document.parser_used}</strong></span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {document.ready_questions_count > 0 && (
              <Link
                href={`/library/${document.id}/practice`}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
              >
                Start Practice ({document.ready_questions_count})
              </Link>
            )}
            {document.review_questions_count > 0 && (
              <Link
                href={`/library/${document.id}/review`}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition"
              >
                Review ({document.review_questions_count})
              </Link>
            )}
          </div>
        </div>

        {/* Content Type Alerts */}
        {isLearningContent ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900">
            <h4 className="font-bold text-sm mb-1">Learning Content Detected</h4>
            <p className="text-blue-800">
              This material contains textbook or reference learning chapters without standalone
              practice questions. Generate practice questions from it below.
            </p>
          </div>
        ) : (
          <>
            {/* Extraction Counts */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-center">
                <span className="text-xs text-slate-500 font-medium">Total Questions</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{document.questions_count}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
                <span className="text-xs text-emerald-800 font-medium">Ready to Practice</span>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">{document.ready_questions_count}</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 text-center">
                <span className="text-xs text-amber-800 font-medium">Needs Review</span>
                <p className="text-2xl font-extrabold text-amber-700 mt-1">{document.review_questions_count}</p>
              </div>
            </div>

            {/* Subject Distribution */}
            {Object.keys(subjectBreakdown).length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Subject & Section Breakdown
                </h3>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                  {Object.entries(subjectBreakdown).map(([subject, count]) => (
                    <div key={subject} className="flex items-center justify-between py-2 px-3 text-xs">
                      <span className="font-semibold text-slate-800">{subject}</span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 font-bold text-slate-700 shadow-2xs border border-slate-200">
                        {count} questions
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {document.page_count > 0 && (
        <GeneratePracticePanel
          documentId={document.id}
          onQuestionsChanged={reload}
          hasExistingQuestions={document.questions_count > 0}
        />
      )}

      {/* Questions Preview Sample */}
      {questions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Questions Sample</h3>
            <span className="text-xs text-slate-400">Showing first {Math.min(5, questions.length)}</span>
          </div>

          <div className="space-y-3">
            {questions.slice(0, 5).map((q) => (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                  <span>
                    Q{q.question_number || "-"} • Page {q.source_page}
                    {q.source_type === "GENERATED" && (
                      <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                        AI-generated
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-semibold ${
                      q.verification_status === "AUTO_ACCEPTED" || q.verification_status === "VERIFIED"
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  >
                    {q.verification_status}
                  </span>
                </div>
                <p className="font-medium text-slate-800 text-sm">{q.question_text}</p>
                {q.correct_answer && (
                  <p className="mt-2 text-slate-500">
                    Correct Answer: <strong className="text-blue-600">{q.correct_answer}</strong>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
