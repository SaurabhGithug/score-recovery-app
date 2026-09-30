/**
 * Made Easy test-series import: types and display helpers only, safe for the browser.
 * The data itself (src/lib/madeeasy-import.json) is read on the server by
 * src/lib/server/made-easy.ts and served only to its owner's account through /api/made-easy.
 */

export type MadeEasyQuestionStatus = "incorrect" | "unattempted";
/**
 * verified_text: complete plain text from the first capture. verified_source: the portal's own HTML
 * (text and images) recaptured 2026-09-30. visual_review_required: parts missing; not practised.
 */
export type MadeEasySourceQuality = "verified_text" | "verified_source" | "visual_review_required";

export function madeEasyReady(q: { sourceQuality: MadeEasySourceQuality }): boolean {
  return q.sourceQuality !== "visual_review_required";
}

export interface MadeEasyOption {
  id: string;
  text: string;
}

export interface MadeEasyQuestion {
  id: string;
  number: number;
  status: MadeEasyQuestionStatus;
  timeSeconds: number;
  marksAwarded: number;
  avgAttemptRate: number;
  avgTimeSeconds: number;
  question: string;
  options: MadeEasyOption[];
  selectedOption: string | null;
  correctOption: string;
  explanation: string;
  deceptiveChoice: string;
  popularChoice: string;
  sourceQuality: MadeEasySourceQuality;
  /** The portal's own HTML (with its image links), when recaptured. Sanitized before it is served. */
  questionHtml?: string;
  optionsHtml?: string[];
  explanationHtml?: string;
}

export interface MadeEasyTestSummary {
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  rank: number;
  participants: number;
  percentile: number;
  accuracy: number;
  timeMinutes: number;
  averageScore: number;
  highestScore: number;
  averageAccuracy: number;
  medianScore: number;
}

export interface MadeEasyTest {
  code: string;
  title: string;
  summary: MadeEasyTestSummary;
  attentionQuestions: MadeEasyQuestion[];
}

export interface MadeEasyImport {
  schemaVersion: number;
  source: {
    provider: string;
    series: string;
    capturedOn: string;
    scope: string;
    integrityPolicy: string;
    /** The one app account these results belong to (server-side only; not sent to the browser). */
    ownerUserId?: string;
    ownerNote?: string;
  };
  tests: MadeEasyTest[];
}

export type MadeEasyQuestionWithTest = MadeEasyQuestion & {
  testCode: string;
  testTitle: string;
};

export function decodePortalText(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** A test as listed on the Made Easy page: its result and how many of its saved questions are practice-ready. */
export interface MadeEasyTestCard {
  code: string;
  title: string;
  summary: MadeEasyTestSummary;
  counts: { attention: number; ready: number; needsSource: number; incorrect: number; unattempted: number };
}

export interface MadeEasyOverview {
  provider: string;
  series: string;
  capturedOn: string;
  portalUrl: string;
  tests: MadeEasyTestCard[];
}

export interface MadeEasyTestDetail {
  provider: string;
  capturedOn: string;
  portalUrl: string;
  test: MadeEasyTestCard;
  /** Decoded text, ordered by practice priority. */
  questions: MadeEasyQuestionWithTest[];
}

export function formatSeconds(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

export function observedSignal(question: MadeEasyQuestion) {
  if (question.status === "incorrect") {
    return `Your saved answer was wrong; time: ${formatSeconds(question.timeSeconds)}`;
  }

  if (question.timeSeconds > question.avgTimeSeconds) {
    return `No answer recorded; ${formatSeconds(question.timeSeconds)} spent versus ${formatSeconds(
      question.avgTimeSeconds
    )} group average`;
  }

  return `No answer recorded after ${formatSeconds(question.timeSeconds)}`;
}

export function recoveryPriority(question: MadeEasyQuestion) {
  let score = question.status === "incorrect" ? 100 : 0;
  if (question.timeSeconds > question.avgTimeSeconds) score += 25;
  if (question.deceptiveChoice) score += 10;
  score += Math.max(0, 100 - question.avgAttemptRate) / 10;
  return score;
}
