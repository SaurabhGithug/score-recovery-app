export const TESTBOOK_IMPORT_STORAGE_KEY = "score-recovery.testbook.ssc-je-civil.v1";
export const TESTBOOK_TRAINING_STORAGE_KEY = "score-recovery.testbook.training.v1";

export function userScopedTestbookStorageKey(baseKey: string, userId: string) {
  return `${baseKey}.${userId}`;
}

export function migrateLegacyTestbookStorage(baseKey: string, userId: string, confirmedOwnership = false) {
  const scopedKey = userScopedTestbookStorageKey(baseKey, userId);
  if (typeof window === "undefined" || window.localStorage.getItem(scopedKey)) return scopedKey;
  const ownerKey = `${baseKey}.legacy-owner`;
  const owner = window.localStorage.getItem(ownerKey);
  // Unowned imports must never silently become the next signed-in learner's history.
  if (owner && owner !== userId) return scopedKey;
  if (!owner && !confirmedOwnership) return scopedKey;
  const legacy = window.localStorage.getItem(baseKey);
  if (legacy) {
    window.localStorage.setItem(ownerKey, userId);
    window.localStorage.setItem(scopedKey, legacy);
  }
  return scopedKey;
}

export type TestbookAttemptStatus = "correct" | "incorrect" | "unattempted" | "partial";
export type TestbookEvidenceState = "portal_verified" | "portal_solution_pending";
export type TestbookRecoveryCause =
  | "knowledge_gap"
  | "method_gap"
  | "calculation_error"
  | "reading_error"
  | "speed_issue"
  | "unsure";

export interface TestbookTrainingAttempt {
  id: string;
  testId: string;
  questionId: string;
  attemptedAt: string;
  selectedOption: string;
  correct: boolean;
  elapsedSeconds: number;
  cause: TestbookRecoveryCause | null;
}

export interface TestbookOption {
  id: string;
  text: string;
  html: string;
  assets: string[];
}

export interface TestbookPortalSolution {
  correctOption: string;
  html: string;
  text: string;
  assets: string[];
  evidenceText: string;
}

export interface TestbookQuestion {
  id: string;
  globalNumber: number;
  section: string;
  sectionQuestion: number;
  questionText: string;
  questionHtml: string;
  questionAssets: string[];
  options: TestbookOption[];
  originalResult: TestbookAttemptStatus;
  marksText: string;
  syllabusTopic: string | null;
  topicEvidence: "portal" | "official_mapping" | "pending";
  evidenceState: TestbookEvidenceState;
  portalSolution: TestbookPortalSolution | null;
}

export interface TestbookImport {
  schemaVersion: 1;
  source: {
    provider: "Testbook";
    exam: "SSC JE";
    branch: "Civil Engineering";
    series: string;
    capturedOn: string;
    sourceUrl: string;
    attemptLabel: string;
    integrityPolicy: string;
  };
  catalogue: {
    observedTotalTests: number;
    observedProgress: string;
    categories: { name: string; observedCount: number }[];
    warning: string;
  };
  tests: Array<{
    id: string;
    title: string;
    score: number;
    maxScore: number;
    attemptNumber: number;
    questionCount: number;
    sections: { name: string; questionCount: number }[];
    summary: Record<TestbookAttemptStatus, number>;
    questions: TestbookQuestion[];
  }>;
}

export type TestbookImportedTest = TestbookImport["tests"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTestbookImport(value: unknown): TestbookImport {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source)) {
    throw new Error("Unsupported Testbook import format.");
  }
  if (
    value.source.provider !== "Testbook" ||
    value.source.exam !== "SSC JE" ||
    value.source.branch !== "Civil Engineering"
  ) {
    throw new Error("This bank accepts only Testbook SSC JE Civil imports.");
  }
  if (!Array.isArray(value.tests) || value.tests.length === 0) {
    throw new Error("The import does not contain a test.");
  }

  const parsed = value as unknown as TestbookImport;
  for (const test of parsed.tests) {
    if (!Array.isArray(test.questions) || test.questions.length !== test.questionCount) {
      throw new Error(`${test.title || "Test"} has an incomplete question inventory.`);
    }
    const ids = new Set(test.questions.map((question) => question.id));
    if (ids.size !== test.questions.length) {
      throw new Error(`${test.title} contains duplicate question IDs.`);
    }
    for (const question of test.questions) {
      if (!question.questionText || question.options.length < 2) {
        throw new Error(`${test.title}, question ${question.globalNumber} is missing required text or options.`);
      }
      if (question.evidenceState === "portal_verified") {
        const answer = question.portalSolution?.correctOption;
        if (!answer || !question.options.some((option) => option.id === answer) || !question.portalSolution?.text) {
          throw new Error(`${test.title}, question ${question.globalNumber} has incomplete portal evidence.`);
        }
      }
      const assets = [
        ...question.questionAssets,
        ...question.options.flatMap((option) => option.assets),
        ...(question.portalSolution?.assets ?? []),
      ];
      if (assets.some((asset) => !asset.startsWith("https://"))) {
        throw new Error(`${test.title}, question ${question.globalNumber} contains an unsafe visual URL.`);
      }
    }
  }
  return parsed;
}

export function countTestbookEvidence(test: TestbookImport["tests"][number]) {
  return test.questions.reduce(
    (total, question) => {
      total[question.evidenceState] += 1;
      return total;
    },
    { portal_verified: 0, portal_solution_pending: 0 }
  );
}

export function mergeTestbookImports(current: TestbookImport | null, incoming: TestbookImport): TestbookImport {
  if (!current) return incoming;
  const tests = new Map(current.tests.map((test) => [test.id, test]));
  for (const test of incoming.tests) tests.set(test.id, test);
  return parseTestbookImport({
    ...current,
    source: {
      ...current.source,
      capturedOn: incoming.source.capturedOn,
      sourceUrl: incoming.source.sourceUrl,
      attemptLabel: `${tests.size} verified portal capture${tests.size === 1 ? "" : "s"}`,
    },
    catalogue: incoming.catalogue,
    tests: [...tests.values()],
  });
}

export function paperOneRecoveryMarks(test: TestbookImportedTest) {
  return Number((test.summary.incorrect * 1.25 + test.summary.unattempted).toFixed(2));
}

export function readTrainingAttempts(value: unknown): TestbookTrainingAttempt[] {
  if (!Array.isArray(value)) return [];
  return value.filter((attempt): attempt is TestbookTrainingAttempt => {
    if (!isRecord(attempt)) return false;
    return (
      typeof attempt.id === "string" &&
      typeof attempt.testId === "string" &&
      typeof attempt.questionId === "string" &&
      typeof attempt.attemptedAt === "string" &&
      typeof attempt.selectedOption === "string" &&
      typeof attempt.correct === "boolean" &&
      typeof attempt.elapsedSeconds === "number" &&
      (attempt.cause === null ||
        ["knowledge_gap", "method_gap", "calculation_error", "reading_error", "speed_issue", "unsure"].includes(
          String(attempt.cause)
        ))
    );
  });
}
