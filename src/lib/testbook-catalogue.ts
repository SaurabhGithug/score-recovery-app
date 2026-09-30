export type TestbookCatalogueState = "attempted" | "available_unattempted" | "portal_hidden" | "portal_blocked";

export interface TestbookCatalogueItem {
  id: string;
  title: string;
  category: string;
  state: TestbookCatalogueState;
  observedQuestions: number | null;
  observedMarks: number | null;
  observedMinutes: number | null;
}

export interface CapturedTestbookTest {
  id: string;
  title: string;
  capturedQuestions: number;
  portalVerifiedSolutions: number;
  heldOutQuestions: number;
}

export const testbookCatalogueAudit = {
  observedAt: "2026-09-30",
  sourceUrl: "https://testbook.com/ssc-je-ce/test-series/my",
  liveHeaderTotal: 1027,
  observedProgress: "38/1027",
  solutionAccessibleAttemptHistory: 42,
  integrityWarning:
    "The live catalogue header reports 1,027 tests. Marketing text on the same page reports 1,069 and sometimes uses Electrical wording on the Civil page. Live cards and live counters take priority over promotional copy.",
  categories: [
    { name: "Previous Year Papers", liveCount: 39 },
    { name: "Official Chapter Tests", liveCount: 52 },
    { name: "Official Subject Tests", liveCount: 127 },
    { name: "SSC JE Technical PYQs", liveCount: 37 },
    { name: "SSC Non-Tech Basic PYPs", liveCount: 254 },
    { name: "SSC Non-Tech Advanced PYPs", liveCount: 182 },
    { name: "SSC CGL Similar 2025 PYPs", liveCount: 16 },
  ],
  blockers: [
    "The catalogue's View More control did not reveal the remaining cards in this browser session.",
    "Subscription-locked cards are inventoried by their visible metadata only; their protected contents are not bypassed.",
    "Unattempted tests are not submitted blank merely to unlock solutions, because that would corrupt portal performance history.",
    "The full commercial question bank is not duplicated. Only learner-accessible attempt material with a legitimate study purpose can be imported privately.",
  ],
} as const;

export const capturedTestbookTests: CapturedTestbookTest[] = [
  { id: "696230a5b8298a3583ea9d34", title: "SSC JE CE Full Test 1", capturedQuestions: 200, portalVerifiedSolutions: 200, heldOutQuestions: 0 },
  { id: "696230a5289f7b74caaaaeaa", title: "SSC JE CE Full Test 2", capturedQuestions: 200, portalVerifiedSolutions: 196, heldOutQuestions: 4 },
  { id: "696230a6e72332566bcd2889", title: "SSC JE CE Full Test 3", capturedQuestions: 200, portalVerifiedSolutions: 199, heldOutQuestions: 1 },
  { id: "696230767a4a7332463c6656", title: "ST 24: Building Materials (Conceptual)", capturedQuestions: 20, portalVerifiedSolutions: 20, heldOutQuestions: 0 },
];

export const capturedTestbookTotals = capturedTestbookTests.reduce(
  (totals, test) => ({
    questions: totals.questions + test.capturedQuestions,
    verifiedSolutions: totals.verifiedSolutions + test.portalVerifiedSolutions,
    heldOut: totals.heldOut + test.heldOutQuestions,
  }),
  { questions: 0, verifiedSolutions: 0, heldOut: 0 },
);

const fullTests: TestbookCatalogueItem[] = [
  ["696230a5b8298a3583ea9d34", "SSC JE CE Full Test 1", "attempted"],
  ["696230a5289f7b74caaaaeaa", "SSC JE CE Full Test 2", "attempted"],
  ["696230a6e72332566bcd2889", "SSC JE CE Full Test 3", "attempted"],
  ["696230a7f003fc5349983b11", "SSC JE CE Full Test 4", "available_unattempted"],
  ["696230a76da5efe71dee9c37", "SSC JE CE Full Test 5", "available_unattempted"],
  ["696230a8bdff87547805916c", "SSC JE CE Full Test 6", "available_unattempted"],
  ["696230a9627725f39dd4ed3e", "SSC JE CE Full Test 7", "available_unattempted"],
  ["696230a90f546b635cf0d735", "SSC JE CE Full Test 8", "available_unattempted"],
  ["696230aa2f53fc22bf9a8bc1", "SSC JE CE Full Test 9", "available_unattempted"],
  ["696230ab2f53fc22bf9a8bc8", "SSC JE CE Full Test 10", "available_unattempted"],
].map(([id, title, state]) => ({ id, title, state: state as TestbookCatalogueState, category: "Full Test", observedQuestions: 200, observedMarks: 200, observedMinutes: 120 }));

const subjectTests: TestbookCatalogueItem[] = [
  ["696230580f546b635cf0ce72", "ST 1: General Awareness"],
  ["69623059ef9c3bf4e9a4aa66", "ST 2: General Awareness"],
  ["6962305a279ada0434bf2b0c", "ST 3: General Awareness"],
  ["6962305a7a4a7332463c6579", "ST 4: General Awareness"],
  ["6962305bbe11fb0496f56f8c", "ST 5: General Awareness"],
  ["6962305b7a4a7332463c6581", "ST 6: General Awareness"],
  ["6962305c289f7b74caaaab32", "ST 7: General Science"],
  ["6962305df7784e370b85557f", "ST 8: General Science"],
  ["6962305e289f7b74caaaab3b", "ST 9: General Science"],
  ["6962305e0f546b635cf0ceeb", "ST 10: Computer Awareness"],
].map(([id, title]) => ({ id, title, state: "available_unattempted" as const, category: "Subject Test", observedQuestions: 20, observedMarks: 20, observedMinutes: 12 }));

export const verifiedTestbookCatalogueItems = [...fullTests, ...subjectTests];
