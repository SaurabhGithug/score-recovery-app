"use client";

import React, { useState, useId } from "react";
import { useLang } from "@/lib/i18n";
import { SSC_JE_2026_ORGANIZATIONS, SSC_JE_ACTIVE_CYCLE, SSC_JE_BRANCHES, SSC_JE_PAPER1_SCHEDULE } from "@/lib/ssc-je/config";

interface SscJeNotificationExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBranch?: string;
  onSelectBranch?: (branchCode: string) => void;
}

type TabType =
  | "dates"
  | "eligibility"
  | "age_calc"
  | "scheme"
  | "syllabus"
  | "bro_standards"
  | "centers"
  | "pwbd_scribe"
  | "guidelines";

interface RegionalOffice {
  code: string;
  name: string;
  hq: string;
  jurisdiction: string;
  website: string;
  centers: string[];
}

const SSC_REGIONAL_OFFICES: RegionalOffice[] = [
  {
    code: "CR",
    name: "Central Region",
    hq: "Prayagraj, Uttar Pradesh",
    jurisdiction: "Uttar Pradesh & Bihar",
    website: "https://www.ssc-cr.org",
    centers: [
      "Agra (3001)", "Prayagraj (3003)", "Bareilly (3005)", "Gorakhpur (3007)",
      "Jhansi (3008)", "Kanpur (3009)", "Lucknow (3010)", "Meerut (3011)",
      "Varanasi (3013)", "Bhagalpur (3201)", "Muzaffarpur (3205)", "Patna (3206)", "Purnea (3209)"
    ],
  },
  {
    code: "ER",
    name: "Eastern Region",
    hq: "Kolkata, West Bengal",
    jurisdiction: "West Bengal, Odisha, Jharkhand, Sikkim, Andaman & Nicobar",
    website: "https://www.sscer.org",
    centers: [
      "Port Blair (4801)", "Bokaro (4201)", "Dhanbad (4206)", "Jamshedpur (4207)",
      "Ranchi (4205)", "Balasore (4601)", "Berhampore (4603)", "Bhubaneswar (4604)",
      "Cuttack (4605)", "Rourkela (4610)", "Sambalpur (4609)", "Gangtok (4001)",
      "Asansol (4417)", "Kalyani (4419)", "Kolkata (4410)", "Siliguri (4415)"
    ],
  },
  {
    code: "KKR",
    name: "Karnataka, Kerala Region",
    hq: "Bengaluru, Karnataka",
    jurisdiction: "Karnataka, Kerala & Lakshadweep",
    website: "https://www.ssckkr.kar.nic.in",
    centers: [
      "Belagavi (9002)", "Bengaluru (9001)", "Hubballi (9011)", "Kalaburagi (9005)",
      "Mangaluru (9008)", "Mysuru (9009)", "Shivamogga (9010)", "Udupi (9012)",
      "Ernakulam (9213)", "Kollam (9210)", "Kottayam (9205)", "Kozhikode (9206)",
      "Thrissur (9212)", "Thiruvananthapuram (9211)", "Kavaratti (9401)"
    ],
  },
  {
    code: "MPR",
    name: "Madhya Pradesh Region",
    hq: "Raipur, Chhattisgarh",
    jurisdiction: "Madhya Pradesh & Chhattisgarh",
    website: "https://www.sscmpr.org",
    centers: [
      "Bhopal (6001)", "Gwalior (6005)", "Indore (6006)", "Jabalpur (6007)",
      "Satna (6014)", "Sagar (6015)", "Ujjain (6016)", "Bilaspur (6201)",
      "Raipur (6204)", "Durg-Bhilai (6205)"
    ],
  },
  {
    code: "NER",
    name: "North Eastern Region",
    hq: "Guwahati, Assam",
    jurisdiction: "Arunachal, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Tripura",
    website: "https://www.sscner.org.in",
    centers: [
      "Itanagar (5001)", "Dibrugarh (5102)", "Guwahati (Dispur) (5105)", "Jorhat (5107)",
      "Silchar (5111)", "Tezpur (5112)", "Imphal (5501)", "Shillong (5401)",
      "Aizawl (5701)", "Kohima (5302)", "Agartala (5601)"
    ],
  },
  {
    code: "NR",
    name: "Northern Region",
    hq: "New Delhi",
    jurisdiction: "Delhi, Rajasthan & Uttarakhand",
    website: "https://www.sscnr.nic.in",
    centers: [
      "Dehradun (2002)", "Haldwani (2003)", "Haridwar (2005)", "Roorkee (2006)",
      "Delhi-NCR (2201)", "Ajmer (2401)", "Alwar (2402)", "Bikaner (2404)",
      "Jaipur (2405)", "Jodhpur (2406)", "Kota (2407)", "Sriganganagar (2408)",
      "Udaipur (2409)", "Sikar (2411)"
    ],
  },
  {
    code: "NWR",
    name: "North Western Region",
    hq: "Chandigarh",
    jurisdiction: "Chandigarh, Haryana, Himachal Pradesh, J&K, Ladakh, Punjab",
    website: "https://www.sscnwr.org",
    centers: [
      "Chandigarh/Mohali (1601)", "Hamirpur (1202)", "Shimla (1203)", "Jammu (1004)",
      "Samba (1010)", "Srinagar (1007)", "Leh (1005)", "Amritsar (1401)",
      "Bhatinda (1402)", "Jalandhar (1403)", "Patiala (1404)", "Ambala (1801)", "Hisar (1804)"
    ],
  },
  {
    code: "SR",
    name: "Southern Region",
    hq: "Chennai, Tamil Nadu",
    jurisdiction: "Andhra Pradesh, Telangana, Tamil Nadu & Puducherry",
    website: "https://www.sscsr.gov.in",
    centers: [
      "Chirala (8011)", "Guntur (8001)", "Kakinada (8009)", "Kurnool (8003)",
      "Nellore (8010)", "Rajahmundry (8004)", "Tirupati (8006)", "Vijayawada (8008)",
      "Visakhapatnam (8007)", "Hyderabad (8601)", "Karimnagar (8604)", "Warangal (8603)",
      "Chennai (8201)", "Coimbatore (8202)", "Madurai (8204)", "Salem (8205)",
      "Tiruchirappalli (8206)", "Tirunelveli (8207)", "Vellore (8208)", "Puducherry (8401)"
    ],
  },
  {
    code: "WR",
    name: "Western Region",
    hq: "Mumbai, Maharashtra",
    jurisdiction: "Maharashtra, Gujarat, Goa, Dadra & Nagar Haveli, Daman & Diu",
    website: "https://www.sscwr.net",
    centers: [
      "Panaji (7801)", "Ahmedabad (7001)", "Anand (7011)", "Gandhinagar (7012)",
      "Mehsana (7013)", "Rajkot (7006)", "Surat (7007)", "Vadodara (7002)",
      "Amravati (7201)", "Chhatrapati Sambhajinagar (7202)", "Jalgaon (7214)",
      "Kolhapur (7203)", "Mumbai (7204)", "Nagpur (7205)", "Nanded (7206)",
      "Nashik (7207)", "Pune (7208)"
    ],
  },
];

const BRO_PHYSICAL_REGIONS = [
  {
    region: "Western Himalayan Region",
    states: "J&K, Himachal Pradesh, Punjab Hills, Uttarakhand (Garhwal & Kumaon)",
    minHeight: "158 cms",
    chest: "76 cms (min 5 cm expansion)",
    minWeight: "47.5 kgs",
  },
  {
    region: "Eastern Himalayan Region",
    states: "Sikkim, Nagaland, Arunachal, Manipur, Tripura, Mizoram, Meghalaya, Assam & Hill States of West Bengal",
    minHeight: "152 cms",
    chest: "75 cms (min 5 cm expansion)",
    minWeight: "47.5 kgs",
  },
  {
    region: "Western Border Region",
    states: "Punjab, Haryana, Chandigarh, Delhi, Rajasthan, Western UP",
    minHeight: "162.5 cms",
    chest: "76 cms (min 5 cm expansion)",
    minWeight: "50.0 kgs",
  },
  {
    region: "Eastern Region",
    states: "West Bengal, Bihar, Jharkhand, Odisha, Eastern UP",
    minHeight: "157 cms",
    chest: "75 cms (min 5 cm expansion)",
    minWeight: "50.0 kgs",
  },
  {
    region: "Central Region",
    states: "Madhya Pradesh, Gujarat, Maharashtra, Dadra & Nagar Haveli, Daman & Diu, Chhattisgarh",
    minHeight: "157 cms",
    chest: "75 cms (min 5 cm expansion)",
    minWeight: "50.0 kgs",
  },
  {
    region: "Southern Region",
    states: "Andhra Pradesh, Karnataka, Tamil Nadu, Telangana, Kerala, Goa, Puducherry",
    minHeight: "157 cms",
    chest: "75 cms (min 5 cm expansion)",
    minWeight: "50.0 kgs",
  },
  {
    region: "Gorkhas (Indian Origin)",
    states: "All States & UTs (Gorkha Indian Nationals)",
    minHeight: "152 cms",
    chest: "75 cms (min 5 cm expansion)",
    minWeight: "47.5 kgs",
  },
  {
    region: "Lakshadweep & A&N Islands",
    states: "Andaman & Nicobar Islands and Lakshadweep (Local Tribals: 150 cms)",
    minHeight: "155 cms",
    chest: "75 cms (min 5 cm expansion)",
    minWeight: "47.5 kgs",
  },
];

export function SscJeNotificationExplorer({
  isOpen,
  onClose,
  defaultBranch = "civil",
  onSelectBranch,
}: SscJeNotificationExplorerProps) {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState<TabType>("dates");
  const [qualificationFilter, setQualificationFilter] = useState<string>("all");
  const [selectedDisciplineTab, setSelectedDisciplineTab] = useState<string>(defaultBranch);
  const [selectedRegionOffice, setSelectedRegionOffice] = useState<string>("NR");

  // Age Calculator Form State
  const [birthYear, setBirthYear] = useState<number>(1998);
  const [birthMonth, setBirthMonth] = useState<number>(8);
  const [birthDay, setBirthDay] = useState<number>(15);
  const [category, setCategory] = useState<string>("ur");
  const [esmServiceYears, setEsmServiceYears] = useState<number>(5);

  const dobId = useId();
  const categoryId = useId();
  const esmYearsId = useId();

  if (!isOpen) return null;

  // Filter participating organizations
  const filteredOrgs = SSC_JE_2026_ORGANIZATIONS.map((org) => {
    const matchingPosts = org.posts.filter((post) => {
      if (qualificationFilter === "all") return true;
      if (qualificationFilter === "civil_degree" && post.stream === "civil") return true;
      if (qualificationFilter === "civil_diploma" && post.stream === "civil") return true;
      if (qualificationFilter === "elec_degree" && (post.stream === "electrical" || post.stream === "electrical_mechanical")) return true;
      if (qualificationFilter === "elec_diploma" && (post.stream === "electrical" || post.stream === "electrical_mechanical")) return true;
      if (qualificationFilter === "mech_degree" && (post.stream === "mechanical" || post.stream === "electrical_mechanical")) return true;
      if (qualificationFilter === "mech_diploma" && (post.stream === "mechanical" || post.stream === "electrical_mechanical")) return true;
      if (qualificationFilter === "cs_it" && (post.stream === "cs_it" || post.code === "DOT-JE-T")) return true;
      if (qualificationFilter === "telecom" && (post.stream === "telecom" || post.code === "IMD-SA")) return true;
      if (qualificationFilter === "physics" && post.code === "IMD-SA") return true;
      return false;
    });
    return { ...org, posts: matchingPosts };
  }).filter((org) => org.posts.length > 0);

  // Calculate Exact Age as of Crucial Date: 01.08.2026 (Para 7.1)
  const targetDate = new Date(2026, 7, 1); // August 1, 2026 (Month is 0-indexed: 7 = August)
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);

  let calculatedYears = targetDate.getFullYear() - birthDate.getFullYear();
  let calculatedMonths = targetDate.getMonth() - birthDate.getMonth();
  let calculatedDays = targetDate.getDate() - birthDate.getDate();

  if (calculatedDays < 0) {
    calculatedMonths -= 1;
    const prevMonthLastDay = new Date(2026, 7, 0).getDate();
    calculatedDays += prevMonthLastDay;
  }
  if (calculatedMonths < 0) {
    calculatedYears -= 1;
    calculatedMonths += 12;
  }

  // Relaxation according to Para 7.2
  let relaxationYears = 0;
  if (category === "obc") relaxationYears = 3;
  else if (category === "sc" || category === "st") relaxationYears = 5;
  else if (category === "pwbd_ur") relaxationYears = 10;
  else if (category === "pwbd_obc") relaxationYears = 13;
  else if (category === "pwbd_sc_st") relaxationYears = 15;
  else if (category === "esm") relaxationYears = esmServiceYears + 3;

  // Maximum allowed age
  const maxAge30 = 30 + relaxationYears;
  const maxAge32 = 32 + relaxationYears;

  // Minimum age is 18 years as of 01.08.2026
  const isTooYoung = calculatedYears < 18;
  const isEligible30 = !isTooYoung && (calculatedYears < maxAge30 || (calculatedYears === maxAge30 && calculatedMonths === 0 && calculatedDays === 0));
  const isEligible32 = !isTooYoung && (calculatedYears < maxAge32 || (calculatedYears === maxAge32 && calculatedMonths === 0 && calculatedDays === 0));

  const activeOffice = SSC_REGIONAL_OFFICES.find((o) => o.code === selectedRegionOffice) || SSC_REGIONAL_OFFICES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Header with Official Notification Badge */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-400/30">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-blue-500/30 px-2 py-0.5 text-[11px] font-bold text-blue-300 ring-1 ring-blue-400/40">
                  {SSC_JE_ACTIVE_CYCLE.notificationNumber}
                </span>
                <span className="text-xs text-blue-200/80">
                  {t({ en: "Published on 02.09.2026 · Staff Selection Commission (HQ)", hi: "02.09.2026 को प्रकाशित · कर्मचारी चयन आयोग (मुख्यालय)" })}
                </span>
              </div>
              <h1 className="mt-0.5 text-base font-bold text-white sm:text-lg">
                {t({
                  en: "SSC Junior Engineer & Scientific Assistant 2026 — Official Notice Hub",
                  hi: "एसएससी जूनियर इंजीनियर एवं वैज्ञानिक सहायक 2026 — आधिकारिक अधिसूचना हब",
                })}
              </h1>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/90 px-4 py-2 gap-1.5 text-xs font-semibold scrollbar-thin">
          <button
            onClick={() => setActiveTab("dates")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "dates" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>📅</span>
            <span>{t({ en: "Dates & Vacancies", hi: "तिथियाँ एवं पद" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("eligibility")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "eligibility" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>🎯</span>
            <span>{t({ en: "Post & Qualifications", hi: "पद व योग्यताएं" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("age_calc")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "age_calc" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>🧮</span>
            <span>{t({ en: "Age Calculator (01.08.2026)", hi: "आयु कैलकुलेटर (01.08.2026)" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("scheme")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "scheme" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>⚖️</span>
            <span>{t({ en: "Exam Scheme & Normalization", hi: "परीक्षा योजना व सामान्यीकरण" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("syllabus")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "syllabus" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>📚</span>
            <span>{t({ en: "8 Streams Syllabus", hi: "8 शाखा पाठ्यक्रम" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("bro_standards")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "bro_standards" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>🏃</span>
            <span>{t({ en: "BRO Standards (Annexure-XVI)", hi: "बीआरओ मानक (परिशिष्ट-XVI)" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("centers")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "centers" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>🏛️</span>
            <span>{t({ en: "9 Regional Offices & Centers", hi: "9 क्षेत्रीय कार्यालय व केंद्र" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("pwbd_scribe")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "pwbd_scribe" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>♿</span>
            <span>{t({ en: "PwBD & Scribe Rules", hi: "दिव्यांग व श्रुतलेखक नियम" })}</span>
          </button>

          <button
            onClick={() => setActiveTab("guidelines")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "guidelines" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>⚙️</span>
            <span>{t({ en: "Console Tools & Aadhaar", hi: "कंसोल उपकरण व आधार" })}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 text-slate-800">
          {/* TAB 1: KEY DATES & VACANCIES */}
          {activeTab === "dates" && (
            <div className="space-y-6">
              {/* Highlight Stats Banner */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                    {t({ en: "Tentative Vacancies", hi: "संभावित रिक्तियां" })}
                  </span>
                  <p className="mt-1 text-2xl font-black text-blue-950">1,748</p>
                  <p className="mt-0.5 text-[11px] text-blue-800">
                    {t({ en: "Group 'B' Non-Gazetted", hi: "ग्रुप 'B' अराजपत्रित" })}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                    {t({ en: "Pay Matrix Scale", hi: "वेतन मैट्रिक्स स्तर" })}
                  </span>
                  <p className="mt-1 text-lg font-black text-emerald-950">Level-6</p>
                  <p className="mt-0.5 text-[11px] text-emerald-800">₹35,400 – ₹1,12,400/-</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                    {t({ en: "Application Window", hi: "आवेदन अवधि" })}
                  </span>
                  <p className="mt-1 text-sm font-bold text-amber-950">02.09.2026 – 22.09.2026</p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    {t({ en: "Until 23:00 hours", hi: "रात्रि 23:00 बजे तक" })}
                  </p>
                </div>

                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4">
                  <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
                    {t({ en: "Paper-I Schedule", hi: "पेपर-I समय सारणी" })}
                  </span>
                  <p className="mt-1 text-base font-bold text-purple-950">{SSC_JE_PAPER1_SCHEDULE.short}</p>
                  <p className="mt-0.5 text-[11px] text-purple-800">
                    {t({ en: "Proposed · Paper-II: December 2026", hi: "प्रस्तावित · पेपर-II: दिसंबर 2026" })}
                  </p>
                </div>
              </div>

              {/* Official Timeline Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900">
                    {t({ en: "Official Examination Activity Timeline (Para 1)", hi: "आधिकारिक परीक्षा गतिविधि समय-सारणी (पैरा 1)" })}
                  </h3>
                </div>
                <div className="divide-y divide-slate-200 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "Dates for submission of Online Application Form", hi: "ऑनलाइन आवेदन पत्र जमा करने की तिथियाँ" })}
                    </span>
                    <span className="font-bold text-blue-700">02.09.2026 to 22.09.2026 (23:00 hours)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2 bg-slate-50/50">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "Last date and time for making online fee payment", hi: "ऑनलाइन शुल्क भुगतान की अंतिम तिथि एवं समय" })}
                    </span>
                    <span className="font-medium text-slate-900">23.09.2026 (23:00 hours)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "Window for Online Application Form Correction (2 attempts allowed)", hi: "आवेदन पत्र सुधार हेतु विंडो (2 अवसर अनुमत)" })}
                    </span>
                    <span className="font-medium text-amber-700">28.09.2026 to 30.09.2026 (23:00 hours)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2 bg-slate-50/50">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "Tentative Schedule of Computer Based Examination (Paper-I)", hi: "कंप्यूटर आधारित परीक्षा (पेपर-I) की संभावित तिथि" })}
                    </span>
                    <span className="font-bold text-purple-700">
                      {SSC_JE_PAPER1_SCHEDULE.dotted}
                      <span className="block text-[11px] font-medium text-slate-600">
                        {t({
                          en: `Proposed dates · SSC notice dated ${SSC_JE_PAPER1_SCHEDULE.noticeDate} (replaces "October / November" in the 02.09.2026 notice)`,
                          hi: `प्रस्तावित तिथियाँ · एसएससी नोटिस दिनांक ${SSC_JE_PAPER1_SCHEDULE.noticeDate} (02.09.2026 की अधिसूचना के "अक्टूबर / नवंबर" के स्थान पर)`,
                        })}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "Tentative Schedule of Computer Based Examination (Paper-II)", hi: "कंप्यूटर आधारित परीक्षा (पेपर-II) की संभावित तिथि" })}
                    </span>
                    <span className="font-bold text-emerald-700">December, 2026</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2 bg-slate-50/50">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "Crucial Date for Age Reckoning", hi: "आयु गणना हेतु निर्णायक तिथि" })}
                    </span>
                    <span className="font-medium text-slate-900">01.08.2026</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-3 gap-2">
                    <span className="font-semibold text-slate-700">
                      {t({ en: "SSC Official Toll-Free National Helpline", hi: "एसएससी आधिकारिक टोल-फ्री हेल्पलाइन" })}
                    </span>
                    <span className="font-mono font-bold text-blue-700">180 030 930 63</span>
                  </div>
                </div>
              </div>

              {/* Exam-date notice (01.10.2026): tentative until the admit card */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 text-xs text-purple-950 space-y-1.5">
                <p className="font-bold">
                  {t({
                    en: `Exam schedule notice · ${SSC_JE_PAPER1_SCHEDULE.noticeDate} (${SSC_JE_PAPER1_SCHEDULE.noticeRef})`,
                    hi: `परीक्षा कार्यक्रम नोटिस · ${SSC_JE_PAPER1_SCHEDULE.noticeDate} (${SSC_JE_PAPER1_SCHEDULE.noticeRef})`,
                  })}
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                  <li>
                    {t({
                      en: `Junior Engineer Examination, 2026 · Paper-I (CBE): ${SSC_JE_PAPER1_SCHEDULE.dotted} (proposed dates).`,
                      hi: `जूनियर इंजीनियर परीक्षा, 2026 · पेपर-I (सीबीई): ${SSC_JE_PAPER1_SCHEDULE.dotted} (प्रस्तावित तिथियाँ)।`,
                    })}
                  </li>
                  <li>
                    {t({
                      en: "SSC says any change will be published only on its website. The notice gives the date range only; your exact date, shift and centre come on the admit card.",
                      hi: "एसएससी के अनुसार कोई भी बदलाव केवल आयोग की वेबसाइट पर प्रकाशित होगा। नोटिस में केवल तिथि-सीमा है; आपकी सटीक तिथि, शिफ्ट और केंद्र प्रवेश पत्र पर मिलेंगे।",
                    })}
                  </li>
                </ul>
                <a
                  href={SSC_JE_PAPER1_SCHEDULE.noticeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-semibold text-purple-800 underline"
                >
                  {t({ en: "Read the official notice (ssc.gov.in) ↗", hi: "आधिकारिक नोटिस पढ़ें (ssc.gov.in) ↗" })}
                </a>
              </div>

              {/* Crucial Cross-Eligibility Notes */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 text-xs text-blue-900 space-y-1.5">
                <p className="font-bold">
                  {t({ en: "Important Cross-Eligibility Clarifications (Notice Notes 1 - 4):", hi: "महत्वपूर्ण क्रॉस-पात्रता स्पष्टीकरण (अधिसूचना नोट 1 - 4):" })}
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                  <li><strong>Note 1:</strong> Candidates opting for JE (Mechanical) are also eligible for JE (Electrical & Mechanical) posts in BRO and MES.</li>
                  <li><strong>Note 2:</strong> Candidates opting for JE (Telecom) are also eligible for Scientific Assistant in IMD / JE (Electrical) subject to fulfilling educational qualification.</li>
                  <li><strong>Note 3:</strong> Candidates opting for JE (Electrical) are also eligible for JE (Telecom) and JE (Electrical & Mechanical).</li>
                  <li><strong>Note 4:</strong> Candidates opting for Scientific Assistant in IMD are also eligible for JE (Telecom) subject to fulfilling its educational qualification.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: POST & ELIGIBILITY FINDER */}
          {activeTab === "eligibility" && (
            <div className="space-y-6">
              {/* Filter Bar */}
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t({ en: "Filter by Your Qualification:", hi: "अपनी शैक्षिक योग्यता चुनें:" })}
                  </label>
                  <p className="text-[11px] text-slate-500">
                    {t({ en: "Find out all departments and posts you are eligible to apply for.", hi: "जानें कि आप किन विभागों और पदों के लिए पात्र हैं।" })}
                  </p>
                </div>
                <select
                  value={qualificationFilter}
                  onChange={(e) => setQualificationFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="all">All Qualifications (14 Organizations)</option>
                  <option value="civil_degree">Civil Engineering — Degree (B.E. / B.Tech)</option>
                  <option value="civil_diploma">Civil Engineering — Diploma (3-Year)</option>
                  <option value="elec_degree">Electrical Engineering — Degree</option>
                  <option value="elec_diploma">Electrical Engineering — Diploma</option>
                  <option value="mech_degree">Mechanical Engineering — Degree</option>
                  <option value="mech_diploma">Mechanical Engineering — Diploma</option>
                  <option value="cs_it">Computer Science / IT — Degree</option>
                  <option value="telecom">Electronics & Telecommunications — Degree</option>
                  <option value="physics">B.Sc. with Physics</option>
                </select>
              </div>

              {/* Organizations & Posts List */}
              <div className="space-y-4">
                {filteredOrgs.map((org) => (
                  <div key={org.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="flex h-2 w-2 rounded-full bg-blue-600" />
                        {org.name}
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {org.posts.length} {org.posts.length === 1 ? "Post" : "Posts"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {org.posts.map((post) => (
                        <div key={post.code} className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 text-xs space-y-1.5">
                          <div className="flex items-start justify-between">
                            <span className="font-bold text-blue-900 text-sm">{post.title}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              post.ageLimit === 32 ? "bg-purple-100 text-purple-800" : "bg-slate-200 text-slate-700"
                            }`}>
                              Up to {post.ageLimit} yrs
                            </span>
                          </div>

                          <p className="text-slate-700">
                            <span className="font-semibold text-slate-900">EQ:</span> {post.qualification}
                          </p>

                          {post.experience && (
                            <p className="text-amber-800 font-medium bg-amber-50 rounded p-1 border border-amber-200/60">
                              ⚠ Experience: {post.experience}
                            </p>
                          )}

                          {post.genderRestriction === "male_only" && (
                            <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                              Male Candidates Only (BRO)
                            </span>
                          )}

                          {post.specialCriteria && (
                            <p className="text-[11px] text-slate-500 italic">
                              Note: {post.specialCriteria}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AGE ELIGIBILITY CALCULATOR */}
          {activeTab === "age_calc" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧮</span>
                  <h3 className="text-base font-bold text-blue-950">
                    {t({ en: "Official Age Eligibility Reckoner (As on 01.08.2026)", hi: "आधिकारिक आयु पात्रता गणक (01.08.2026 के अनुसार)" })}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-blue-900">
                  {t({
                    en: "Per Para 7.1 & 7.2 of Notice HQ-C-3019/1/2026-C-3. The crucial date for determining the age limit is 01-08-2026. Enter your date of birth and category to see post-wise eligibility with applicable relaxation.",
                    hi: "अधिसूचना HQ-C-3019/1/2026-C-3 के पैरा 7.1 एवं 7.2 के अनुसार। आयु सीमा निर्धारण हेतु निर्णायक तिथि 01-08-2026 है। अपनी जन्मतिथि एवं श्रेणी दर्ज करें।",
                  })}
                </p>

                {/* Calculator Inputs */}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor={dobId} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      {t({ en: "Date of Birth:", hi: "जन्मतिथि:" })}
                    </label>
                    <input
                      id={dobId}
                      type="date"
                      value={`${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const [y, m, d] = val.split("-").map(Number);
                          setBirthYear(y);
                          setBirthMonth(m);
                          setBirthDay(d);
                        }
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label htmlFor={categoryId} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      {t({ en: "Category & Reservation:", hi: "आरक्षण श्रेणी:" })}
                    </label>
                    <select
                      id={categoryId}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-hidden"
                    >
                      <option value="ur">UR (Unreserved) / EWS — No relaxation</option>
                      <option value="obc">OBC (Non-Creamy Layer) — +3 Years</option>
                      <option value="sc">SC (Scheduled Caste) — +5 Years</option>
                      <option value="st">ST (Scheduled Tribe) — +5 Years</option>
                      <option value="pwbd_ur">PwBD (Unreserved / EWS) — +10 Years</option>
                      <option value="pwbd_obc">PwBD (OBC) — +13 Years</option>
                      <option value="pwbd_sc_st">PwBD (SC/ST) — +15 Years</option>
                      <option value="esm">Ex-Servicemen (ESM) — Military Service + 3 Yrs</option>
                    </select>
                  </div>

                  {category === "esm" && (
                    <div>
                      <label htmlFor={esmYearsId} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        {t({ en: "Military Service Rendered (Years):", hi: "सैन्य सेवा अवधि (वर्ष):" })}
                      </label>
                      <input
                        id={esmYearsId}
                        type="number"
                        min={1}
                        max={35}
                        value={esmServiceYears}
                        onChange={(e) => setEsmServiceYears(Number(e.target.value))}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-hidden"
                      />
                    </div>
                  )}
                </div>

                {/* Calculation Result Dashboard */}
                <div className="mt-5 rounded-xl border border-blue-300 bg-white p-4 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {t({ en: "Calculated Exact Age on 01.08.2026", hi: "01.08.2026 को सटीक आयु" })}
                      </span>
                      <p className="mt-1 text-xl font-black text-slate-900">
                        {calculatedYears} yrs, {calculatedMonths} mos, {calculatedDays} days
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {t({ en: "Applicable Relaxation", hi: "लागू आयु छूट" })}
                      </span>
                      <p className="mt-1 text-lg font-bold text-blue-700">
                        {relaxationYears > 0 ? `+${relaxationYears} Years` : "None (UR/EWS Standard)"}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {t({ en: "Official Minimum Age", hi: "आधिकारिक न्यूनतम आयु" })}
                      </span>
                      <p className="mt-1 text-lg font-bold text-slate-800">
                        18 Years (Born on or before 01.08.2008)
                      </p>
                    </div>
                  </div>

                  {/* Post Eligibility Verdict Cards */}
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className={`rounded-xl border p-4 ${isEligible30 ? "border-emerald-300 bg-emerald-50/70" : "border-red-200 bg-red-50/60"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">Posts with Age Limit: Up to 30 Years</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isEligible30 ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"}`}>
                          {isEligible30 ? "✓ Eligible" : "✗ Over-age"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Includes: <strong>BRO, MES, CWC, FBP, NTRO, DoT, IMD</strong> (Max allowed: {maxAge30} years)
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Unreserved baseline: Born not earlier than 02.08.1996 and not later than 01.08.2008.
                      </p>
                    </div>

                    <div className={`rounded-xl border p-4 ${isEligible32 ? "border-emerald-300 bg-emerald-50/70" : "border-red-200 bg-red-50/60"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">Posts with Age Limit: Up to 32 Years</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isEligible32 ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"}`}>
                          {isEligible32 ? "✓ Eligible" : "✗ Over-age"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Includes: <strong>CPWD (Central Public Works Dept) & DGLL</strong> (Max allowed: {maxAge32} years)
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Unreserved baseline: Born not earlier than 02.08.1994 and not later than 01.08.2008.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900">
                  <strong>Proof of Date of Birth:</strong> Per Para 7.3, only the Date of Birth recorded in the Matriculation / Secondary Examination Certificate or equivalent certificate on the date of submission of application will be accepted. No subsequent request for change will be considered.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SCHEME & NORMALIZATION */}
          {activeTab === "scheme" && (
            <div className="space-y-6">
              {/* Paper 1 vs Paper 2 Cards */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Paper-I Card */}
                <div className="rounded-xl border border-blue-300 bg-gradient-to-b from-blue-50/60 to-white p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                      STAGE 1 · QUALIFYING
                    </span>
                    <span className="text-xs font-semibold text-slate-500">2 Hours (120 min)</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">
                    {t({ en: "Paper-I (Computer Based Examination)", hi: "पेपर-I (कंप्यूटर आधारित परीक्षा)" })}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Qualifying in nature. Shortlists candidates for Paper-II based on normalized scores.
                  </p>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-600">(i) General Intelligence & Reasoning</span>
                      <strong className="text-slate-900">50 Qs / 50 Marks</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-600">(ii) General Awareness</span>
                      <strong className="text-slate-900">50 Qs / 50 Marks</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-600">(iii) Opted Branch Subject (Part A to G)</span>
                      <strong className="text-slate-900">100 Qs / 100 Marks</strong>
                    </div>
                    <div className="flex justify-between pt-1 font-bold text-blue-900 text-sm">
                      <span>Total</span>
                      <span>200 Qs / 200 Marks</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-blue-100/70 p-3 text-xs text-blue-900 space-y-1">
                    <p><strong>Marking Scheme:</strong> +1.0 for correct answer; <strong>−0.25 marks</strong> penalty per wrong answer.</p>
                    <p><strong>Compensatory Time:</strong> 40 minutes extra (total 160 minutes) for eligible PwBD candidates.</p>
                  </div>
                </div>

                {/* Paper-II Card */}
                <div className="rounded-xl border border-purple-300 bg-gradient-to-b from-purple-50/60 to-white p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">
                      STAGE 2 · MERIT DETERMINING
                    </span>
                    <span className="text-xs font-semibold text-slate-500">2 Hours (120 min)</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">
                    {t({ en: "Paper-II (Technical Specialization)", hi: "पेपर-II (तकनीकी विशेषज्ञता)" })}
                  </h3>
                  <p className="mt-1 text-xs text-purple-900 font-semibold">
                    ⭐ Final Selection & Appointment Merit is decided SOLELY on normalized scores of Paper-II!
                  </p>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-600">Discipline Specialization (Part A, B, C, D, E, F, or G)</span>
                      <strong className="text-slate-900">100 Questions</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-600">Marks per question</span>
                      <strong className="text-emerald-700">+3.0 Marks</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-600">Negative deduction</span>
                      <strong className="text-red-600">−1.0 Mark (1/3rd penalty)</strong>
                    </div>
                    <div className="flex justify-between pt-1 font-bold text-purple-900 text-sm">
                      <span>Total Maximum Marks</span>
                      <span>100 Qs / 300 Marks</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-purple-100/70 p-3 text-xs text-purple-900 space-y-1">
                    <p><strong>Tools in Console:</strong> On-Screen Scientific Calculator + Useful Data (IS 456 & Steam Tables).</p>
                    <p><strong>Compensatory Time:</strong> 40 minutes extra (total 160 minutes) for eligible PwBD candidates.</p>
                  </div>
                </div>
              </div>

              {/* Minimum Qualifying Marks & Tie Resolution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🎯</span>
                    <span>Minimum Qualifying Marks (Para 17.2)</span>
                  </h4>
                  <p className="text-slate-600">
                    Candidates must secure at least the following minimum percentage separately in Paper-I and Paper-II to be considered:
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 text-center">
                      <span className="block text-[11px] text-slate-500 font-semibold">UR (General)</span>
                      <span className="text-base font-bold text-slate-900">30%</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 text-center">
                      <span className="block text-[11px] text-slate-500 font-semibold">OBC / EWS</span>
                      <span className="text-base font-bold text-slate-900">25%</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 text-center">
                      <span className="block text-[11px] text-slate-500 font-semibold">SC / ST / PwBD</span>
                      <span className="text-base font-bold text-slate-900">20%</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span>⚖️</span>
                    <span>Resolution of Tie Cases (Para 18)</span>
                  </h4>
                  <p className="text-slate-600">
                    In cases where more than one candidate secures equal aggregate marks in Paper-II:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                    <li><strong>Total marks in Paper-II</strong></li>
                    <li><strong>Marks in Part-(i) (General Intelligence and Reasoning) of Paper-I</strong></li>
                    <li><strong>Marks in Part-(ii) (General Awareness) of Paper-I</strong></li>
                    <li><strong>Date of birth</strong> (older candidate placed higher)</li>
                    <li><strong>Alphabetical order</strong> of the names of the candidates</li>
                  </ol>
                </div>
              </div>

              {/* Cross-Discipline Normalization Formula Info */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-2 text-slate-700">
                <h4 className="text-sm font-bold text-slate-900">Normalisation Process (Paras 13.7 & 13.8)</h4>
                <p>
                  Marks scored by candidates in Computer Based Examinations will be normalized by using the formula published by the Commission through Notice No. 1-1/2018-P&P-I dated 07-02-2019.
                </p>
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                  <p className="font-semibold text-slate-900">Mutual Discipline Normalization for Common Post Eligibility:</p>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-600">
                    <li>Scores of <strong>Mechanical and Electrical Engineering</strong> are normalized mutually with each other for common posts in BRO and MES.</li>
                    <li>Similarly, <strong>Part-D (CS/IT), Part-E (Electronics), and Part-F (Physics)</strong> for IMD Scientific Assistant are normalized mutually across their respective shifts.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SYLLABUS */}
          {activeTab === "syllabus" && (
            <div className="space-y-6">
              {/* Common Paper-I Subjects */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🧠</span>
                    <span>General Intelligence & Reasoning (50 Qs / 50 Marks)</span>
                  </h4>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    Analogies, similarities and differences, space visualization, spatial orientation, problem solving, analysis, judgment, decision making, visual memory, discrimination, observation, relationship concepts, arithmetical reasoning, verbal and figure classification, arithmetical number series, non-verbal series, coding and decoding, statement conclusion, syllogistic reasoning.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🌍</span>
                    <span>General Awareness (50 Qs / 50 Marks)</span>
                  </h4>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    Questions designed to test knowledge of current events and matters of every-day observation. India and its neighbouring countries pertaining to History, Culture, Geography, Economic Scene, General Polity and Scientific Research, environment, government schemes, and basic science.
                  </p>
                </div>
              </div>

              {/* Engineering Streams Selector */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    {t({ en: "Indicative Technical Syllabus by Stream:", hi: "शाखावार आधिकारिक तकनीकी पाठ्यक्रम:" })}
                  </h4>
                  <span className="text-xs text-slate-500">Degree / Diploma Standard</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SSC_JE_BRANCHES.map((b) => (
                    <button
                      key={b.branchCode}
                      onClick={() => setSelectedDisciplineTab(b.branchCode)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        selectedDisciplineTab === b.branchCode
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {t(b.name).split(" (")[0]}
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  {selectedDisciplineTab === "civil" && (
                    <div className="space-y-3">
                      <h3 className="text-base font-bold text-blue-900">Part-A: Civil & Structural Engineering</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Building Materials & Construction:</strong>
                          <p className="mt-1 text-slate-600">Physical and chemical properties, classification, standard tests, uses of stones, bricks, cement, timber, paints, varnishes, asphalt, mortar, concrete mix design.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Surveying & Leveling:</strong>
                          <p className="mt-1 text-slate-600">Principles of surveying, chain surveying, compass, plane table, levelling, contouring, theodolite, tacheometric, curves, total station, remote sensing, GIS & GPS.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Soil Mechanics & Foundation:</strong>
                          <p className="mt-1 text-slate-600">Three-phase system, index properties, permeability, flow nets, effective stress, compaction, 1D consolidation, shear strength, Mohr&apos;s circle, bearing capacity, pile foundations.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Hydraulics & Water Resources:</strong>
                          <p className="mt-1 text-slate-600">Fluid statics, Bernoulli&apos;s equation, pipe networks, open channel flow, hydraulic jump, unit hydrographs, well hydraulics, irrigation methods, weirs and dams.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">RCC Design (IS 456:2000):</strong>
                          <p className="mt-1 text-slate-600">Working stress and limit state design of beams, slabs, columns, footings, retaining walls, shear and development length, deflection control.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Steel Design & Structural Theory:</strong>
                          <p className="mt-1 text-slate-600">Tension and compression members, roof trusses, plate girders, plastic analysis, indeterminate beams, moment distribution, slope deflection.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedDisciplineTab === "electrical" && (
                    <div className="space-y-3">
                      <h3 className="text-base font-bold text-blue-900">Part-B: Electrical Engineering</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Basic Circuit Theory & Network Theorems:</strong>
                          <p className="mt-1 text-slate-600">KCL, KVL, Thevenin, Norton, Superposition, Maximum Power Transfer, transient analysis of RL/RC circuits, resonance in series and parallel AC circuits.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Electrical Machines:</strong>
                          <p className="mt-1 text-slate-600">1-phase and 3-phase transformers, auto-transformers, DC generators & motors, 3-phase induction motors, synchronous machines, parallel operation.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Power Systems (Generation, Transmission, Distribution):</strong>
                          <p className="mt-1 text-slate-600">Thermal, hydel, nuclear plants. Transmission line parameters, Ferranti effect, corona, cables, circuit breakers, protective relays, earthing.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Measurements & Instrumentation:</strong>
                          <p className="mt-1 text-slate-600">PMMC, MI instruments, wattmeters, energy meters, AC/DC bridges, Megger, instrument transformers (CT & PT), digital storage oscilloscopes.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Power Electronics & Drives:</strong>
                          <p className="mt-1 text-slate-600">SCR, MOSFET, IGBT characteristics, phase controlled rectifiers, choppers, inverters, speed control of DC and induction motors.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Estimation, Costing & Utilization:</strong>
                          <p className="mt-1 text-slate-600">Illumination laws, electric heating and welding, electric traction systems, Indian Electricity Rules (IE Rules).</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedDisciplineTab === "mechanical" && (
                    <div className="space-y-3">
                      <h3 className="text-base font-bold text-blue-900">Part-C: Mechanical Engineering</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Thermodynamics & Steam Turbines:</strong>
                          <p className="mt-1 text-slate-600">Laws of thermodynamics, Carnot, Rankine, Otto, Diesel cycles. Steam tables, Rankine reheat & regeneration, nozzles and impulse/reaction turbines.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Strength of Materials & Machine Design:</strong>
                          <p className="mt-1 text-slate-600">Stress & strain, SFD/BMD, deflection of beams, torsion of shafts, Euler columns, thin cylinders. Design of joints, shafts, keys, couplings, gears.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Theory of Machines:</strong>
                          <p className="mt-1 text-slate-600">Kinematic links, 4-bar mechanisms, slider crank, flywheel fluctuation, governors, gear trains, balancing, vibrations.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Fluid Mechanics & Hydraulic Machines:</strong>
                          <p className="mt-1 text-slate-600">Fluid properties, manometry, continuity/Euler/Bernoulli equations, flow through pipes, Pelton, Francis, Kaplan turbines, centrifugal pumps.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">Production & Manufacturing Engineering:</strong>
                          <p className="mt-1 text-slate-600">Casting processes, welding technologies (TIG, MIG, Resistance), metal forming, lathe, milling, grinding, unconventional machining, metrology & fits.</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                          <strong className="text-slate-900">IC Engines & RAC:</strong>
                          <p className="mt-1 text-slate-600">2-stroke and 4-stroke engines, fuel injection, knocking, performance testing. Vapour compression & absorption refrigeration, psychrometry.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedDisciplineTab === "cs_it" || selectedDisciplineTab === "electronics_telecom" || selectedDisciplineTab === "physics" || selectedDisciplineTab === "telecom" || selectedDisciplineTab === "electrical_mechanical") && (
                    <div className="space-y-3">
                      <h3 className="text-base font-bold text-blue-900">
                        {SSC_JE_BRANCHES.find(b => b.branchCode === selectedDisciplineTab)?.name.en}
                      </h3>
                      <p className="text-xs text-slate-500">Degree Standard Syllabus (Paras 14.3.4 - 14.3.7 of 2026 Notice)</p>
                      <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 text-xs text-slate-700 leading-relaxed">
                        Comprehensive coverage including foundational principles, higher degree applications, and practical engineering concepts. On-screen scientific calculator is enabled during both Paper-I and Paper-II for analytical problem solving.
                      </div>
                    </div>
                  )}

                  {onSelectBranch && (
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => {
                          onSelectBranch(selectedDisciplineTab);
                          onClose();
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                      >
                        {t({ en: `Select ${selectedDisciplineTab.toUpperCase()} as Active Discipline`, hi: `${selectedDisciplineTab.toUpperCase()} को सक्रिय शाखा के रूप में चुनें` })}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: BRO PHYSICAL & MEDICAL STANDARDS (ANNEXURE-XVI) */}
          {activeTab === "bro_standards" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-700 font-bold text-base">⚠ Critical Restriction:</span>
                  <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white uppercase">
                    Only Male Candidates Eligible
                  </span>
                </div>
                <p className="mt-2 text-xs text-red-950 leading-relaxed">
                  Per <strong>Annexure-XVI</strong> and Para 19 of the official notice, posts in the <strong>Border Roads Organisation (BRO)</strong> are open to <strong>MALE CANDIDATES ONLY</strong>. Every selected candidate must undergo and qualify the mandatory Physical Efficiency Test (PET) and meet the region-wise physical and medical standards.
                </p>
              </div>

              {/* Physical Efficiency Test (PET) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>⏱️</span>
                  <span>Physical Efficiency Test (PET) for BRO Posts</span>
                </h4>
                <div className="mt-3 rounded-lg bg-blue-50/80 p-3.5 border border-blue-200 text-xs text-blue-950 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm block">1-Mile Run (1,600 Meters)</span>
                    <span className="text-blue-800">Must be completed within a maximum of 10 minutes</span>
                  </div>
                  <span className="rounded-full bg-blue-600 px-3 py-1 font-bold text-white text-xs">
                    Qualifying Only (No Marks)
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Note: Candidates who fail to qualify the 1-Mile run will be rejected outright and will not be considered for appointment in Border Roads Organisation.
                </p>
              </div>

              {/* Region-wise Physical Standards Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Region-Wise Minimum Physical Standards (Height, Chest, Weight)
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">Annexure-XVI Table</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Region</th>
                        <th className="px-4 py-2.5 font-bold">States / Union Territories</th>
                        <th className="px-4 py-2.5 font-bold">Min Height</th>
                        <th className="px-4 py-2.5 font-bold">Chest Requirement</th>
                        <th className="px-4 py-2.5 font-bold">Min Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {BRO_PHYSICAL_REGIONS.map((item, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                          <td className="px-4 py-2.5 font-bold text-slate-900">{item.region}</td>
                          <td className="px-4 py-2.5 text-slate-600">{item.states}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-blue-700">{item.minHeight}</td>
                          <td className="px-4 py-2.5 text-slate-800">{item.chest}</td>
                          <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{item.minWeight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Medical Standards Summary */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-2">
                <h4 className="text-sm font-bold text-slate-900">Medical Examination Highlights (BRO):</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li><strong>Visual Acuity:</strong> 6/6 and 6/9 without glasses OR 6/6 and 6/12 with glasses. Defective colour vision is disqualifying.</li>
                  <li><strong>General Health:</strong> No hearing impairment, knock knees, flat feet, squint, skin disease, hernia, hydrocele, or active varicose veins.</li>
                  <li><strong>Medical Board:</strong> Medical examination is conducted by Border Roads Organisation authorities at GREF Centre, Dighi Camp, Pune.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 7: 9 REGIONAL OFFICES & CENTERS */}
          {activeTab === "centers" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t({ en: "Staff Selection Commission — 9 Regional Offices (Para 12.1)", hi: "कर्मचारी चयन आयोग — 9 क्षेत्रीय कार्यालय (पैरा 12.1)" })}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select a regional office to view its official headquarters, territorial jurisdiction, and approved CBT centers.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {SSC_REGIONAL_OFFICES.map((off) => (
                    <button
                      key={off.code}
                      onClick={() => setSelectedRegionOffice(off.code)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        selectedRegionOffice === off.code
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {off.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Regional Office Card */}
              <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                  <div>
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                      Region Code: {activeOffice.code}
                    </span>
                    <h4 className="mt-1 text-lg font-bold text-slate-900">{activeOffice.name}</h4>
                    <p className="text-xs text-slate-600">
                      Headquarters: <strong>{activeOffice.hq}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 block">Territorial Jurisdiction</span>
                    <span className="font-semibold text-xs text-slate-800">{activeOffice.jurisdiction}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Approved Computer Based Examination Centers ({activeOffice.centers.length} Cities):
                  </h5>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {activeOffice.centers.map((c, i) => (
                      <div key={i} className="rounded-lg bg-slate-50 p-2 text-xs border border-slate-200 font-medium text-slate-800">
                        {c}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>A candidate must select 3 centers within the same Region in order of priority.</span>
                  <a
                    href={activeOffice.website}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Visit Regional Portal</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: PwBD & SCRIBE REGULATIONS */}
          {activeTab === "pwbd_scribe" && (
            <div className="space-y-6">
              {/* Note 2 Highlight: Only DoT is suitable for VH */}
              <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">♿</span>
                  <h4 className="text-sm font-bold text-amber-950">
                    Critical PwBD Notice: Visually Handicapped (VH) Post Suitability (Note 2)
                  </h4>
                </div>
                <div className="mt-2 rounded-lg bg-white p-3 border border-amber-200 text-xs text-amber-900 leading-relaxed font-medium">
                  <strong>Notice Note 2:</strong> &ldquo;The post of <strong>Junior Engineer (Telecom)</strong> in Department of Telecommunications (DoT) is the <strong>ONLY POST</strong> suitable for Visually Handicapped (VH) candidates in this examination. <strong>ALL OTHER POSTS</strong> are NOT suitable for VH candidates.&rdquo;
                </div>
              </div>

              {/* Scribe & Compensatory Time Rules */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 text-xs">
                <h4 className="text-sm font-bold text-slate-900">
                  Provision of Scribe & Compensatory Time (Paras 8.1 - 8.6)
                </h4>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                  <li><strong>Compensatory Time:</strong> 20 minutes per hour of examination (i.e., <strong>40 minutes extra</strong> for both 2-hour Paper-I and Paper-II) is allowed for eligible PwBD candidates whether they use a scribe or not.</li>
                  <li><strong>Own Scribe vs Commission Scribe:</strong> Candidates may bring their own scribe or opt for a scribe provided by the Commission. If bringing own scribe, the qualification of the scribe should be one step below the qualification of the candidate taking examination.</li>
                  <li><strong>Mandatory Certificates:</strong> Certificate regarding physical limitation in an examinee to write must be submitted as per <strong>Annexure-I</strong> from Chief Medical Officer (CMO) / Civil Surgeon / Medical Superintendent.</li>
                  <li><strong>Letter of Undertaking:</strong> For using own scribe, an undertaking in <strong>Annexure-II</strong> must be presented at the examination venue.</li>
                </ul>
              </div>

              {/* Document Verification by User Departments */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2 text-xs">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span>📄</span>
                  <span>Document Verification Conducted by User Departments (Para 16.1)</span>
                </h4>
                <p className="text-slate-700 leading-relaxed">
                  In accordance with the latest recruiting guidelines, <strong>Document Verification (DV) will NOT be conducted by the Staff Selection Commission</strong>. DV will be conducted solely by the <strong>Indenting User Departments / Ministries</strong> directly after final result declaration. Candidates will be required to submit original documents directly to their allocated organization.
                </p>
              </div>
            </div>
          )}

          {/* TAB 9: CBT TOOLS & REGULATIONS */}
          {activeTab === "guidelines" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <h4 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                  <span>💻</span>
                  <span>New In-Console Tools for 2026 Examination (Paras 13.11 & 13.12)</span>
                </h4>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                  <div className="rounded-lg bg-white p-3 border border-blue-200 shadow-2xs">
                    <strong className="text-blue-900 font-bold block mb-1">1. On-Screen Scientific Calculator:</strong>
                    Available on the computer screen for the entire duration of the examination (located to the left side of candidate photo). No physical calculators are permitted inside examination labs.
                  </div>
                  <div className="rounded-lg bg-white p-3 border border-blue-200 shadow-2xs">
                    <strong className="text-blue-900 font-bold block mb-1">2. &ldquo;Useful Data&rdquo; In-Console Reference:</strong>
                    Directly next to the Instructions button, candidates can open and reference the Table of IS 456:2000 Code of Practice and Steam Tables throughout the exam.
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 text-xs text-slate-700">
                <h4 className="text-sm font-bold text-slate-900">Aadhaar Authentication & Registration Benefits (Para 10.3 & 15.7)</h4>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Zero Photo/Signature Rejection:</strong> Candidates opting for Aadhaar-Based Authentication will not have their application form rejected on grounds of photograph or signature standards.</li>
                  <li><strong>Fast Track Entry:</strong> Non-Aadhaar candidates must report <strong>2 hours prior</strong> to exam start and bring original photo ID proofs with exact date-of-birth match.</li>
                  <li><strong>Live Webcam Photo Capture:</strong> Pre-existing passport photos cannot be uploaded; real-time webcam capture with plain background and no spectacles/cap is mandatory.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 text-xs text-slate-700">
                <h4 className="text-sm font-bold text-slate-900">Application Fees & Correction Charges (Paras 10.12 & 11.5)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                    <span className="font-bold text-slate-900">Application Fee: ₹100/-</span>
                    <p className="mt-1 text-slate-600">Exempted for Women, SC, ST, PwBD, and Ex-Servicemen (ESM) candidates.</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                    <span className="font-bold text-slate-900">Correction Charges:</span>
                    <p className="mt-1 text-slate-600">₹200/- for first-time correction; ₹500/- for second-time correction during 28.09.2026 to 30.09.2026 window.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          <span>Source: Staff Selection Commission (HQ), New Delhi · Notice F. No. HQ-C-3019/1/2026-C-3</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            {t({ en: "Close Explorer", hi: "बंद करें" })}
          </button>
        </div>
      </div>
    </div>
  );
}
