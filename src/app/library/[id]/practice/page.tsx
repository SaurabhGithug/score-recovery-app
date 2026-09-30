"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExamRunner } from "@/components/ExamRunner";
import { useUser } from "@/lib/user-context";
import { buildRecoveryReport, updateLedgerWithDiagnosis } from "@/lib/diagnosis";
import {
  genId,
  getLedger,
  saveAttempt,
  saveLedger,
  saveReport,
} from "@/lib/storage";
import { Attempt, Question, ResponseEvent } from "@/lib/types";
import { PlatformStore } from "@/lib/storage/platform-store";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";
import { FeedbackButton } from "@/components/FeedbackButton";

interface ImportedQuestionData {
  id: string;
  document_id: string;
  user_id: string;
  question_number: number | null;
  question_text: string;
  options: string;
  correct_answer: string | null;
  explanation: string | null;
  subject: string | null;
  topic: string | null;
  difficulty: number;
  source_page: number;
  source_image_crop: string | null;
  verification_status: string;
  source_type: string;
  metadata: string | null;
}

/** For AI-generated questions, append the sentence from the student's own material that proves the answer. */
// A question without a key that names one of its own options is not practisable:
// scoring it would mean inventing an answer.
function hasMatchingKey(iq: ImportedQuestionData): boolean {
  if (!iq.correct_answer) return false;
  try {
    const options = JSON.parse(iq.options) as { id?: string }[];
    return options.some((option) => option.id === iq.correct_answer);
  } catch {
    return false;
  }
}

function withProof(iq: ImportedQuestionData, docName: string): { en: string; hi: string } {
  const fallback = {
    en: iq.explanation || `Extracted from ${docName}, Page ${iq.source_page}.`,
    hi: iq.explanation || `${docName}, पृष्ठ ${iq.source_page} से उद्धृत।`,
  };
  if (iq.source_type !== "GENERATED") return fallback;

  let quote = "";
  try {
    quote = JSON.parse(iq.metadata || "{}")?.generation?.sourceQuote ?? "";
  } catch {
    // no proof stored
  }
  const base = iq.explanation || "";
  if (!quote) return { en: base, hi: base };
  return {
    en: `${base}\n\nFrom your material, page ${iq.source_page}: “${quote}”`,
    hi: `${base}\n\nआपकी सामग्री, पृष्ठ ${iq.source_page}: “${quote}”`,
  };
}

type DifficultyFilter = "all" | "1" | "2" | "3";
type SessionPhase = "intro" | "running";

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

export default function DocumentPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const { currentUser, activeContext } = useUser();
  const router = useRouter();

  const [documentName, setDocumentName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [sourceCrops, setSourceCrops] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeCrop, setActiveCrop] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("intro");
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString());
  const [topic, setTopic] = useState("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [questionLimit, setQuestionLimit] = useState(10);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(60);
  const [immediateFeedback, setImmediateFeedback] = useState(false);

  useDeclareAttemptMode(phase === "running" ? "exam" : null);

  useEffect(() => {
    async function load() {
      if (!currentUser) return;
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          headers: { "x-user-id": currentUser.id },
        });
        if (res.ok) {
          const data = await res.json();
          const doc = data.document;
          setDocumentName(doc.original_name);

          const rawQuestions: ImportedQuestionData[] = data.questions || [];
          // Only practice ready and verified questions that carry a usable answer key
          const readyQuestions = rawQuestions.filter(
            (q) =>
              (q.verification_status === "AUTO_ACCEPTED" || q.verification_status === "VERIFIED") &&
              hasMatchingKey(q)
          );

          const cropsMap: Record<string, string> = {};
          readyQuestions.forEach((q) => {
            if (q.source_image_crop) {
              cropsMap[q.id] = q.source_image_crop;
            }
          });
          setSourceCrops(cropsMap);

          // Adapt to ExamRunner Question type
          const adapted: Question[] = readyQuestions.map((iq) => {
            let parsedOpts: { id: string; text: string }[] = [];
            try {
              parsedOpts = JSON.parse(iq.options);
            } catch {
              parsedOpts = [];
            }

            const options = parsedOpts.map((o) => ({
              id: o.id as "A" | "B" | "C" | "D",
              text: { en: o.text, hi: o.text },
            }));

            const correctId = iq.correct_answer as "A" | "B" | "C" | "D";

            let section: "quant" | "reasoning" | "english" | "gk" = "quant";
            const subLower = (iq.subject || "").toLowerCase();
            if (subLower.includes("reasoning")) section = "reasoning";
            else if (subLower.includes("english")) section = "english";
            else if (
              subLower.includes("general") ||
              subLower.includes("gk") ||
              subLower.includes("awareness")
            )
              section = "gk";
            else if (subLower.includes("quant") || subLower.includes("math")) section = "quant";

            const conceptName = iq.topic || iq.subject || `${doc.original_name} P${iq.source_page}`;

            return {
              id: iq.id,
              section,
              concept: conceptName,
              conceptLabel: { en: conceptName, hi: conceptName },
              difficulty: (iq.difficulty as 1 | 2 | 3) || 2,
              marks: 2,
              negativeMarks: 0.5,
              text: { en: iq.question_text, hi: iq.question_text },
              options,
              correctOptionId: correctId,
              explanation: withProof(iq, doc.original_name),
              expectedTimeSeconds: 60,
            };
          });

          setQuestions(adapted);
        }
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [docId, currentUser]);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    questions.forEach((question) => {
      counts.set(question.concept, (counts.get(question.concept) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [questions]);

  const eligibleQuestions = useMemo(
    () =>
      questions.filter(
        (question) =>
          (topic === "all" || question.concept === topic) &&
          (difficulty === "all" || question.difficulty === Number(difficulty))
      ),
    [difficulty, questions, topic]
  );

  const selectedQuestions = useMemo(
    () => eligibleQuestions.slice(0, Math.min(questionLimit, eligibleQuestions.length)),
    [eligibleQuestions, questionLimit]
  );

  const difficultyCounts = useMemo(() => {
    const topicQuestions = questions.filter((question) => topic === "all" || question.concept === topic);
    return {
      all: topicQuestions.length,
      1: topicQuestions.filter((question) => question.difficulty === 1).length,
      2: topicQuestions.filter((question) => question.difficulty === 2).length,
      3: topicQuestions.filter((question) => question.difficulty === 3).length,
    };
  }, [questions, topic]);

  function beginPractice() {
    if (selectedQuestions.length === 0) return;
    setSessionQuestions(selectedQuestions);
    setStartedAt(new Date().toISOString());
    setPhase("running");
  }

  function handleFinish(responses: ResponseEvent[]) {
    if (!currentUser) return;

    const attempt: Attempt = {
      id: genId("att-doc"),
      examId: `doc-${docId}`,
      userId: currentUser.id,
      contextId: activeContext?.id,
      startedAt,
      submittedAt: new Date().toISOString(),
      responses,
      interrupted: false,
    };

    const ledgerBefore = getLedger(currentUser.id, activeContext?.id);
    const report = buildRecoveryReport(attempt, sessionQuestions, ledgerBefore, sessionQuestions);
    report.userId = currentUser.id;
    report.contextId = activeContext?.id;
    const ledgerAfter = updateLedgerWithDiagnosis(
      ledgerBefore,
      report.diagnosis,
      attempt.id,
      attempt.submittedAt!
    );

    // Save strictly under the active user's partition and active context
    saveAttempt(attempt, currentUser.id, activeContext?.id);
    saveReport(report, currentUser.id, activeContext?.id);
    saveLedger(ledgerAfter, currentUser.id, activeContext?.id);

    // Update 4-Brain student state
    responses.forEach((res) => {
      const q = sessionQuestions.find((item) => item.id === res.questionId);
      if (q) {
        PlatformStore.recordStudentAttempt(
          {
            id: `att-doc-${res.questionId}-${Date.now()}`,
            studentId: currentUser.id,
            examId: `doc-${docId}`,
            questionId: res.questionId,
            selectedOptionKey: res.selectedOptionId,
            isCorrect: res.isCorrect,
            timeSpentSeconds: res.timeSpentSeconds,
            visitCount: res.visitCount,
            answerChangeCount: res.answerChangeCount,
            markedForReview: res.markedForReview,
            confidenceSelfReport: res.confidence,
            createdAt: new Date().toISOString(),
          },
          q.concept,
          q.expectedTimeSeconds,
          q.difficulty
        );
      }
    });

    router.push(`/results/${attempt.id}`);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-slate-500">
        Preparing practice session...
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">No Ready Questions</h2>
        <p className="text-xs text-slate-500">
          This document has no verified questions ready for practice yet. Review flagged questions first.
        </p>
        <Link
          href={`/library/${docId}/review`}
          className="inline-block rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition"
        >
          Go to Review
        </Link>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-7 sm:py-10">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Build a practice session</span>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">Learn with MCQs</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Choose exactly what you want to practise from <strong className="text-slate-700">{documentName}</strong>.
            </p>
          </div>
          <FeedbackButton documentId={docId} placement="practice_setup" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="space-y-6">
              <fieldset>
                <legend className="text-sm font-bold text-slate-900">1. Choose a topic</legend>
                <p className="mt-1 text-xs text-slate-500">Topics found in your uploaded material.</p>
                <select
                  value={topic}
                  onChange={(event) => {
                    setTopic(event.target.value);
                    setDifficulty("all");
                  }}
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All topics ({questions.length})</option>
                  {topics.map(([name, count]) => (
                    <option key={name} value={name}>{name} ({count})</option>
                  ))}
                </select>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-bold text-slate-900">2. Choose difficulty</legend>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["all", "1", "2", "3"] as const).map((value) => {
                    const count = difficultyCounts[value];
                    const label = value === "all" ? "Mixed" : DIFFICULTY_LABEL[Number(value) as 1 | 2 | 3];
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={count === 0}
                        onClick={() => setDifficulty(value)}
                        className={`rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          difficulty === value
                            ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <span className="block text-sm font-bold">{label}</span>
                        <span className="text-[11px] text-slate-500">{count} available</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-slate-900">3. Number of questions</span>
                  <select
                    value={questionLimit}
                    onChange={(event) => setQuestionLimit(Number(event.target.value))}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-800 outline-hidden focus:border-blue-500"
                  >
                    {[5, 10, 20, 50].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                    <option value={Math.max(eligibleQuestions.length, 1)}>All available</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-900">4. Timer</span>
                  <select
                    value={secondsPerQuestion}
                    onChange={(event) => setSecondsPerQuestion(Number(event.target.value))}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-800 outline-hidden focus:border-blue-500"
                  >
                    <option value={0}>Untimed</option>
                    <option value={30}>30 seconds / question</option>
                    <option value={60}>60 seconds / question</option>
                    <option value={90}>90 seconds / question</option>
                    <option value={120}>2 minutes / question</option>
                  </select>
                </label>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={immediateFeedback}
                  onChange={(event) => setImmediateFeedback(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Learning mode</span>
                  <span className="block text-xs text-slate-500">Show the correct answer and explanation after every selection.</span>
                </span>
              </label>
            </div>
          </div>

          <aside className="h-fit rounded-2xl bg-slate-900 p-5 text-white shadow-sm lg:sticky lg:top-20">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Your session</p>
            <div className="mt-4 space-y-3 border-y border-white/10 py-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-400">Topic</span><strong className="max-w-[170px] truncate text-right">{topic === "all" ? "All topics" : topic}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Difficulty</span><strong>{difficulty === "all" ? "Mixed" : DIFFICULTY_LABEL[Number(difficulty) as 1 | 2 | 3]}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Questions</span><strong>{selectedQuestions.length}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Time</span><strong>{secondsPerQuestion === 0 ? "Untimed" : `${Math.ceil((selectedQuestions.length * secondsPerQuestion) / 60)} min`}</strong></div>
            </div>
            {selectedQuestions.length === 0 && (
              <p className="mt-4 rounded-lg bg-amber-400/15 p-3 text-xs text-amber-200">No questions match this topic and difficulty. Try another combination.</p>
            )}
            <button
              type="button"
              disabled={selectedQuestions.length === 0}
              onClick={beginPractice}
              className="mt-5 w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start {selectedQuestions.length}-question session →
            </button>
            <Link href={`/library/${docId}`} className="mt-3 block text-center text-xs text-slate-400 hover:text-white">Back to document</Link>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 space-y-4">
      {/* Visual Provenance "View Source" Floating Button */}
      <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-200 pb-2">
        <span className="font-semibold text-slate-800 truncate">{documentName}</span>
        <div className="flex items-center gap-2">
          <FeedbackButton documentId={docId} placement="practice_session" compact />
          {Object.keys(sourceCrops).length > 0 && (
            <button
              type="button"
              onClick={() => {
                const firstCrop = sessionQuestions.map((question) => sourceCrops[question.id]).find(Boolean);
                if (firstCrop) setActiveCrop(firstCrop);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition"
            >
              <span>📄</span>
              <span className="hidden sm:inline">View Source</span>
            </button>
          )}
        </div>
      </div>

      {/* Existing Score Recovery ExamRunner */}
      <ExamRunner
        questions={sessionQuestions}
        durationSeconds={secondsPerQuestion > 0 ? sessionQuestions.length * secondsPerQuestion : undefined}
        immediateFeedback={immediateFeedback}
        onFinish={handleFinish}
      />

      {/* Source Provenance Modal */}
      {activeCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Original Source Page
              </h3>
              <button
                type="button"
                onClick={() => setActiveCrop(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/documents/${docId}/crop/${activeCrop}`}
                alt="Source preview"
                className="mx-auto rounded-lg max-w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
