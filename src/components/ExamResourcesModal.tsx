"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ageOnCrucialDate, birthDateFromParts, meetsBasicAgeBand, ELIGIBILITY_NOTICE } from "@/lib/ssc-je/eligibility";
import {
  SSC_JE_2026_ORGANIZATIONS,
} from "@/lib/ssc-je/config";

interface ExamResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "syllabus" | "notification" | "pattern" | "papers";
  branch?: string | null;
}

export function ExamResourcesModal({
  isOpen,
  onClose,
  initialTab = "syllabus",
  branch = "civil",
}: ExamResourcesModalProps) {
  const [activeTab, setActiveTab] = useState<"syllabus" | "notification" | "pattern" | "papers">(initialTab);

  // Collapsible sections state in Notification tab
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // Age Calculator state inside Eligibility section
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [calcCategory, setCalcCategory] = useState<string>("UR");

  if (!isOpen) return null;

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const birth = birthDateFromParts(dobDay, dobMonth, dobYear);
  const ageYears = birth ? ageOnCrucialDate(birth) : null;
  const hasDateInput = Boolean(dobDay || dobMonth || dobYear);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Official Examination Knowledge Base
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">
              SSC Junior Engineer 2026 · {branch?.toUpperCase() || "CIVIL"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            type="button"
            onClick={() => setActiveTab("syllabus")}
            className={`border-b-2 px-4 py-3 text-xs font-bold transition ${
              activeTab === "syllabus"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            📖 Syllabus
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notification")}
            className={`border-b-2 px-4 py-3 text-xs font-bold transition ${
              activeTab === "notification"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            📋 Official Notification
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pattern")}
            className={`border-b-2 px-4 py-3 text-xs font-bold transition ${
              activeTab === "pattern"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            ⚙️ Exam Pattern & CBT
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("papers")}
            className={`border-b-2 px-4 py-3 text-xs font-bold transition ${
              activeTab === "papers"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            📂 Previous Papers
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: SYLLABUS */}
          {activeTab === "syllabus" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 leading-relaxed">
                <strong>Official Indicative Syllabus (Notice Para 14.1 - 14.3.7):</strong> Structured into Paper-I (Aptitude + Technical Foundation) and Paper-II (Advanced Specialization).
              </div>

              {/* Part 1: General Intelligence & Reasoning */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">
                    Part A: General Intelligence & Reasoning (50 Marks)
                  </h3>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">50 Questions</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Analogies, similarities and differences, spatial visualization, spatial orientation, problem-solving, analysis, judgment, decision-making, visual memory, discrimination, observation, relationship concepts, arithmetical reasoning and figural classification, arithmetic number series, non-verbal series, coding and decoding, statement conclusion, syllogistic reasoning.
                </p>
              </div>

              {/* Part 2: General Awareness */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">
                    Part B: General Awareness (50 Marks)
                  </h3>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">50 Questions</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Current events, everyday scientific observations, India and its neighbouring countries especially pertaining to History, Culture, Geography, Economic Science, General Polity and Scientific Research.
                </p>
              </div>

              {/* Part 3: Discipline Specialization */}
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-white to-blue-50/30 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">
                    Part C: Core Engineering — {branch === "electrical" ? "Electrical" : branch === "mechanical" ? "Mechanical" : "Civil & Structural"} (100 Marks in P1 / 300 Marks in P2)
                  </h3>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">Core Discipline</span>
                </div>

                {branch === "civil" && (
                  <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>1. Building Materials:</strong> Physical/chemical properties, classification, testing of stones, bricks, cement, timber, paints.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>2. Estimating & Valuation:</strong> Rate analysis, bill of quantities, valuation methods, depreciation.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>3. Surveying:</strong> Chain, compass, leveling, contouring, theodolite, total station, curves.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>4. Soil Mechanics:</strong> Phase diagram, index properties, permeability, shear strength, bearing capacity.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>5. Hydraulics & Irrigation:</strong> Fluid statics, Bernoulli, open channel flow, crop water requirements, weirs.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>6. Structural & RCC (IS 456):</strong> Shear force & bending moments, limit state design of beams, slabs, columns, retaining walls.
                    </div>
                  </div>
                )}

                {branch === "electrical" && (
                  <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>1. Basic Concepts & Theorems:</strong> KCL, KVL, Thevenin, Norton, Superposition, Maximum Power Transfer.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>2. Electrical Machines:</strong> Single & 3-phase transformers, DC generators/motors, 3-phase induction motors, synchronous machines.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>3. Power Systems:</strong> Generation, transmission line models, fault analysis, switchgear & protection.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>4. Measurement & Electronics:</strong> Energy meters, CT/PT, oscilloscope, diodes, BJT, thyristor.
                    </div>
                  </div>
                )}

                {branch === "mechanical" && (
                  <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>1. Theory of Machines & Design:</strong> Kinematic links, cams, gears, flywheels, governors, balancing.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>2. Thermal & IC Engines:</strong> 1st & 2nd laws of thermodynamics, Otto/Diesel cycles, air compressors, Rankine cycle.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>3. Fluid Mechanics:</strong> Fluid properties, Navier-Stokes, boundary layer, turbines and centrifugal pumps.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-100">
                      <strong>4. Production & Metrology:</strong> Casting, welding, machining operations, limits, fits and tolerances.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: NOTIFICATION */}
          {activeTab === "notification" && (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50/70 via-white to-slate-50 p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Official Release</span>
                    <h3 className="text-base font-extrabold text-slate-900 sm:text-lg">
                      Staff Selection Commission (HQ), New Delhi
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Notice F. No. HQ-C-3019/1/2026-C-3 · Uploaded on 02.09.2026
                    </p>
                  </div>
                  <a
                    href="https://ssc.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    <span>Open Official Portal (ssc.gov.in)</span>
                    <span>↗</span>
                  </a>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-100 pt-3">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Applications</span>
                    <strong className="text-slate-900">02 Sep – 22 Sep 2026</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Correction Window</span>
                    <strong className="text-slate-900">28 Sep – 30 Sep 2026</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Paper-I CBE</span>
                    <strong className="text-blue-700">Oct / Nov 2026</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Paper-II CBE</span>
                    <strong className="text-indigo-700">Dec 2026</strong>
                  </div>
                </div>
              </div>

              {/* Collapsible Section 1: Check My Eligibility & Age Calculator */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("age")}
                  className="w-full flex items-center justify-between p-4 text-left font-bold text-xs text-slate-900 hover:bg-slate-50 transition"
                >
                  <span className="flex items-center gap-2">
                    <span>🗓️</span>
                    <span>Age check (as on 01.08.2026)</span>
                  </span>
                  <span>{openSections.age ? "▲" : "▼"}</span>
                </button>
                {openSections.age && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-4 text-xs">
                    <p className="text-slate-600">
                      As per paragraph 7.1, age is checked as on <strong>01 August 2026</strong>. This checks age only, not full eligibility.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Date of Birth</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text" inputMode="numeric" maxLength={2} aria-label="Birth day" aria-describedby="birth-date-feedback"
                            value={dobDay}
                            onChange={(e) => { if (/^\d{0,2}$/.test(e.target.value)) setDobDay(e.target.value); }}
                            placeholder="DD"
                            className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono"
                          />
                          <input
                            type="text" inputMode="numeric" maxLength={2} aria-label="Birth month" aria-describedby="birth-date-feedback"
                            value={dobMonth}
                            onChange={(e) => { if (/^\d{0,2}$/.test(e.target.value)) setDobMonth(e.target.value); }}
                            placeholder="MM"
                            className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono"
                          />
                          <input
                            type="text" inputMode="numeric" maxLength={4} aria-label="Birth year" aria-describedby="birth-date-feedback"
                            value={dobYear}
                            onChange={(e) => { if (/^\d{0,4}$/.test(e.target.value)) setDobYear(e.target.value); }}
                            placeholder="YYYY"
                            className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Category</label>
                        <select
                          value={calcCategory}
                          onChange={(e) => setCalcCategory(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-800"
                        >
                          <option value="UR">UR (General)</option>
                          <option value="EWS">EWS</option>
                          <option value="OBC">OBC (+3 yrs)</option>
                          <option value="SC">SC (+5 yrs)</option>
                          <option value="ST">ST (+5 yrs)</option>
                        </select>
                      </div>
                    </div>

                    <div id="birth-date-feedback" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700">
                      {!birth || ageYears === null ? <p>{hasDateInput ? "Enter a complete, real date of birth (DD / MM / YYYY), on or before 01 August 2026. Invalid dates are not calculated." : "Enter your date of birth to check age. No date is assumed."}</p> : <>
                        <strong>Age as on 01.08.2026: {ageYears} years.</strong>
                        <p className="mt-2">30-year posts (e.g. CWC, MES, BRO): {meetsBasicAgeBand(birth, calcCategory, 30) ? "Within" : "Outside"} the basic category-adjusted age band.</p>
                        <p className="mt-2">32-year posts (e.g. CPWD): {meetsBasicAgeBand(birth, calcCategory, 32) ? "Within" : "Outside"} the basic category-adjusted age band.</p>
                        <p className="mt-2">PwBD, ESM and other special relaxations are not calculated here. Education, experience and department-specific conditions must also be checked.</p>
                      </>}
                      <a href={ELIGIBILITY_NOTICE + "#page=8"} target="_blank" rel="noreferrer" className="mt-2 inline-block text-blue-700 underline">Official age rules: paragraphs 7.1–7.2</a>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Section 2: BRO Physical & Medical Standards */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("bro")}
                  className="w-full flex items-center justify-between p-4 text-left font-bold text-xs text-slate-900 hover:bg-slate-50 transition"
                >
                  <span className="flex items-center gap-2">
                    <span>🪖</span>
                    <span>Border Roads Organization (BRO) — Physical & Gender Criteria</span>
                  </span>
                  <span>{openSections.bro ? "▲" : "▼"}</span>
                </button>
                {openSections.bro && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2 text-xs text-slate-600 leading-relaxed">
                    <p><strong>BRO only:</strong> Only male candidates are eligible for BRO posts (paragraph 5.3). Female candidates may apply for other SSC JE posts subject to their respective eligibility conditions. Saving a preference in this app is not an SSC application.</p>
                    <p><strong>Physical Efficiency Test (PET):</strong> 1 Mile (1.6 km) run to be completed within 10 minutes (Qualifying in nature; no marks awarded).</p>
                    <p><strong>Physical & Medical Standards:</strong> Check all requirements in Annexure-XVI. Meeting the gender condition alone does not establish BRO eligibility.</p>
                  </div>
                )}
              </div>

              {/* Collapsible Section 3: PwBD & Scribe Reservation Provisions */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("pwbd")}
                  className="w-full flex items-center justify-between p-4 text-left font-bold text-xs text-slate-900 hover:bg-slate-50 transition"
                >
                  <span className="flex items-center gap-2">
                    <span>♿</span>
                    <span>PwBD & Scribe Provisions (Para 7 & 8)</span>
                  </span>
                  <span>{openSections.pwbd ? "▲" : "▼"}</span>
                </button>
                {openSections.pwbd && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2 text-xs text-slate-600 leading-relaxed">
                    <p><strong>Compensatory Time:</strong> 20 minutes per hour (40 minutes extra for 2-hour CBE) for candidates who are allowed scribe or compensatory time.</p>
                    <p><strong>Own Scribe / Commission Scribe:</strong> Allowed with prior declaration. Scribe must not be a candidate for the same examination cycle.</p>
                  </div>
                )}
              </div>

              {/* Collapsible Section 4: Participating Cadres (14 Ministries) */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("orgs")}
                  className="w-full flex items-center justify-between p-4 text-left font-bold text-xs text-slate-900 hover:bg-slate-50 transition"
                >
                  <span className="flex items-center gap-2">
                    <span>🏛️</span>
                    <span>14 Participating Central Organizations & Ministries</span>
                  </span>
                  <span>{openSections.orgs ? "▲" : "▼"}</span>
                </button>
                {openSections.orgs && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3 text-xs">
                    {SSC_JE_2026_ORGANIZATIONS.map((org) => (
                      <div key={org.id} className="p-3 rounded-lg bg-white border border-slate-200">
                        <strong className="text-slate-900 text-xs">{org.name}</strong>
                        <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-slate-600">
                          {org.posts.map((p) => (
                            <li key={p.code}>
                              <span className="font-medium text-slate-800">{p.title}</span> ({p.qualification}) · Age up to {p.ageLimit} yrs
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: EXAM PATTERN & CBT */}
          {activeTab === "pattern" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Paper I */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      Paper-I (CBE)
                    </span>
                    <span className="text-xs text-slate-500">Qualifying</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">General Aptitude & Core Stream</h4>
                  <div className="divide-y divide-slate-100 text-xs text-slate-600">
                    <div className="flex justify-between py-1.5">
                      <span>Total Questions</span>
                      <strong className="text-slate-900">200 questions</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Total Marks</span>
                      <strong className="text-slate-900">200 marks</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Duration</span>
                      <strong className="text-right text-slate-900">120 minutes (2 hours)<span className="block text-xs font-normal">160 minutes if eligible under scribe provisions</span></strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Marking Scheme</span>
                      <span className="text-emerald-700 font-semibold">+1.0 Correct / -0.25 Negative</span>
                    </div>
                  </div>
                </div>

                {/* Paper II */}
                <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                      Paper-II (CBE)
                    </span>
                    <span className="text-xs font-bold text-blue-700">Rank & Merit Deciding</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">Discipline Specialization</h4>
                  <div className="divide-y divide-blue-100/60 text-xs text-slate-600">
                    <div className="flex justify-between py-1.5">
                      <span>Total Questions</span>
                      <strong className="text-slate-900">100 questions</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Total Marks</span>
                      <strong className="text-slate-900">300 marks (3 marks each!)</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Duration</span>
                      <strong className="text-right text-slate-900">120 minutes (2 hours)<span className="block text-xs font-normal">160 minutes if eligible under scribe provisions</span></strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Marking Scheme</span>
                      <span className="text-red-700 font-semibold">+3.0 Correct / -1.0 Negative</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CBT Tools & Reference Resources (Para 13.11 & 13.12) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                <h4 className="text-sm font-bold text-slate-900">In-Console CBT Examination Tools</h4>
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1">🧮 On-Screen Scientific Calculator</div>
                    <p className="text-slate-600 leading-relaxed">
                      Available directly within the exam console during both Paper-I and Paper-II. Physical calculators are strictly barred.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1">📄 IS 456 & Steam Tables Access</div>
                    <p className="text-slate-600 leading-relaxed">
                      Under &quot;Useful Data&quot; button in the test console, standard code provisions (IS 456:2000 for Civil, Steam Tables for Mechanical) are digitally accessible.
                    </p>
                  </div>
                </div>
              </div>

              {/* Scoring & Normalization Collapsible */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("norm")}
                  className="w-full flex items-center justify-between p-4 text-left font-bold text-xs text-slate-900 hover:bg-slate-50 transition"
                >
                  <span>⚖️ Multi-Shift Normalization & Tie-Breaking Rules</span>
                  <span>{openSections.norm ? "▲" : "▼"}</span>
                </button>
                {openSections.norm && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2 text-xs text-slate-600 leading-relaxed">
                    <p><strong>Normalization:</strong> Raw marks obtained by candidates in multi-shift sessions will be normalized using standard commission deviation formula.</p>
                    <p><strong>Resolution of Tie Cases:</strong></p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Higher marks in Paper-II.</li>
                      <li>Candidate older in age gets preference.</li>
                      <li>Alphabetical order of names.</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PREVIOUS PAPERS */}
          {activeTab === "papers" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Previous-year papers for <strong>SSC JE {branch?.toUpperCase() || "Civil"}</strong>, each labelled with where its answer key came from.
                Questions without a trustworthy key are shown for reading but never scored.
              </p>

              <Link
                href="/papers"
                onClick={onClose}
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-blue-300"
              >
                <h4 className="text-sm font-bold text-slate-900">Open previous-year papers →</h4>
                <p className="mt-0.5 text-xs text-slate-500">Browse by year, paper and shift, and see each paper&apos;s answer-key source.</p>
              </Link>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
          >
            Close Resources
          </button>
        </div>

      </div>
    </div>
  );
}
