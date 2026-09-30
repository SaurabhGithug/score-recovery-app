// ============================================================================
// Domain Schema: Core Types for the 4-Brain Adaptive Platform Architecture
// Covers all 24 required domain entities and enums.
// ============================================================================

export type Lang = "en" | "hi";

export type BilingualText = {
  en: string;
  hi: string;
};

export type PublishingStatus =
  | "draft"
  | "machine_validated"
  | "expert_reviewed"
  | "published"
  | "rejected"
  | "retired";

export type VerificationStatus = "unverified" | "provisional" | "verified";

export type ConfidenceLevel = "low" | "medium" | "high";

export type CognitiveLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate";

export type ExamRoleType =
  | "recruiting_organization"
  | "exam_owner"
  | "paper_setting_organization"
  | "conducting_agency"
  | "cbt_platform_vendor";

export type SourceTier =
  | "official_recruiter"
  | "official_unit"
  | "third_party_scan";

export type ExtractionMode =
  | "numbered_block_unverified"
  | "verified_text"
  | "visual_diagram";

// ----------------------------------------------------------------------------
// 1. Organization & Roles
// ----------------------------------------------------------------------------
export interface Organization {
  id: string;
  name: string;
  shortCode: string;
  officialWebsite?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamOrganizationRole {
  id: string;
  examId: string;
  organizationId: string;
  organizationName: string;
  roleType: ExamRoleType;
  evidenceSource: string;
  verificationStatus: VerificationStatus;
  confidenceLevel: ConfidenceLevel;
  notes?: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 2. Universal Knowledge Brain Entities
// ----------------------------------------------------------------------------
export interface Subject {
  id: string;
  code: string;
  name: BilingualText;
  createdAt: string;
}

export interface SyllabusNode {
  id: string;
  subjectId: string;
  parentId?: string;
  nodeType: "subject" | "unit" | "topic" | "subtopic";
  title: BilingualText;
  description?: BilingualText;
  orderIndex: number;
}

export interface FormulaReference {
  name: string;
  latex: string;
  variables: Record<string, string>;
  standardUnits?: string;
}

export interface Misconception {
  key: string;
  title: BilingualText;
  description: BilingualText;
  typicalDistractorPattern: string;
  remedialAdvice: BilingualText;
}

export interface QuestionArchetype {
  id: string;
  title: string;
  cognitiveLevel: CognitiveLevel;
  description: string;
}

export interface Concept {
  id: string;
  syllabusNodeId: string;
  subjectId: string;
  canonicalName: string;
  name: BilingualText;
  summary: BilingualText;
  formulae: FormulaReference[];
  misconceptions: Misconception[];
  questionArchetypes: QuestionArchetype[];
  createdAt: string;
}

export interface ConceptPrerequisite {
  id: string;
  conceptId: string;
  prerequisiteConceptId: string;
  isStrict: boolean;
}

export interface ExamConceptProfile {
  id: string;
  examId: string;
  conceptId: string;
  topicWeight: number; // e.g. 1.0 = baseline, 2.5 = high yield
  typicalDifficulty: number; // 1.0 (easy) to 3.0 (hard)
  typicalSolvingTimeSeconds: number;
  examSpecificStyleNotes?: string;
}

// ----------------------------------------------------------------------------
// 3. Exam Brain Entities
// ----------------------------------------------------------------------------
export interface Exam {
  id: string;
  familyCode: string; // e.g. "ssc-je", "isro-jpa"
  title: BilingualText;
  conductingBody: string;
  requiresBranchSelection: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ExamCycle {
  id: string;
  examId: string;
  cycleYear: number;
  notificationNumber?: string;
  notificationDate?: string;
  officialSourceUrl?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  correctionWindow?: string;
  tentativeSchedulePaper1?: string;
  tentativeSchedulePaper2?: string;
  totalVacancies?: number;
  payMatrixLevel?: string;
  patternVersion: string;
  status: "draft" | "verified_official" | "archived";
  evidenceGaps: string[];
  createdAt: string;
}

export type ExamBranchCode =
  | "civil"
  | "electrical"
  | "mechanical"
  | "electrical_mechanical"
  | "cs_it"
  | "electronics_telecom"
  | "physics"
  | "telecom"
  | "common"
  | string;

export interface ExamBranch {
  id: string;
  examId: string;
  branchCode: ExamBranchCode;
  name: BilingualText;
  technicalContentReady: boolean;
  evidenceGaps?: string[];
  createdAt: string;
}

export interface ExamStage {
  id: string;
  cycleId: string;
  stageNumber: number;
  name: BilingualText;
  selectionType: "qualifying" | "merit";
  deliveryMode: "cbt" | "pen_paper" | "skill_test";
}

export interface ExamPaper {
  id: string;
  stageId: string;
  branchId?: string; // null for common papers
  paperNumber: number;
  name: BilingualText;
  durationMinutes: number | null; // Nullable if evidence gap exists
  totalMarks: number | null;
  totalQuestions: number | null;
  markingCorrect: number | null;
  markingNegative: number | null; // Positive value to subtract on wrong
  calculatorAllowed: boolean;
  languageRules: Lang[];
  evidenceGaps?: string[];
}

export interface ExamSection {
  id: string;
  paperId: string;
  sectionCode: string;
  name: BilingualText;
  questionCount: number | null;
  totalMarks: number | null;
  orderIndex: number;
}

// ----------------------------------------------------------------------------
// 4. Source Provenance & Question Items
// ----------------------------------------------------------------------------
export interface SourceDocument {
  id: string;
  examId?: string;
  cycleId?: string;
  title: string;
  sourceTier: SourceTier;
  sourceUrl?: string;
  localPath: string;
  rightsAndProvenance: string;
  allowPublicPublishing: boolean;
  createdAt: string;
}

export interface QuestionItem {
  id: string;
  canonicalCode?: string;
  examId: string;
  cycleId?: string;
  branchId?: string;
  sectionId?: string;
  questionType: "mcq_single" | "numerical" | "cloze" | "passage_mcq";
  cognitiveLevel: CognitiveLevel;
  targetTimeSeconds: number;
  difficultyRating: number; // 1.0 to 3.0
  publishingStatus: PublishingStatus;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionOption {
  id: string;
  optionKey: "A" | "B" | "C" | "D";
  text: BilingualText;
  isCorrect: boolean;
  distractorExplanation?: BilingualText;
  misconceptionTag?: string;
  orderIndex: number;
}

export interface QuestionItemVersion {
  id: string;
  questionId: string;
  versionNumber: number;
  stem: BilingualText;
  options: QuestionOption[];
  explanation: BilingualText;
  formulaeAndUnits?: {
    formulaLatex?: string;
    targetUnits?: string;
  };
  generatorMetadata?: {
    model?: string;
    promptId?: string;
    temperature?: number;
  };
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface QuestionConcept {
  id: string;
  questionId: string;
  conceptId: string;
  isPrimary: boolean;
}

export interface QuestionProvenance {
  id: string;
  questionId: string;
  sourceDocumentId: string;
  paperCode: string;
  originalQuestionNumber: string;
  sourcePdfPage: number;
  ocrConfidence?: number;
  ocrSource?: string;
  rawExtractedText?: string;
  extractionMode: ExtractionMode;
  hasDiagram: boolean;
  createdAt: string;
}

export interface QuestionValidation {
  id: string;
  questionId: string;
  validatorType: "automated_rules" | "expert_reviewer" | "pilot_audit";
  status: "passed" | "failed" | "flagged";
  validationReport: {
    ruleChecks?: Record<string, boolean>;
    discrepancies?: string[];
    reviewerNotes?: string;
  };
  validatedAt: string;
}

// ----------------------------------------------------------------------------
// 5. Student Brain & Multi-dimensional Modeling
// ----------------------------------------------------------------------------
export interface StudentExamProfile {
  id: string;
  studentId: string;
  examId: string;
  branchId?: string;
  targetExamCycleYear?: number;
  selectedLanguage: Lang;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeSession {
  id: string;
  studentId: string;
  examId: string;
  branchId?: string;
  mode: "full_diagnostic" | "targeted_repair" | "mock_test" | "speed_drill";
  startedAt: string;
  completedAt?: string;
  sessionConfig: Record<string, unknown>;
}

export interface AttemptRecord {
  id: string;
  sessionId?: string;
  studentId: string;
  examId: string;
  questionId: string;
  selectedOptionKey: "A" | "B" | "C" | "D" | null;
  isCorrect: boolean | null;
  timeSpentSeconds: number;
  visitCount: number;
  answerChangeCount: number;
  markedForReview: boolean;
  confidenceSelfReport: "low" | "medium" | "high" | null;
  createdAt: string;
}

export interface StudentConceptState {
  id: string;
  studentId: string;
  conceptId: string;
  accuracyRatio: number; // 0.0 to 1.0
  difficultyAdjustedMastery: number; // 0.0 to 1.0
  solvingSpeedIndex: number; // actualTime / expectedTime (1.0 = on target, <1 fast, >1 slow)
  retentionScore: number; // 0.0 to 1.0
  confidenceCalibrationScore: number; // 0.0 to 1.0
  transferAbilityScore: number; // 0.0 to 1.0
  hintDependenceIndex: number; // 0.0 to 1.0
  consistencyScore: number; // 0.0 to 1.0
  attemptsTotal: number;
  attemptsCorrect: number;
  lastPracticedAt?: string;
  updatedAt: string;
}

export interface MisconceptionEvidence {
  id: string;
  studentId: string;
  conceptId: string;
  attemptId: string;
  misconceptionKey: string;
  observedCause: string;
  frequency: number;
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
}

export interface ReviewSchedule {
  id: string;
  studentId: string;
  conceptId: string;
  nextReviewDue: string;
  repetitionIntervalDays: number;
  forgettingRiskRating: number; // 0.0 (safe) to 1.0 (high risk of forgetting)
  isCompleted: boolean;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 6. Learning Policy Recommendation Entity
// ----------------------------------------------------------------------------
export interface LearningActionRecommendation {
  id: string;
  targetExamId: string;
  branchId?: string;
  conceptId: string;
  conceptName: BilingualText;
  subjectName: BilingualText;
  priorityScore: number; // Computed explainable score
  actionType: "retest_unseen" | "misconception_remedy" | "speed_drill" | "retention_review";
  recommendedQuestionIds: string[];
  estimatedMinutes: number;
  expectedMarksGain: number;
  rationale: {
    officialBlueprintWeight: number;
    studentWeaknessLevel: number;
    forgettingRisk: number;
    recurringMisconceptionCount: number;
    summary: BilingualText;
  };
}
