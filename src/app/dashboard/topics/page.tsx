"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { StudentBrainVisualizer } from "@/components/StudentBrainVisualizer";
import { PlatformStore } from "@/lib/storage/platform-store";
import { StudentConceptState } from "@/lib/domain/schema";
import { universalKnowledgeBrain } from "@/lib/domain/universal-brain";

export default function TopicsDetailPage() {
  const { t } = useLang();
  const [conceptStates, setConceptStates] = useState<StudentConceptState[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  useEffect(() => {
    const profile = PlatformStore.getActiveStudentProfile();
    const states = PlatformStore.listStudentConceptStates(profile.studentId);
    setConceptStates(states);
  }, []);

  const subjects = universalKnowledgeBrain.listSubjects();

  const filteredStates =
    selectedSubject === "all"
      ? conceptStates
      : conceptStates.filter((state) => {
          const concept = universalKnowledgeBrain.getConcept(state.conceptId);
          return concept?.subjectId === selectedSubject;
        });

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
        >
          <span>←</span>
          <span>{t({ en: "Back to my progress", hi: "डैशबोर्ड पर वापस जाएँ" })}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              {t({ en: "Topic progress", hi: "विषय दक्षता एवं विस्तृत विश्लेषण" })}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            {t({ en: "Your topics", hi: "सभी ट्रैक की गई अवधारणाएं" })}
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-xl sm:text-sm">
            {t({
              en: "See your accuracy, answer speed and confidence for each topic.",
              hi: "कठिनाई दक्षता, गति और आत्मविश्वास संरेखण पर विस्तृत बहुआयामी विश्लेषण।",
            })}
          </p>
        </div>
      </div>

      {/* Subject Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 text-xs">
        <button
          onClick={() => setSelectedSubject("all")}
          className={`rounded-lg px-3 py-1.5 font-bold transition ${
            selectedSubject === "all"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t({ en: "All Subjects", hi: "सभी विषय" })} ({conceptStates.length})
        </button>

        {subjects.map((sub) => {
          const count = conceptStates.filter((s) => {
            const c = universalKnowledgeBrain.getConcept(s.conceptId);
            return c?.subjectId === sub.id;
          }).length;

          return (
            <button
              key={sub.id}
              onClick={() => setSelectedSubject(sub.id)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                selectedSubject === sub.id
                  ? "bg-blue-600 text-white font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(sub.name)} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Topic Grid */}
      <StudentBrainVisualizer conceptStates={filteredStates} />
    </div>
  );
}
