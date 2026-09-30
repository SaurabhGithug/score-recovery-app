"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/user-context";
import {
  EXAM_CATALOG,
  EXAM_CATEGORIES,
  ENGINEERING_BRANCHES,
  ExamDefinition,
  BranchDefinition,
} from "@/lib/exam-catalog";

type OnboardingTrack = "COMPETITIVE_EXAM" | "ACADEMIC" | "BOTH";

export function OnboardingModal() {
  const pathname = usePathname();
  const { isOnboardingModalOpen, closeOnboardingModal, createContext, currentUser } = useUser();

  const [step, setStep] = useState<"track" | "category" | "exam" | "branch" | "profile" | "academic_branch">("track");
  const [selectedTrack, setSelectedTrack] = useState<OnboardingTrack | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("SSC");
  const [selectedExam, setSelectedExam] = useState<ExamDefinition | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<BranchDefinition | null>(null);
  const [academicBranch, setAcademicBranch] = useState<BranchDefinition | null>(null);
  const [degree, setDegree] = useState("B.Tech / B.E.");

  // Candidate Personalization Fields
  const [candidateCategory, setCandidateCategory] = useState<string>("UR");
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [pwbdStatus, setPwbdStatus] = useState<boolean>(false);
  const [pwbdType, setPwbdType] = useState<string>("");
  const [exServicemanStatus, setExServicemanStatus] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!isOnboardingModalOpen || !currentUser || pathname.startsWith("/learn")) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [isOnboardingModalOpen, currentUser, pathname]);

  // The Civil learning workspace has an explicit exam/branch and does not need
  // candidate demographics or a second preparation target before first practice.
  if (!isOnboardingModalOpen || !currentUser || pathname.startsWith("/learn")) {
    return null;
  }

  function handleSelectTrack(track: OnboardingTrack) {
    setSelectedTrack(track);
    setError(null);
    if (track === "COMPETITIVE_EXAM" || track === "BOTH") {
      setStep("category");
    } else {
      setStep("academic_branch");
    }
  }

  function handleSelectCategory(cat: string) {
    setSelectedCategory(cat);
    setStep("exam");
  }

  function handleSelectExam(exam: ExamDefinition) {
    setSelectedExam(exam);
    if (exam.supportsBranches && exam.availableBranches && exam.availableBranches.length > 0) {
      setStep("branch");
    } else {
      // Non-branch exam -> advance to candidate profile target tuning
      setStep("profile");
    }
  }

  function handleSelectBranch(branch: BranchDefinition) {
    setSelectedBranch(branch);
    // Move to personal candidate target configuration
    setStep("profile");
  }

  function handleSelectAcademicBranch(branch: BranchDefinition) {
    setAcademicBranch(branch);
    finishAcademicOnboarding(branch);
  }

  async function finishAcademicOnboarding(branch: BranchDefinition) {
    setSubmitting(true);
    setError(null);
    try {
      await createContext({
        name: `${branch.shortName} Engineering - College`,
        type: "ACADEMIC",
        examCategory: "Academic",
        department: branch.name,
        branch: branch.id,
        degree,
      });
      closeOnboardingModal();
      resetState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set up academic goal");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinishCompetitiveProfile() {
    if (!selectedExam) return;
    setSubmitting(true);
    setError(null);

    try {
      const contextName = selectedBranch
        ? `${selectedExam.shortCode} ${selectedBranch.shortName}`
        : selectedExam.shortCode;

      const created = await createContext({
        name: contextName,
        type: selectedTrack || "COMPETITIVE_EXAM",
        examCategory: selectedExam.category,
        examId: selectedExam.id,
        examName: selectedExam.name,
        department: selectedBranch?.name,
        branch: selectedBranch?.id,
      });

      // Persist candidate profile for target personalization
      await fetch(`/api/contexts/${created.id}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: candidateCategory,
          dateOfBirth: dateOfBirth || null,
          pwbdStatus,
          pwbdType: pwbdStatus ? pwbdType : null,
          exServicemanStatus,
          targetPosts: ["CPWD", "MES", "CWC"],
        }),
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("exam-profile-changed"));
      }

      closeOnboardingModal();
      resetState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to establish target profile");
    } finally {
      setSubmitting(false);
    }
  }

  function resetState() {
    setStep("track");
    setSelectedTrack(null);
    setSelectedExam(null);
    setSelectedBranch(null);
    setCandidateCategory("UR");
    setDateOfBirth("");
    setPwbdStatus(false);
    setPwbdType("");
    setExServicemanStatus(false);
  }

  function dismiss() {
    if (submitting) return;
    closeOnboardingModal();
    resetState();
    setError(null);
  }

  const filteredExams = EXAM_CATALOG.filter((e) => e.category === selectedCategory);

  return (
    <dialog ref={dialog} aria-label="Preparation setup" onCancel={event => { event.preventDefault(); dismiss(); }} className="install-dialog max-w-lg border-0 bg-transparent p-0">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 sm:p-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Personalized Setup • {currentUser.name}
            </span>
            <h2 className="text-lg font-extrabold text-slate-900">
              {step === "track" && "What are you preparing for?"}
              {step === "category" && "Select Exam Category"}
              {step === "exam" && `Select Target Exam (${selectedCategory})`}
              {step === "branch" && `Choose Discipline for ${selectedExam?.shortCode}`}
              {step === "profile" && "Personalise Your Exam Target"}
              {step === "academic_branch" && "Choose Your Engineering Department"}
            </h2>
          </div>
          {(
            <button
              type="button"
              onClick={dismiss}
              disabled={submitting}
              aria-label="Close setup"
              className="text-slate-400 hover:text-slate-600 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* STEP 1: TRACK SELECTION */}
        {step === "track" && (
          <div className="space-y-3">
            <button type="button" onClick={dismiss} className="rounded-lg px-2 py-2 text-sm font-medium text-slate-600">← Back to app</button>
            <button
              type="button"
              onClick={() => handleSelectTrack("COMPETITIVE_EXAM")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left hover:border-blue-500 hover:bg-blue-50/40 transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 group-hover:text-blue-700 text-sm">
                    🎯 Competitive Exam
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    SSC JE, SSC CGL, RRB, GATE, or Technical State AE/JE recruitments.
                  </p>
                </div>
                <span className="text-slate-400 group-hover:text-blue-600 text-lg">→</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTrack("ACADEMIC")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left hover:border-blue-500 hover:bg-blue-50/40 transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 group-hover:text-blue-700 text-sm">
                    🎓 Engineering / College
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    University semester curriculum, departmental syllabus, and exams.
                  </p>
                </div>
                <span className="text-slate-400 group-hover:text-blue-600 text-lg">→</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTrack("BOTH")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left hover:border-blue-500 hover:bg-blue-50/40 transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 group-hover:text-blue-700 text-sm">
                    ⚖️ Both (College + Competitive)
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Simultaneously track college syllabus and competitive mock targets.
                  </p>
                </div>
                <span className="text-slate-400 group-hover:text-blue-600 text-lg">→</span>
              </div>
            </button>
          </div>
        )}

        {/* STEP 2: CATEGORY SELECTION */}
        {step === "category" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              {EXAM_CATEGORIES.filter((c) => c !== "Academic").map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleSelectCategory(cat)}
                  className={`rounded-xl border p-3 text-left transition font-semibold text-xs ${
                    selectedCategory === cat
                      ? "border-blue-600 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="pt-2 flex justify-between">
              <button
                type="button"
                onClick={() => setStep("track")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: EXACT EXAM SELECTION (Minimal quiet card) */}
        {step === "exam" && (
          <div className="space-y-3">
            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {filteredExams.map((exam) => (
                <div
                  key={exam.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-blue-400 transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">{exam.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Staff Selection Commission</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200/80">
                          Applications close: 22 Sep 2026
                        </span>
                        <span className="text-[11px] text-slate-400">
                          CBT Paper-I: Oct–Nov 2026
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleSelectExam(exam)}
                      className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition shrink-0"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep("category")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ← Change Category
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: DISCIPLINE / BRANCH (Civil, Electrical, Mechanical) */}
        {step === "branch" && selectedExam && selectedExam.availableBranches && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Select your engineering discipline for {selectedExam.shortCode}:
            </p>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {selectedExam.availableBranches.map((br) => (
                <button
                  key={br.id}
                  type="button"
                  onClick={() => handleSelectBranch(br)}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:border-blue-600 hover:bg-blue-50/50 hover:shadow-xs transition group"
                >
                  <span className="font-black text-slate-900 text-xs group-hover:text-blue-700 block">
                    {br.name}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 mt-1 block">
                    Part-A Technical
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep("exam")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ← Back to Exams
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: CANDIDATE TARGET PERSONALIZATION */}
        {step === "profile" && selectedExam && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
              <strong>{selectedExam.shortCode} {selectedBranch ? `(${selectedBranch.shortName})` : ""}</strong>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Now set your category so we can tune your Preparation Target according to historical SSC cutoffs.
              </p>
            </div>

            {/* Social Category */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Reservation Category
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(["UR", "EWS", "OBC", "SC", "ST"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCandidateCategory(cat)}
                    className={`rounded-xl border py-2 text-xs font-extrabold transition text-center ${
                      candidateCategory === cat
                        ? "border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20 shadow-xs"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2 text-[11px] text-slate-600">
                Target Preview:{" "}
                <strong className="text-slate-900">
                  {candidateCategory === "UR" && "135 marks (Cutoff: 127.23 + 8 buffer)"}
                  {candidateCategory === "EWS" && "130 marks (Cutoff: 122.40 + 8 buffer)"}
                  {candidateCategory === "OBC" && "133 marks (Cutoff: 125.80 + 8 buffer)"}
                  {candidateCategory === "SC" && "118 marks (Cutoff: 110.12 + 8 buffer)"}
                  {candidateCategory === "ST" && "114 marks (Cutoff: 106.40 + 8 buffer)"}
                </strong>
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Date of Birth (Optional)
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>

            {/* Accommodations */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pwbdStatus}
                  onChange={(e) => setPwbdStatus(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>PwBD candidate (Eligible for compensatory time & scribe)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exServicemanStatus}
                  onChange={(e) => setExServicemanStatus(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Ex-Servicemen (ESM)</span>
              </label>
            </div>

            {/* Submit */}
            <div className="pt-3 flex justify-between items-center border-t border-slate-100">
              <button
                type="button"
                onClick={() => (selectedExam.supportsBranches ? setStep("branch") : setStep("exam"))}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinishCompetitiveProfile}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-blue-700 active:scale-98 transition disabled:opacity-50"
              >
                {submitting ? "Building Target..." : "Build My Preparation Target →"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: ACADEMIC DEPARTMENT FLOW */}
        {step === "academic_branch" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Degree Track:
              </label>
              <select
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-hidden"
              >
                <option value="B.Tech / B.E.">B.Tech / B.E. (Undergraduate)</option>
                <option value="Diploma Engineering">Polytechnic / Diploma Engineering</option>
                <option value="M.Tech / M.E.">M.Tech / M.E. (Postgraduate)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Choose Department / Branch:
              </label>
              <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                {ENGINEERING_BRANCHES.map((br) => (
                  <button
                    key={br.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSelectAcademicBranch(br)}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-500 hover:bg-blue-50/40 transition group"
                  >
                    <span className="font-bold text-slate-900 text-xs group-hover:text-blue-700 block">
                      {br.name}
                    </span>
                    <span className="text-[10px] text-slate-400">{br.shortName}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep("track")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ← Back
              </button>
              {submitting && <span className="text-xs text-blue-600 animate-pulse">Saving...</span>}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
