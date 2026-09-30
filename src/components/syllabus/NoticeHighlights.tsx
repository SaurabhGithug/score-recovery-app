"use client";

import { useState } from "react";
import type { ExamCycleRecord } from "@/lib/syllabus/types";

// Checked against SSC's original PDF on 2026-09-30. Never reuse across notice revisions.
const NOTICE_HASH = "3efcdd945ddbd6b72d84ae5124ed5e4e3571e81d93c0910c51b5ad6119e0156d";
export function NoticeHighlights({ cycle }: { cycle: ExamCycleRecord }) {
  const [open, setOpen] = useState(false);
  const verifiedVersion = cycle.noticeSha256 === NOTICE_HASH;
  return <div className="mt-4">
    <button type="button" aria-expanded={open} aria-controls="notice-highlights" onClick={() => setOpen(value => !value)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Official notice · Important points {open ? "−" : "+"}</button>
    {open && <div id="notice-highlights" className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
      <h3 className="font-bold">SSC JE Civil · {cycle.year}</h3>
      {verifiedVersion ? <>
        <p className="mt-1 text-xs text-slate-500">Summary of the 2 September 2026 notice; checked 30 September. Later SSC updates take precedence.</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Paper I: 200 questions / 200 marks — Reasoning 50, General Awareness 50, Civil & Structural 100. (p.20)</li>
          <li>Paper II: Civil & Structural, 100 questions / 300 marks. (p.20)</li>
          <li>Each paper: 2 hours; 2 hours 40 minutes for candidates eligible under the cited scribe provisions. (p.20, §9.1–9.3)</li>
          <li>Wrong-answer penalty: 0.25 in Paper I; 1 mark in Paper II. Objective questions in English and Hindi. (p.22, §13.9–13.10)</li>
          <li>On-screen scientific calculator; reference tables where required. No physical calculator or tables. (p.22, §13.11–13.13)</li>
          <li>Original schedule: applications closed 22 September; correction window 28–30 September, 23:00. Paper I: October/November; Paper II: December — both tentative. (p.1)</li>
          <li>Eligibility depends on the post; check qualifications, experience, age and applicable concessions in the full notice. (§2, §5)</li>
        </ul>
      </> : <p className="mt-3">This notice version does not yet have checked highlights. Read the official document below.</p>}
      <a href={cycle.noticeUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block font-semibold text-teal-800 underline">Read full official notification ↗</a>
    </div>}
  </div>;
}
