import {
  Exam,
  ExamBranch,
  ExamCycle,
  ExamOrganizationRole,
  ExamPaper,
  ExamSection,
  ExamStage,
  Subject,
  SyllabusNode,
} from "../domain/schema";
import { examBrain } from "../domain/exam-brain";
import { universalKnowledgeBrain } from "../domain/universal-brain";

/**
 * Official SSC Junior Engineer Examination, 2026 Configuration Pack
 *
 * Primary Authority Reference:
 * Staff Selection Commission (HQ), New Delhi
 * Notice F. No. HQ-C-3019/1/2026-C-3 (Uploaded on 02.09.2026, ssc.gov.in)
 *
 * Official Parameters Verified:
 * 1. Cycle: Junior Engineer Examination, 2026 (Including IMD Scientific Assistant & DoT Telecom)
 * 2. Online Application Dates: 02.09.2026 to 22.09.2026 (23:00 hrs)
 * 3. Correction Window: 28.09.2026 to 30.09.2026 (23:00 hrs)
 * 4. Paper-I (CBE): October/November, 2026 (Qualifying in nature, +1 / -0.25)
 * 5. Paper-II (CBE): December, 2026 (Rank & final merit deciding, +3 / -1.0)
 * 6. Vacancies: 1,748 Tentative
 * 7. In-Console CBT Tools (Para 13.11 & 13.12):
 *    - On-screen Scientific Calculator available throughout the exam
 *    - IS 456:2000 Code of Practice and Steam Tables available on console under "Useful Data"
 * 8. Participating Organizations: 14 Government Departments & Ministries
 */

export const SSC_JE_EXAM_ID = "exam-ssc-je";

export const SSC_JE_EXAM: Exam = {
  id: SSC_JE_EXAM_ID,
  familyCode: "ssc-je",
  title: {
    en: "SSC Junior Engineer & Scientific Assistant Examination, 2026",
    hi: "एसएससी जूनियर इंजीनियर एवं साइंटिफिक असिस्टेंट परीक्षा, 2026",
  },
  conductingBody: "Staff Selection Commission (Govt. of India)",
  requiresBranchSelection: true,
  isActive: true,
  createdAt: "2026-09-02T00:00:00Z",
};

/**
 * Official 2026 Disciplines / Engineering Streams
 * Reflects Para 13.1 & 14 (Part-A through Part-G)
 */
export const SSC_JE_BRANCHES: ExamBranch[] = [
  {
    id: "branch-ssc-je-civil",
    examId: SSC_JE_EXAM_ID,
    branchCode: "civil",
    name: {
      en: "Civil & Structural Engineering (Part-A)",
      hi: "सिविल एवं संरचनात्मक अभियांत्रिकी (भाग-A)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-electrical",
    examId: SSC_JE_EXAM_ID,
    branchCode: "electrical",
    name: {
      en: "Electrical Engineering (Part-B)",
      hi: "विद्युत अभियांत्रिकी (भाग-B)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-mechanical",
    examId: SSC_JE_EXAM_ID,
    branchCode: "mechanical",
    name: {
      en: "Mechanical Engineering (Part-C)",
      hi: "यांत्रिक अभियांत्रिकी (भाग-C)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-em",
    examId: SSC_JE_EXAM_ID,
    branchCode: "electrical_mechanical",
    name: {
      en: "Electrical & Mechanical Engineering (BRO / MES)",
      hi: "विद्युत एवं यांत्रिक अभियांत्रिकी (बीआरओ / एमईएस)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-cs-it",
    examId: SSC_JE_EXAM_ID,
    branchCode: "cs_it",
    name: {
      en: "Computer Science & Information Technology (IMD Part-D)",
      hi: "कंप्यूटर विज्ञान एवं सूचना प्रौद्योगिकी (आईएमडी भाग-D)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-electronics",
    examId: SSC_JE_EXAM_ID,
    branchCode: "electronics_telecom",
    name: {
      en: "Electronics & Telecommunication Engineering (IMD Part-E)",
      hi: "इलेक्ट्रॉनिक्स एवं दूरसंचार अभियांत्रिकी (आईएमडी भाग-E)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-physics",
    examId: SSC_JE_EXAM_ID,
    branchCode: "physics",
    name: {
      en: "Physics (IMD Part-F)",
      hi: "भौतिक विज्ञान (आईएमडी भाग-F)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "branch-ssc-je-telecom",
    examId: SSC_JE_EXAM_ID,
    branchCode: "telecom",
    name: {
      en: "Telecommunication Engineering (DoT Part-G)",
      hi: "दूरसंचार अभियांत्रिकी (डीओटी भाग-G)",
    },
    technicalContentReady: true,
    createdAt: "2026-09-02T00:00:00Z",
  },
];

/**
 * Institutional Roles with Rigorous Provenance Separation
 */
export const SSC_JE_ORGANIZATION_ROLES: ExamOrganizationRole[] = [
  {
    id: "eor-ssc-je-recruiter",
    examId: SSC_JE_EXAM_ID,
    organizationId: "org-ssc",
    organizationName: "Staff Selection Commission (SSC)",
    roleType: "recruiting_organization",
    evidenceSource: "Official Notice F. No. HQ-C-3019/1/2026-C-3 (Dated 02.09.2026)",
    verificationStatus: "verified",
    confidenceLevel: "high",
    notes: "Central recruiting authority under Department of Personnel and Training (DoPT), Govt of India.",
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "eor-ssc-je-owner",
    examId: SSC_JE_EXAM_ID,
    organizationId: "org-ssc",
    organizationName: "Staff Selection Commission & Indenting Ministries",
    roleType: "exam_owner",
    evidenceSource: "Official Notice Para 1 to 4 (DoPT, Jal Shakti, MoD, DoT, MoES/IMD)",
    verificationStatus: "verified",
    confidenceLevel: "high",
    notes: "Defines exam scheme, syllabus, qualifying benchmarks, and sliding/FRTA allocation mechanism.",
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "eor-ssc-je-paper-setter",
    examId: SSC_JE_EXAM_ID,
    organizationId: "org-ssc-expert-panel",
    organizationName: "Confidential Subject Expert Committee (Empaneled by SSC)",
    roleType: "paper_setting_organization",
    evidenceSource: "Standard Public Sector Examination Architecture & SSC Operating Procedure",
    verificationStatus: "provisional",
    confidenceLevel: "medium",
    notes: "Technical & aptitude questions authored by confidential academic panels, never by external software vendors.",
    createdAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "eor-ssc-je-cbt-vendor",
    examId: SSC_JE_EXAM_ID,
    organizationId: "org-cbt-delivery",
    organizationName: "Tendered CBT Delivery & Assessment Agency",
    roleType: "cbt_platform_vendor",
    evidenceSource: "SSC CBT Guidelines & Notice Para 13.11-13.12 (Console calculator and useful data specs)",
    verificationStatus: "provisional",
    confidenceLevel: "medium",
    notes: "Vendor provides exam lab terminals, webcam capture, Aadhaar biometric verification, and onscreen scientific calculator.",
    createdAt: "2026-09-02T00:00:00Z",
  },
];

/**
 * Verified Active Cycle 2026 based on Official Notice HQ-C-3019/1/2026-C-3
 */
export const SSC_JE_ACTIVE_CYCLE: ExamCycle = {
  id: "cycle-ssc-je-2026",
  examId: SSC_JE_EXAM_ID,
  cycleYear: 2026,
  notificationNumber: "F. No. HQ-C-3019/1/2026-C-3",
  notificationDate: "2026-09-02",
  officialSourceUrl: "https://ssc.gov.in",
  applicationStartDate: "2026-09-02",
  applicationEndDate: "2026-09-22T23:00:00+05:30",
  correctionWindow: "28.09.2026 to 30.09.2026 (23:00 hours)",
  tentativeSchedulePaper1: "October/November, 2026",
  tentativeSchedulePaper2: "December, 2026",
  totalVacancies: 1748,
  payMatrixLevel: "Level-6 (Rs. 35,400 - 1,12,400/-)",
  patternVersion: "SSC-JE-CBT-2026-Official",
  status: "verified_official",
  evidenceGaps: [],
  createdAt: "2026-09-02T00:00:00Z",
};

/**
 * Selection Stages
 * Para 13.1 & 18.2: Paper-I is qualifying; Paper-II is rank/merit determining
 */
export const SSC_JE_STAGE_1: ExamStage = {
  id: "stage-ssc-je-paper1",
  cycleId: SSC_JE_ACTIVE_CYCLE.id,
  stageNumber: 1,
  name: {
    en: "Paper-I (Computer Based Examination - Qualifying)",
    hi: "पेपर-I (कंप्यूटर आधारित परीक्षा - अर्हक प्रकृति)",
  },
  selectionType: "qualifying",
  deliveryMode: "cbt",
};

export const SSC_JE_STAGE_2: ExamStage = {
  id: "stage-ssc-je-paper2",
  cycleId: SSC_JE_ACTIVE_CYCLE.id,
  stageNumber: 2,
  name: {
    en: "Paper-II (Computer Based Examination - Merit Determining)",
    hi: "पेपर-II (कंप्यूटर आधारित परीक्षा - अंतिम मेरिट निर्धारक)",
  },
  selectionType: "merit",
  deliveryMode: "cbt",
};

/**
 * Paper-I Structure (Para 13.1.1 & 13.10)
 * 200 Questions / 200 Marks / 120 Minutes
 * Marking: +1.0 for correct, -0.25 for wrong (0.25 negative marks)
 * Tools: On-Screen Scientific Calculator (Para 13.12) & Reference Tables (Para 13.11)
 */
export const SSC_JE_PAPER_1: ExamPaper = {
  id: "paper-ssc-je-p1",
  stageId: SSC_JE_STAGE_1.id,
  paperNumber: 1,
  name: {
    en: "Paper-I General Aptitude & Core Stream",
    hi: "पेपर-I सामान्य अभिरुचि एवं कोर विषय",
  },
  durationMinutes: 120, // 2 Hours (2h 40m for eligible scribe candidates)
  totalMarks: 200,
  totalQuestions: 200,
  markingCorrect: 1.0,
  markingNegative: 0.25,
  calculatorAllowed: true, // Para 13.12: Scientific calculator on screen
  languageRules: ["en", "hi"],
  evidenceGaps: [],
};

/**
 * Paper-II Structure (Para 13.1.2, 13.10 & 13.16)
 * 100 Questions / 300 Marks (3 marks each!) / 120 Minutes
 * Marking: +3.0 for correct, -1.0 for wrong (1 mark negative deduction)
 * Selection: Final merit is based SOLELY on Paper-II normalized scores!
 */
export const SSC_JE_PAPER_2: ExamPaper = {
  id: "paper-ssc-je-p2",
  stageId: SSC_JE_STAGE_2.id,
  paperNumber: 2,
  name: {
    en: "Paper-II Discipline Specialization (Rank Determining)",
    hi: "पेपर-II विषय विशेषज्ञता (रैंक निर्धारक)",
  },
  durationMinutes: 120,
  totalMarks: 300,
  totalQuestions: 100,
  markingCorrect: 3.0,
  markingNegative: 1.0,
  calculatorAllowed: true,
  languageRules: ["en", "hi"],
  evidenceGaps: [],
};

/**
 * Paper 1 Sections (Para 13.1.1)
 */
export const SSC_JE_P1_SECTIONS: ExamSection[] = [
  {
    id: "sec-ssc-je-p1-reasoning",
    paperId: SSC_JE_PAPER_1.id,
    sectionCode: "GI_REASONING",
    name: {
      en: "General Intelligence & Reasoning",
      hi: "सामान्य बुद्धिमत्ता एवं तर्कशक्ति",
    },
    questionCount: 50,
    totalMarks: 50,
    orderIndex: 1,
  },
  {
    id: "sec-ssc-je-p1-ga",
    paperId: SSC_JE_PAPER_1.id,
    sectionCode: "GENERAL_AWARENESS",
    name: {
      en: "General Awareness",
      hi: "सामान्य जागरूकता",
    },
    questionCount: 50,
    totalMarks: 50,
    orderIndex: 2,
  },
  {
    id: "sec-ssc-je-p1-tech",
    paperId: SSC_JE_PAPER_1.id,
    sectionCode: "BRANCH_SUBJECT",
    name: {
      en: "Discipline Subject (Part A, B, C, D, E, F, or G)",
      hi: "अनुशासन विषय (भाग A, B, C, D, E, F, या G)",
    },
    questionCount: 100,
    totalMarks: 100,
    orderIndex: 3,
  },
];

/**
 * Paper 2 Section (Para 13.1.2)
 */
export const SSC_JE_P2_SECTIONS: ExamSection[] = [
  {
    id: "sec-ssc-je-p2-tech",
    paperId: SSC_JE_PAPER_2.id,
    sectionCode: "ADVANCED_DISCIPLINE",
    name: {
      en: "Advanced Technical Specialization (Part A - G)",
      hi: "उन्नत तकनीकी विशेषज्ञता (भाग A - G)",
    },
    questionCount: 100,
    totalMarks: 300,
    orderIndex: 1,
  },
];

/**
 * Official Participating Organizations & Cadres (Notice Para 2)
 */
export interface ParticipatingDepartment {
  id: string;
  name: string;
  posts: {
    code: string;
    title: string;
    stream: string;
    ageLimit: number;
    qualification: string;
    experience?: string;
    genderRestriction?: "male_only" | "all";
    specialCriteria?: string;
  }[];
}

export const SSC_JE_2026_ORGANIZATIONS: ParticipatingDepartment[] = [
  {
    id: "org-bro",
    name: "Border Roads Organization (BRO)",
    posts: [
      {
        code: "BRO-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Degree in Civil Engineering OR 3-year Diploma in Civil Engineering",
        experience: "2 years working experience for Diploma holders",
        genderRestriction: "male_only",
        specialCriteria: "Mandatory PET (1 Mile run in 10 mins) + GREF medical standards",
      },
      {
        code: "BRO-JE-EM",
        title: "Junior Engineer (Electrical & Mechanical)",
        stream: "electrical_mechanical",
        ageLimit: 30,
        qualification: "Degree in Electrical or Mechanical Engineering OR 3-year Diploma in Electrical/Automobile/Mechanical",
        experience: "2 years experience in planning/execution/maintenance for Diploma holders",
        genderRestriction: "male_only",
        specialCriteria: "Mandatory PET + GREF medical standards",
      },
    ],
  },
  {
    id: "org-brahmaputra",
    name: "Brahmaputra Board, Ministry of Jal Shakti",
    posts: [
      {
        code: "BB-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Three-Year Diploma in Civil Engineering from a recognized University or Institution",
      },
    ],
  },
  {
    id: "org-cwc",
    name: "Central Water Commission (CWC)",
    posts: [
      {
        code: "CWC-JE-M",
        title: "Junior Engineer (Mechanical)",
        stream: "mechanical",
        ageLimit: 30,
        qualification: "Bachelor’s Degree or Diploma in Mechanical Engineering",
      },
      {
        code: "CWC-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Bachelor’s Degree or Diploma in Civil Engineering",
      },
    ],
  },
  {
    id: "org-cpwd",
    name: "Central Public Works Department (CPWD)",
    posts: [
      {
        code: "CPWD-JE-E",
        title: "Junior Engineer (Electrical)",
        stream: "electrical",
        ageLimit: 32, // Note: CPWD age limit is up to 32 years
        qualification: "Diploma in Electrical or Mechanical Engineering",
      },
      {
        code: "CPWD-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 32,
        qualification: "Diploma in Civil Engineering",
      },
    ],
  },
  {
    id: "org-cwprs",
    name: "Central Water and Power Research Station (CWPRS)",
    posts: [
      {
        code: "CWPRS-JE-E",
        title: "Junior Engineer (Electrical)",
        stream: "electrical",
        ageLimit: 30,
        qualification: "Diploma in Electrical Engineering",
      },
      {
        code: "CWPRS-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Diploma in Civil Engineering",
      },
    ],
  },
  {
    id: "org-dgqa",
    name: "DGQA-NAVAL, Ministry of Defence",
    posts: [
      {
        code: "DGQA-JE-M",
        title: "Junior Engineer (Mechanical)",
        stream: "mechanical",
        ageLimit: 30,
        qualification: "Degree in Mechanical Engineering OR 3-year Diploma in Mechanical Engineering",
        experience: "2-Year experience in the respective field for Diploma holders",
      },
      {
        code: "DGQA-JE-E",
        title: "Junior Engineer (Electrical)",
        stream: "electrical",
        ageLimit: 30,
        qualification: "Degree in Electrical Engineering OR 3-year Diploma in Electrical Engineering",
        experience: "2-Year experience in the respective field for Diploma holders",
      },
    ],
  },
  {
    id: "org-farakka",
    name: "Farakka Barrage Project, Ministry of Jal Shakti",
    posts: [
      {
        code: "FBP-JE-E",
        title: "Junior Engineer (Electrical)",
        stream: "electrical",
        ageLimit: 30,
        qualification: "Diploma in Electrical Engineering",
      },
      {
        code: "FBP-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Diploma in Civil Engineering",
      },
    ],
  },
  {
    id: "org-mes",
    name: "Military Engineer Services (MES)",
    posts: [
      {
        code: "MES-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Degree in Civil Engineering OR 3-year Diploma in Civil Engineering",
        experience: "Two years’ experience in planning, execution, and maintenance of civil works for Diploma holders",
      },
      {
        code: "MES-JE-EM",
        title: "Junior Engineer (Electrical & Mechanical)",
        stream: "electrical_mechanical",
        ageLimit: 30,
        qualification: "Degree in Electrical or Mechanical Engineering OR 3-year Diploma in Electrical or Mechanical Engineering",
        experience: "Two-Year experience in planning, execution, and maintenance for Diploma holders",
      },
    ],
  },
  {
    id: "org-ntro",
    name: "National Technical Research Organization (NTRO)",
    posts: [
      {
        code: "NTRO-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Diploma in Civil Engineering from a recognized University/Institution",
      },
    ],
  },
  {
    id: "org-dgll",
    name: "Director General of Lighthouses & Lightships (DGLL)",
    posts: [
      {
        code: "DGLL-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 32, // Age limit up to 32 years
        qualification: "Degree in Civil Engineering OR Diploma in Civil Engineering with 3 years' experience",
      },
      {
        code: "DGLL-JE-E",
        title: "Junior Engineer (Electrical)",
        stream: "electrical",
        ageLimit: 32, // Age limit up to 32 years
        qualification: "Degree in Electrical Engineering OR Diploma in Electrical Engineering with 3 years' experience",
      },
    ],
  },
  {
    id: "org-dot",
    name: "Department of Telecommunication (DoT)",
    posts: [
      {
        code: "DOT-JE-T",
        title: "Junior Engineer (Telecom)",
        stream: "telecom",
        ageLimit: 30,
        qualification: "B.E. / B.Tech in Electrical, Electronics, Electrical Communications, Computer Science, Telecommunications, IT or Instrumentation",
        specialCriteria: "Part-G Exam Batch; eligible for SA in IMD and JE Electrical if EQ fulfilled",
      },
    ],
  },
  {
    id: "org-imd",
    name: "India Meteorological Department (IMD)",
    posts: [
      {
        code: "IMD-SA",
        title: "Scientific Assistant",
        stream: "cs_it", // Candidates choose Part-D, E, or F
        ageLimit: 30,
        qualification: "Bachelor’s Degree in Science with Physics as a subject OR Bachelor’s Degree in CS, CA, Electronics, ECE, ETE, Instrumentation, IT, or Telecommunication Engineering",
        specialCriteria: "Normalized across Part-D (CS/IT), Part-E (ECE), and Part-F (Physics)",
      },
    ],
  },
  {
    id: "org-fisheries",
    name: "Ministry of Fisheries, Animal Husbandry and Dairying",
    posts: [
      {
        code: "FISH-JE-C",
        title: "Junior Engineer (Civil)",
        stream: "civil",
        ageLimit: 30,
        qualification: "Degree or three-year diploma in Civil Engineering",
      },
    ],
  },
];

/**
 * Register SSC JE exam configuration into the platform Exam Brain & Universal Brain
 */
export function registerSscJeExamPack(): void {
  examBrain.registerExam(SSC_JE_EXAM);
  SSC_JE_BRANCHES.forEach((b) => examBrain.registerBranch(b));
  SSC_JE_ORGANIZATION_ROLES.forEach((r) => examBrain.addOrganizationRole(r));
  examBrain.registerCycle(SSC_JE_ACTIVE_CYCLE);
  examBrain.registerStage(SSC_JE_STAGE_1);
  examBrain.registerStage(SSC_JE_STAGE_2);
  examBrain.registerPaper(SSC_JE_PAPER_1);
  examBrain.registerPaper(SSC_JE_PAPER_2);
  SSC_JE_P1_SECTIONS.forEach((s) => examBrain.registerSection(s));
  SSC_JE_P2_SECTIONS.forEach((s) => examBrain.registerSection(s));

  // Seed Official 2026 Indicative Syllabus (Para 14.1 - 14.3.7)
  seedOfficialSscJeSyllabus();
}

function seedOfficialSscJeSyllabus(): void {
  // 1. Civil Engineering Subjects & Topics (Part-A)
  const civilSubject: Subject = {
    id: "subj-civil-engineering",
    code: "CIVIL_ENG",
    name: {
      en: "Civil & Structural Engineering (Part-A)",
      hi: "सिविल एवं संरचनात्मक अभियांत्रिकी (भाग-A)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(civilSubject);

  const civilTopics = [
    { id: "node-civil-em", title: { en: "Engineering Mechanics & Solid Mechanics", hi: "अभियांत्रिकी यांत्रिकी एवं ठोस यांत्रिकी" } },
    { id: "node-civil-sa", title: { en: "Structural Analysis & Steel Structures", hi: "संरचनात्मक विश्लेषण एवं इस्पात संरचनाएं" } },
    { id: "node-civil-cm", title: { en: "Construction Materials & Management (PERT/CPM)", hi: "निर्माण सामग्री एवं प्रबंधन (पर्ट/सीपीएम)" } },
    { id: "node-civil-est", title: { en: "Estimating, Costing and Valuation", hi: "प्राक्कलन, लागत एवं मूल्यांकन" } },
    { id: "node-civil-rcc", title: { en: "Concrete Structures (IS 456 Limit State)", hi: "कंक्रीट संरचनाएं (आईएस 456 सीमा अवस्था)" } },
    { id: "node-civil-surv", title: { en: "Surveying (Total Station & Theodolite)", hi: "सर्वेक्षण (टोटल स्टेशन एवं थियोडोलाइट)" } },
    { id: "node-civil-geotech", title: { en: "Soil Mechanics & Geotechnical Engineering", hi: "मृदा यांत्रिकी एवं भू-तकनीकी अभियांत्रिकी" } },
    { id: "node-civil-fm", title: { en: "Fluid Mechanics, Hydraulics & Irrigation", hi: "तरल यांत्रिकी, हाइड्रोलिक्स एवं सिंचाई" } },
    { id: "node-civil-env", title: { en: "Environmental Engineering & Solid Waste", hi: "पर्यावरण अभियांत्रिकी एवं ठोस अपशिष्ट" } },
    { id: "node-civil-trans", title: { en: "Transportation & Highway Traffic Engineering", hi: "परिवहन एवं राजमार्ग यातायात अभियांत्रिकी" } },
  ];

  civilTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: civilSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });

  // 2. Electrical Engineering Subjects & Topics (Part-B)
  const elecSubject: Subject = {
    id: "subj-electrical-engineering",
    code: "ELECTRICAL_ENG",
    name: {
      en: "Electrical Engineering (Part-B)",
      hi: "विद्युत अभियांत्रिकी (भाग-B)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(elecSubject);

  const elecTopics = [
    { id: "node-elec-fund", title: { en: "Fundamentals & Network Theorems (KCL/KVL/Thevenin)", hi: "मूल सिद्धांत एवं नेटवर्क प्रमेय" } },
    { id: "node-elec-mag", title: { en: "Magnetic Circuits & AC Fundamentals", hi: "चुंबकीय परिपथ एवं एसी फंडामेंटल" } },
    { id: "node-elec-meas", title: { en: "Measurement & Measuring Instruments (Energy Meters, CT/PT)", hi: "मापन एवं मापन यंत्र" } },
    { id: "node-elec-mach", title: { en: "Electrical Machines (Transformers, DC & AC Machines)", hi: "विद्युत मशीनें (ट्रांसफॉर्मर, डीसी और एसी मोटर)" } },
    { id: "node-elec-sync", title: { en: "Synchronous Generators & Special Electric Machines", hi: "तुल्यकालिक जनरेटर एवं विशेष विद्युत मशीनें" } },
    { id: "node-elec-tgd", title: { en: "Generation, Transmission and Distribution", hi: "उत्पादन, संचरण एवं वितरण" } },
    { id: "node-elec-est", title: { en: "Estimation, Costing & IE Rules (Earthing)", hi: "प्राक्कलन, लागत एवं आईई नियम" } },
    { id: "node-elec-util", title: { en: "Utilization of Electrical Energy (Traction & Drives)", hi: "विद्युत ऊर्जा का उपयोग (ट्रैक्शन एवं ड्राइव)" } },
    { id: "node-elec-electronics", title: { en: "Basic & Power Electronics (Thyristor, Buck/Boost)", hi: "बेसिक एवं पावर इलेक्ट्रॉनिक्स" } },
  ];

  elecTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: elecSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });

  // 3. Mechanical Engineering Subjects & Topics (Part-C)
  const mechSubject: Subject = {
    id: "subj-mechanical-engineering",
    code: "MECHANICAL_ENG",
    name: {
      en: "Mechanical Engineering (Part-C)",
      hi: "यांत्रिक अभियांत्रिकी (भाग-C)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(mechSubject);

  const mechTopics = [
    { id: "node-mech-som", title: { en: "Engineering Mechanics & Strength of Materials", hi: "अभियांत्रिकी यांत्रिकी एवं पदार्थों का सामर्थ्य" } },
    { id: "node-mech-tom", title: { en: "Theory of Machines & Machine Design", hi: "मशीनों का सिद्धांत एवं मशीन डिज़ाइन" } },
    { id: "node-mech-mat", title: { en: "Materials Science & Iron-Carbon Phase Diagram", hi: "पदार्थ विज्ञान एवं आयरन-कार्बन आरेख" } },
    { id: "node-mech-thermal", title: { en: "Thermal Engineering & IC Engines (Otto/Diesel/Dual)", hi: "थर्मल इंजीनियरिंग एवं आईसी इंजन" } },
    { id: "node-mech-steam", title: { en: "Steam Turbines, Boilers & Heat Transfer", hi: "भाप टरबाइन, बॉयलर एवं ऊष्मा अंतरण" } },
    { id: "node-mech-fluid", title: { en: "Fluid Mechanics & Hydraulic Machinery (Turbines/Pumps)", hi: "तरल यांत्रिकी एवं हाइड्रोलिक मशीनरी" } },
    { id: "node-mech-mfg", title: { en: "Manufacturing Engineering & Welding/Casting", hi: "उत्पादन अभियांत्रिकी एवं वेल्डिंग/कास्टिंग" } },
    { id: "node-mech-metro", title: { en: "Metrology & Measurement (Limits, Fits & Tolerances)", hi: "मैट्रोलॉजी एवं मापन (सीमाएं एवं सहिष्णुता)" } },
    { id: "node-mech-adv", title: { en: "Advanced Manufacturing Processes (CNC, EDM, ECM, CAD/CAM)", hi: "उन्नत विनिर्माण प्रक्रियाएं" } },
  ];

  mechTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: mechSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });

  // 4. CS & IT Subject (Part-D)
  const csSubject: Subject = {
    id: "subj-cs-it",
    code: "CS_IT",
    name: {
      en: "Computer Science & Information Technology (IMD Part-D)",
      hi: "कंप्यूटर विज्ञान एवं सूचना प्रौद्योगिकी (आईएमडी भाग-D)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(csSubject);

  const csTopics = [
    { id: "node-cs-math", title: { en: "Engineering Mathematics & Discrete Structures", hi: "इंजीनियरिंग गणित एवं विविक्त संरचनाएं" } },
    { id: "node-cs-coa", title: { en: "Digital Logic & Computer Organization Architecture", hi: "डिजिटल तर्क एवं कंप्यूटर संगठन वास्तुकला" } },
    { id: "node-cs-dsa", title: { en: "Programming in C, Data Structures & Algorithms", hi: "सी प्रोग्रामिंग, डेटा संरचनाएं एवं एल्गोरिदम" } },
    { id: "node-cs-toc", title: { en: "Theory of Computation & Compiler Design", hi: "गणना सिद्धांत एवं कंपाइलर डिज़ाइन" } },
    { id: "node-cs-os", title: { en: "Operating Systems, Memory & File Systems", hi: "ऑपरेटिंग सिस्टम, मेमोरी एवं फ़ाइल सिस्टम" } },
    { id: "node-cs-dbms", title: { en: "Databases (Relational Model, SQL, Normalization)", hi: "डेटाबेस (रिलेशनल मॉडल, एसक्यूएल)" } },
    { id: "node-cs-cn", title: { en: "Computer Networks & Layering Protocols (TCP/IP, OSI)", hi: "कंप्यूटर नेटवर्क एवं लेयरिंग प्रोटोकॉल" } },
  ];

  csTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: csSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });

  // 5. Electronics & Telecommunication (Part-E)
  const eceSubject: Subject = {
    id: "subj-ece",
    code: "ELECTRONICS_TELECOM",
    name: {
      en: "Electronics & Telecommunication Engineering (IMD Part-E)",
      hi: "इलेक्ट्रॉनिक्स एवं दूरसंचार अभियांत्रिकी (आईएमडी भाग-E)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(eceSubject);

  const eceTopics = [
    { id: "node-ece-devices", title: { en: "Electronic Materials, Diodes, BJT & MOSFET", hi: "इलेक्ट्रॉनिक सामग्री, डायोड एवं ट्रांजिस्टर" } },
    { id: "node-ece-circuits", title: { en: "Amplifiers, Oscillators & Voltage Regulation", hi: "प्रवर्धक, दोलक एवं वोल्टेज विनियमन" } },
    { id: "node-ece-networks", title: { en: "Network Theorems, AC Circuits & Resonance", hi: "नेटवर्क प्रमेय, एसी परिपथ एवं अनुनाद" } },
    { id: "node-ece-digital", title: { en: "Digital Electronics, Logic Gates & Sequential Circuits", hi: "डिजिटल इलेक्ट्रॉनिक्स एवं तर्क परिपथ" } },
    { id: "node-ece-antennas", title: { en: "Antennas, Directivity & Radio Wave Propagation", hi: "एंटीना एवं रेडियो तरंग संचरण" } },
    { id: "node-ece-comm", title: { en: "Modulation (AM, SSB, FM, Pulse) & Multiplexing (FDM/TDM)", hi: "मॉड्यूलेशन एवं मल्टीप्लेक्सिंग" } },
    { id: "node-ece-digitalcomm", title: { en: "Digital Communications (PSK/ASK/FSK) & Optical Fibers", hi: "डिजिटल संचार एवं ऑप्टिकल फाइबर" } },
  ];

  eceTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: eceSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });

  // 6. Physics (Part-F)
  const physicsSubject: Subject = {
    id: "subj-physics",
    code: "PHYSICS",
    name: {
      en: "Physics (IMD Part-F)",
      hi: "भौतिक विज्ञान (आईएमडी भाग-F)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(physicsSubject);

  const physicsTopics = [
    { id: "node-phys-math", title: { en: "Mathematical Methods & Vector Calculus", hi: "गणितीय विधियां एवं सदिश कलन" } },
    { id: "node-phys-mech", title: { en: "Mechanics, Kepler's Laws & Rigid Body Dynamics", hi: "यांत्रिकी, केपलर नियम एवं पिंड गतिकी" } },
    { id: "node-phys-matter", title: { en: "Properties of Matter, Elasticity & Fluid Dynamics", hi: "पदार्थ के गुण, प्रत्यास्थता एवं द्रव गतिकी" } },
    { id: "node-phys-optics", title: { en: "Oscillations, Waves & Geometrical/Physical Optics", hi: "दोलन, तरंगें एवं प्रकाशिकी" } },
    { id: "node-phys-em", title: { en: "Electricity, Magnetism & Maxwell's Equations", hi: "विद्युत, चुंबकत्व एवं मैक्सवेल समीकरण" } },
    { id: "node-phys-thermo", title: { en: "Kinetic Theory & Thermodynamics (Entropy, Carnot)", hi: "अणुगति सिद्धांत एवं ऊष्मागतिकी" } },
    { id: "node-phys-modern", title: { en: "Modern Physics, Quantum Tunneling & Nuclear Decay", hi: "आधुनिक भौतिकी एवं नाभिकीय क्षय" } },
    { id: "node-phys-solid", title: { en: "Solid State Physics, Semiconductors & Op-Amps", hi: "ठोस अवस्था भौतिकी एवं अर्धचालक" } },
  ];

  physicsTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: physicsSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });

  // 7. Telecommunication (Part-G)
  const telecomSubject: Subject = {
    id: "subj-telecom",
    code: "TELECOM_ENG",
    name: {
      en: "Telecommunication Engineering (DoT Part-G)",
      hi: "दूरसंचार अभियांत्रिकी (डीओटी भाग-G)",
    },
    createdAt: "2026-09-02T00:00:00Z",
  };
  universalKnowledgeBrain.registerSubject(telecomSubject);

  const telecomTopics = [
    { id: "node-tel-math", title: { en: "Linear Algebra, Complex Analysis & Probability", hi: "रैखिक बीजगणित एवं प्रायिकता" } },
    { id: "node-tel-signals", title: { en: "Signals and Systems (Fourier, Laplace, Z-Transform)", hi: "सिग्नल एवं सिस्टम" } },
    { id: "node-tel-devices", title: { en: "Semiconductor Devices, Carrier Transport & MOS", hi: "अर्धचालक उपकरण एवं कैरियर परिवहन" } },
    { id: "node-tel-analog", title: { en: "Analog Circuits, Current Mirrors & Active Filters", hi: "एनालॉग परिपथ एवं सक्रिय फिल्टर" } },
    { id: "node-tel-digital", title: { en: "Digital Circuits, FSM, Propagation Delay & ADC/DAC", hi: "डिजिटल परिपथ एवं डेटा कन्वर्टर्स" } },
    { id: "node-tel-control", title: { en: "Control Systems (Bode, Nyquist, Root Locus, State-Space)", hi: "नियंत्रण प्रणाली" } },
    { id: "node-tel-comm", title: { en: "Information Theory, Digital Modulation (QAM) & BER", hi: "सूचना सिद्धांत एवं डिजिटल मॉड्यूलेशन" } },
    { id: "node-tel-em", title: { en: "Electromagnetics, Transmission Lines & Waveguides", hi: "विद्युत चुंबकत्व एवं संचरण रेखाएं" } },
  ];

  telecomTopics.forEach((topic, idx) => {
    universalKnowledgeBrain.registerSyllabusNode({
      id: topic.id,
      subjectId: telecomSubject.id,
      nodeType: "topic",
      title: topic.title,
      orderIndex: idx + 1,
    });
  });
}

// Auto-register upon import
registerSscJeExamPack();
