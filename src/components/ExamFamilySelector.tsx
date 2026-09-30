"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { SSC_JE_BRANCHES, SSC_JE_EXAM_ID } from "@/lib/ssc-je/config";
import { examBrain } from "@/lib/domain/exam-brain";
import { PlatformStore } from "@/lib/storage/platform-store";
import { ExamOrganizationRole } from "@/lib/domain/schema";
import { SscJeNotificationExplorer } from "./SscJeNotificationExplorer";

interface ExamFamilySelectorProps {
  onExamChange?: (examId: string, branchId?: string) => void;
}

export function ExamFamilySelector({ onExamChange }: ExamFamilySelectorProps) {
  const { t } = useLang();
  const [selectedExamId, setSelectedExamId] = useState<string>(SSC_JE_EXAM_ID);
  const [selectedBranch, setSelectedBranch] = useState<string>("civil");
  const [showRolesModal, setShowRolesModal] = useState<boolean>(false);
  const [showNotificationExplorer, setShowNotificationExplorer] = useState<boolean>(false);
  const [activeRoles, setActiveRoles] = useState<ExamOrganizationRole[]>([]);

  useEffect(() => {
    const profile = PlatformStore.getActiveStudentProfile();
    setSelectedExamId(profile.examId);
    if (profile.branchId) {
      setSelectedBranch(profile.branchId);
    }
  }, []);

  function handleSelectExam(examId: string) {
    setSelectedExamId(examId);
    const branch = examId === SSC_JE_EXAM_ID ? selectedBranch : undefined;
    PlatformStore.setActiveStudentProfile({ examId, branchId: branch });
    onExamChange?.(examId, branch);
  }

  function handleSelectBranch(branchCode: string) {
    setSelectedBranch(branchCode);
    PlatformStore.setActiveStudentProfile({ branchId: branchCode });
    onExamChange?.(selectedExamId, branchCode);
  }

  function handleInspectRoles(examId: string) {
    const roles = examBrain.getRolesForExam(examId);
    setActiveRoles(roles);
    setShowRolesModal(true);
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/50 p-5 shadow-sm transition-all sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              {t({ en: "Exam", hi: "लक्षित परीक्षा पैक" })}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">
            {t({ en: "Choose your exam and branch", hi: "परीक्षा एवं अभियांत्रिकी शाखा चुनें" })}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            {t({
              en: "Each exam has its own subjects, marking rules and official sources.",
              hi: "स्वतंत्र ब्लूप्रिंट, अंकन प्रणाली एवं परीक्षा एजेंसी साक्ष्यों के साथ पृथक परीक्षा प्रणालियाँ।",
            })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleInspectRoles(selectedExamId)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-blue-700 sm:self-auto"
        >
          <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t({ en: "Who runs this exam?", hi: "परीक्षा एजेंसी साक्ष्य" })}
        </button>
      </div>

      {/* Exam Showcase - Exclusive Focus on SSC JE 2026 */}
      <div className="mt-5">
        <div className="rounded-xl border border-blue-600 bg-blue-50/40 p-5 shadow-sm ring-1 ring-blue-600">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  {t({ en: "Verified 2026 Official Notice", hi: "सत्यापित 2026 आधिकारिक अधिसूचना" })}
                </span>
                <span className="text-[11px] font-mono font-semibold text-slate-600 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                  Notice F. No. HQ-C-3019/1/2026-C-3
                </span>
                <span className="text-[11px] text-slate-500">
                  {t({ en: "Published on 02.09.2026", hi: "02.09.2026 को प्रकाशित" })}
                </span>
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900 sm:text-xl">
                {t({ en: "SSC Junior Engineer & Scientific Assistant Examination, 2026", hi: "एसएससी जूनियर इंजीनियर एवं वैज्ञानिक सहायक परीक्षा, 2026" })}
              </h3>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                Staff Selection Commission (HQ), New Delhi · 1,748 Vacancies · Group &apos;B&apos; Level-6 (₹35,400–₹1,12,400)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNotificationExplorer(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400 bg-white px-3.5 py-1.5 text-xs font-bold text-blue-700 shadow-xs hover:bg-blue-50 transition"
              >
                <span>📋</span>
                <span>{t({ en: "Read the 2026 notice", hi: "आधिकारिक 2026 अधिसूचना अन्वेषक" })}</span>
              </button>
            </div>
          </div>

          {/* Quick Notification Highlights Bar */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
            <div className="rounded-lg bg-white/90 p-2.5 border border-blue-200/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">{t({ en: "Application Window", hi: "आवेदन विंडो" })}</span>
              <span className="font-bold text-slate-800">02.09.2026 – 22.09.2026</span>
            </div>
            <div className="rounded-lg bg-white/90 p-2.5 border border-blue-200/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">{t({ en: "Paper-I (Qualifying)", hi: "पेपर-I (अर्हकारी)" })}</span>
              <span className="font-bold text-blue-700">Oct/Nov 2026 (+1 / −0.25)</span>
            </div>
            <div className="rounded-lg bg-white/90 p-2.5 border border-blue-200/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">{t({ en: "Paper-II (Rank Deciding)", hi: "पेपर-II (मेरिट निर्धारक)" })}</span>
              <span className="font-bold text-emerald-700">Dec 2026 (+3 / −1.0)</span>
            </div>
            <div className="rounded-lg bg-white/90 p-2.5 border border-blue-200/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">{t({ en: "Tools in the test", hi: "कंसोल उपकरण" })}</span>
              <span className="font-bold text-purple-700">Sci-Calc + IS 456 Data</span>
            </div>
          </div>

          {/* Branch Selection (Required for SSC JE) */}
          <div className="mt-5 border-t border-blue-200/60 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                {t({ en: "Choose your branch:", hi: "अपनी इंजीनियरिंग शाखा / संवर्ग चुनें:" })}
              </label>
              <span className="text-[11px] font-medium text-slate-500">8 Official Streams & Cadres</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SSC_JE_BRANCHES.map((b) => (
                <button
                  key={b.branchCode}
                  type="button"
                  onClick={() => handleSelectBranch(b.branchCode)}
                  className={`rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
                    selectedBranch === b.branchCode
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-bold">{t(b.name).split(" (")[0]}</div>
                  <div className={`mt-0.5 text-[10px] ${selectedBranch === b.branchCode ? "text-blue-100" : "text-slate-500"}`}>
                    {t(b.name).includes("(") ? "(" + t(b.name).split("(")[1] : "Core Stream"}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-start gap-2">
              <span className="text-emerald-700 text-sm mt-0.5">✓</span>
              <div>
                <p className="font-bold text-emerald-900">
                  {t({
                    en: "Official 2026 Examination Scheme Active:",
                    hi: "आधिकारिक 2026 परीक्षा योजना सक्रिय:",
                  })}
                </p>
                <p className="text-emerald-800 mt-0.5">
                  {t({
                    en: "Paper-I is qualifying (+1 / −0.25, 200 Qs / 120 min). Paper-II normalized score decides the final appointment merit (+3 / −1.0, 100 Qs / 300 Marks / 120 min). On-screen scientific calculator and IS 456 / Steam Tables are provided directly inside the test runner console.",
                    hi: "पेपर-I अर्हक है (+1 / −0.25, 200 प्रश्न / 120 मिनट)। केवल पेपर-II का सामान्यीकृत स्कोर अंतिम मेरिट निर्धारित करता है (+3 / −1.0, 100 प्रश्न / 300 अंक / 120 मिनट)। ऑन-स्क्रीन वैज्ञानिक कैलकुलेटर और IS 456 / स्टीम टेबल सीधे परीक्षा कंसोल में उपलब्ध हैं।",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conducting Body Evidence Modal */}
      {showRolesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  {t({ en: "Exam organisers and their roles", hi: "संस्थागत साक्ष्य एवं भूमिका पृथक्करण" })}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  SSC Junior Engineer Examination, 2026
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRolesModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-left">
              {activeRoles.map((role) => (
                <div key={role.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 uppercase text-[11px] tracking-wide text-blue-800">
                      {role.roleType.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        role.verificationStatus === "verified"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {role.verificationStatus} ({role.confidenceLevel} confidence)
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-slate-800">{role.organizationName}</p>
                  <p className="mt-1 text-slate-600">
                    <span className="font-semibold text-slate-700">Source:</span> {role.evidenceSource}
                  </p>
                  {role.notes && (
                    <p className="mt-1 text-slate-500 italic">
                      <span className="font-semibold text-slate-600 not-italic">Note:</span> {role.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-slate-100 pt-3 text-right">
              <button
                type="button"
                onClick={() => setShowRolesModal(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                {t({ en: "Close", hi: "बंद करें" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SSC JE 2026 Official Notification & Strategy Explorer Modal */}
      <SscJeNotificationExplorer
        isOpen={showNotificationExplorer}
        onClose={() => setShowNotificationExplorer(false)}
        defaultBranch={selectedBranch}
        onSelectBranch={handleSelectBranch}
      />
    </div>
  );
}
