import {
  Exam,
  ExamCycle,
  ExamOrganizationRole,
  ExamPaper,
  ExamSection,
  ExamStage,
} from "../domain/schema";
import { examBrain } from "../domain/exam-brain";
import { universalKnowledgeBrain } from "../domain/universal-brain";

export const ISRO_JPA_EXAM_ID = "exam-isro-jpa";

export const ISRO_JPA_EXAM: Exam = {
  id: ISRO_JPA_EXAM_ID,
  familyCode: "isro-jpa",
  title: {
    en: "ISRO Junior Personal Assistant (JPA) / Stenographer",
    hi: "इसरो जूनियर पर्सनल असिस्टेंट (जेपीए) / आशुलिपिक",
  },
  conductingBody: "ISRO Centralised Recruitment Board (ICRB)",
  requiresBranchSelection: false, // General administrative / secretarial cadre
  isActive: true,
  createdAt: "2026-09-19T00:00:00Z",
};

// Institutional Roles modeled separately based on docs/isro-jpa-2026-mocks-final/conducting-agency-evidence.md
export const ISRO_JPA_ORGANIZATION_ROLES: ExamOrganizationRole[] = [
  {
    id: "eor-isro-recruiter",
    examId: ISRO_JPA_EXAM_ID,
    organizationId: "org-isro-icrb",
    organizationName: "ISRO Centralised Recruitment Board (ICRB)",
    roleType: "recruiting_organization",
    evidenceSource: "ISRO Recruitment Advertisement No. ICRB:01(JPA):2026 & Official Web Portal",
    verificationStatus: "verified",
    confidenceLevel: "high",
    notes: "Conducts centralized cadre recruitment across ISRO centres and units.",
    createdAt: "2026-09-19T00:00:00Z",
  },
  {
    id: "eor-isro-owner",
    examId: ISRO_JPA_EXAM_ID,
    organizationId: "org-isro-icrb",
    organizationName: "Department of Space / ISRO Headquarters",
    roleType: "exam_owner",
    evidenceSource: "Official ICRB Gazette & Notification Annexures",
    verificationStatus: "verified",
    confidenceLevel: "high",
    notes: "Sets the qualification criteria, syllabus, and reservation matrix.",
    createdAt: "2026-09-19T00:00:00Z",
  },
  {
    id: "eor-isro-paper-setter",
    examId: ISRO_JPA_EXAM_ID,
    organizationId: "org-isro-icrb",
    organizationName: "Confidential Examination Board (Department of Space)",
    roleType: "paper_setting_organization",
    evidenceSource: "Standard Public Sector Examination Architecture",
    verificationStatus: "provisional",
    confidenceLevel: "medium",
    notes: "Questions are drafted by appointed academic/administrative panels, not technology vendors.",
    createdAt: "2026-09-19T00:00:00Z",
  },
  {
    id: "eor-isro-cbt-vendor",
    examId: ISRO_JPA_EXAM_ID,
    organizationId: "org-unverified-vendor",
    organizationName: "Unknown / Unverified (Host Domain: cdn.digialm.com)",
    roleType: "cbt_platform_vendor",
    evidenceSource: "ISRO recruitment page links application/admit card to https://cdn.digialm.com/EForms/configuredHtml/1258/101396/login.html; official text does NOT explicitly name or contractually verify the CBT vendor.",
    verificationStatus: "unverified",
    confidenceLevel: "low",
    notes: "Official evidence does not explicitly establish vendor identity. While the application portal uses a DigiALM sub-domain, the formal CBT vendor is unverified in official publications.",
    createdAt: "2026-09-19T00:00:00Z",
  },
];

// 2026 Official Active Cycle based on 2026 ICRB advertisement Annexure III
export const ISRO_JPA_ACTIVE_CYCLE: ExamCycle = {
  id: "cycle-isro-jpa-2026",
  examId: ISRO_JPA_EXAM_ID,
  cycleYear: 2026,
  notificationNumber: "ICRB:01(JPA):2026",
  notificationDate: "2026-07-27",
  officialSourceUrl: "https://www.isro.gov.in/ICRB_Recruitment11.html",
  patternVersion: "ISRO-JPA-Annexure-III-2026",
  status: "verified_official",
  evidenceGaps: [
    "Part C does not define a fixed sub-quota between Quantitative Aptitude and General Knowledge (observed 25/25 in 2023).",
  ],
  createdAt: "2026-09-19T00:00:00Z",
};

export const ISRO_JPA_STAGE_1: ExamStage = {
  id: "stage-isro-jpa-cbt",
  cycleId: ISRO_JPA_ACTIVE_CYCLE.id,
  stageNumber: 1,
  name: {
    en: "Written Test (Computer Based Objective Test)",
    hi: "लिखित परीक्षा (कंप्यूटर आधारित वस्तुनिष्ठ परीक्षा)",
  },
  selectionType: "merit",
  deliveryMode: "cbt",
};

// Controlling Annexure III Blueprint: 200 Questions, 200 Marks, 150 Minutes, +1 / -0.25
export const ISRO_JPA_PAPER_1: ExamPaper = {
  id: "paper-isro-jpa-cbt",
  stageId: ISRO_JPA_STAGE_1.id,
  paperNumber: 1,
  name: {
    en: "Single Composite Objective Paper",
    hi: "एकल संयुक्त वस्तुनिष्ठ प्रश्न-पत्र",
  },
  durationMinutes: 150, // 2 Hours 30 Minutes
  totalMarks: 200,
  totalQuestions: 200,
  markingCorrect: 1.0,
  markingNegative: 0.25,
  calculatorAllowed: false,
  languageRules: ["en", "hi"],
};

export const ISRO_JPA_SECTIONS: ExamSection[] = [
  {
    id: "sec-isro-part-a",
    paperId: ISRO_JPA_PAPER_1.id,
    sectionCode: "PART_A_ENGLISH",
    name: {
      en: "Part A: General English & Comprehension",
      hi: "भाग क: सामान्य अंग्रेज़ी एवं समझ",
    },
    questionCount: 100,
    totalMarks: 100,
    orderIndex: 1,
  },
  {
    id: "sec-isro-part-b",
    paperId: ISRO_JPA_PAPER_1.id,
    sectionCode: "PART_B_REASONING",
    name: {
      en: "Part B: General Intelligence & Reasoning",
      hi: "भाग ख: सामान्य बुद्धिमत्ता एवं तर्कशक्ति",
    },
    questionCount: 50,
    totalMarks: 50,
    orderIndex: 2,
  },
  {
    id: "sec-isro-part-c",
    paperId: ISRO_JPA_PAPER_1.id,
    sectionCode: "PART_C_QUANT_GK",
    name: {
      en: "Part C: Quantitative Aptitude & General Knowledge",
      hi: "भाग ग: संख्यात्मक अभिरुचि एवं सामान्य ज्ञान",
    },
    questionCount: 50,
    totalMarks: 50,
    orderIndex: 3,
  },
];

export function registerIsroJpaExamPack(): void {
  examBrain.registerExam(ISRO_JPA_EXAM);
  ISRO_JPA_ORGANIZATION_ROLES.forEach((r) => examBrain.addOrganizationRole(r));
  examBrain.registerCycle(ISRO_JPA_ACTIVE_CYCLE);
  examBrain.registerStage(ISRO_JPA_STAGE_1);
  examBrain.registerPaper(ISRO_JPA_PAPER_1);
  ISRO_JPA_SECTIONS.forEach((s) => examBrain.registerSection(s));

  // Cross-concept mapping with ISRO-specific weight and timing
  universalKnowledgeBrain.setExamConceptProfile({
    id: "ecp-isro-perc",
    examId: ISRO_JPA_EXAM_ID,
    conceptId: "concept-percentage-base",
    topicWeight: 1.2,
    typicalDifficulty: 1.3,
    typicalSolvingTimeSeconds: 45, // 150 min for 200 questions = 45 sec/q average
    examSpecificStyleNotes: "Short direct calculation; arithmetic in Part C.",
  });

  universalKnowledgeBrain.setExamConceptProfile({
    id: "ecp-isro-pl",
    examId: ISRO_JPA_EXAM_ID,
    conceptId: "concept-profit-loss-cp-sp",
    topicWeight: 1.1,
    typicalDifficulty: 1.4,
    typicalSolvingTimeSeconds: 45,
    examSpecificStyleNotes: "Single-item transaction margin.",
  });
}

// Auto-register upon import
registerIsroJpaExamPack();
