"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/user-context";

interface QuestionOption {
  id: string;
  text: string;
}

interface ReviewQuestion {
  id: string;
  question_number: number | null;
  question_text: string;
  options: string;
  correct_answer: string | null;
  explanation: string | null;
  source_page: number;
  source_image_crop: string | null;
  verification_status: string;
  review_reason: string | null;
  extraction_confidence: number;
  source_type: string;
  metadata: string | null;
}

function proofQuote(q: ReviewQuestion): string | null {
  if (q.source_type !== "GENERATED") return null;
  try {
    return JSON.parse(q.metadata || "{}")?.generation?.sourceQuote ?? null;
  } catch {
    return null;
  }
}

export default function ReviewQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const { currentUser } = useUser();
  const router = useRouter();

  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Edit fields
  const [editText, setEditText] = useState("");
  const [editOptions, setEditOptions] = useState<QuestionOption[]>([]);
  const [editAnswer, setEditAnswer] = useState("");

  useEffect(() => {
    async function load() {
      if (!currentUser) return;
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          headers: { "x-user-id": currentUser.id },
        });
        if (res.ok) {
          const data = await res.json();
          const allQs: ReviewQuestion[] = data.questions || [];
          const needReview = allQs.filter((q) => q.verification_status === "NEEDS_REVIEW");
          setQuestions(needReview.length > 0 ? needReview : allQs);
        }
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [docId, currentUser]);

  const currentQ = questions[currentIndex] || null;

  useEffect(() => {
    if (currentQ) {
      setEditText(currentQ.question_text);
      try {
        setEditOptions(JSON.parse(currentQ.options));
      } catch {
        setEditOptions([]);
      }
      setEditAnswer(currentQ.correct_answer || "");
      setIsEditing(false);
    }
  }, [currentQ]);

  async function handleAction(status: "VERIFIED" | "REJECTED") {
    if (!currentQ || !currentUser) return;
    setActionInProgress(true);

    try {
      const payload: Record<string, unknown> = { status };
      if (isEditing) {
        payload.questionText = editText;
        payload.options = editOptions;
        payload.correctAnswer = editAnswer || null;
      }

      const res = await fetch(`/api/questions/${currentQ.id}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Remove from review queue or advance
        const nextList = questions.filter((q) => q.id !== currentQ.id);
        setQuestions(nextList);
        if (currentIndex >= nextList.length) {
          setCurrentIndex(Math.max(0, nextList.length - 1));
        }
      }
    } finally {
      setActionInProgress(false);
      setIsEditing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-slate-500">
        Loading review items...
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-600">
          ✓
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">Review Complete!</h2>
        <p className="text-xs text-slate-500">
          All flagged questions have been verified or resolved.
        </p>
        <div className="pt-3 flex justify-center gap-3">
          <Link
            href={`/library/${docId}/practice`}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
          >
            Start Practice
          </Link>
          <Link
            href={`/library/${docId}`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Document Details
          </Link>
        </div>
      </div>
    );
  }

  let optionsList: QuestionOption[] = [];
  try {
    optionsList = JSON.parse(currentQ.options);
  } catch {
    optionsList = [];
  }
  const quote = proofQuote(currentQ);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Check the source
          </span>
          <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl">
            {questions.length} questions need review
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700">
            {currentIndex + 1} of {questions.length}
          </span>
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((p) => p - 1)}
            className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 disabled:opacity-40"
          >
            ◀
          </button>
          <button
            type="button"
            disabled={currentIndex >= questions.length - 1}
            onClick={() => setCurrentIndex((p) => p + 1)}
            className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 disabled:opacity-40"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => router.push(`/library/${docId}`)}
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Review Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-3">
          <span className="font-bold text-slate-800">
            Question {currentQ.question_number || "-"}
          </span>
          <span>Page {currentQ.source_page}</span>
        </div>

        {/* Source Crop / Visual Provenance Image */}
        {currentQ.source_image_crop && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Original Source Page
            </span>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/documents/${docId}/crop/${currentQ.source_image_crop}`}
                alt={`Source crop page ${currentQ.source_page}`}
                className="mx-auto rounded-lg border border-slate-200 shadow-xs max-w-full"
              />
            </div>
          </div>
        )}

        {/* Proof sentence for AI-generated questions */}
        {quote && (
          <div className="space-y-1.5 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
              Proof from your material · page {currentQ.source_page}
            </span>
            <p className="text-sm text-slate-800">“{quote}”</p>
            {currentQ.explanation && (
              <p className="text-xs text-slate-600">
                <span className="font-semibold">Writer&apos;s explanation:</span> {currentQ.explanation}
              </p>
            )}
          </div>
        )}

        {/* Extracted Question & Options */}
        <div className="space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700">
            {currentQ.source_type === "GENERATED" ? "AI-generated question" : "Extracted Content"}
          </span>

          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Question Text:
                </label>
                <textarea
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Options:</label>
                {editOptions.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <span className="w-6 font-bold text-slate-700 text-xs">{opt.id}.</span>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => {
                        const updated = [...editOptions];
                        updated[i].text = e.target.value;
                        setEditOptions(updated);
                      }}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Correct Answer (A, B, C, or D):
                </label>
                <input
                  type="text"
                  maxLength={1}
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value.toUpperCase())}
                  placeholder="e.g. C"
                  className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-xs uppercase font-bold"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-base font-semibold text-slate-900 leading-relaxed">
                {currentQ.question_text}
              </p>

              <div className="grid gap-2 sm:grid-cols-2 pt-2">
                {optionsList.map((opt) => {
                  const isMarked = currentQ.correct_answer === opt.id;
                  return (
                    <div
                      key={opt.id}
                      className={`rounded-xl border px-3.5 py-2 text-xs flex items-center gap-2 ${
                        isMarked
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-medium"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <span className="font-bold">{opt.id}.</span>
                      <span>{opt.text}</span>
                      {isMarked && <span className="ml-auto text-emerald-600 font-bold">✓</span>}
                    </div>
                  );
                })}
              </div>

              {currentQ.correct_answer && (
                <p className="text-xs text-slate-500 pt-1">
                  Detected Answer: <strong className="text-blue-600">{currentQ.correct_answer}</strong>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Issue Warning Banner */}
        {currentQ.review_reason && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <span className="font-bold">Issue Flagged:</span> {currentQ.review_reason}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <button
              type="button"
              onClick={() => setIsEditing((prev) => !prev)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              {isEditing ? "Cancel Editing" : "✎ Edit Question"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => handleAction("REJECTED")}
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
            >
              Reject
            </button>

            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => handleAction("VERIFIED")}
              className="rounded-lg bg-emerald-600 px-5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              {isEditing ? "Save & Accept" : "Accept ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
