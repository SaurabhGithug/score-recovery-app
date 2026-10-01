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
  observedAt: "2026-10-01",
  sourceUrl: "https://testbook.com/ssc-je-ce/test-series/my",
  liveHeaderTotal: 1027,
  requestedCategoryTotal: 707,
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
    "The 707 test listings are metadata, not 707 captured question sets. Only six complete solution pages have been saved and checked.",
    "One additional Official Chapter Test was submitted with the learner's authorization, but Testbook signed out before its unlocked solutions could be captured.",
    "The six saved tests were imported into Reema's local private bank; they have not been deployed to the live app.",
  ],
} as const;

export const capturedTestbookTests: CapturedTestbookTest[] = [
  { id: "69622ed29b3da2c77748c517", title: "OCT 8: Surveying (Fundamental Concept & Linear Measurement)", capturedQuestions: 10, portalVerifiedSolutions: 10, heldOutQuestions: 0 },
  { id: "69622ed3be11fb0496f54dac", title: "OCT 9: Surveying (Compass & Theodolite)", capturedQuestions: 10, portalVerifiedSolutions: 10, heldOutQuestions: 0 },
  { id: "69622ed4c497a1018de5c98a", title: "OCT 10: Surveying (Contouring & Area & Volume)", capturedQuestions: 10, portalVerifiedSolutions: 10, heldOutQuestions: 0 },
  { id: "6997144461da269378f0c33d", title: "SSC JE (Civil Engineering) Official Paper (Held On: 03 Dec, 2025 Shift 1)", capturedQuestions: 200, portalVerifiedSolutions: 200, heldOutQuestions: 0 },
  { id: "699714455397aa616b8d8874", title: "SSC JE (Civil Engineering) Official Paper (Held On: 04 Dec, 2025 Shift 1)", capturedQuestions: 200, portalVerifiedSolutions: 200, heldOutQuestions: 0 },
  { id: "69b7ef02290d3bedaacf169c", title: "SSC JE CE Technical Part Official Paper (Held On: 03 Dec, 2025 Shift 1)", capturedQuestions: 100, portalVerifiedSolutions: 100, heldOutQuestions: 0 },
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
