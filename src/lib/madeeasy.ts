import rawImport from "@/lib/madeeasy-import.json";

export type MadeEasyQuestionStatus = "incorrect" | "unattempted";
export type MadeEasySourceQuality = "verified_text" | "visual_review_required";

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
  };
  tests: MadeEasyTest[];
}

export type MadeEasyQuestionWithTest = MadeEasyQuestion & {
  testCode: string;
  testTitle: string;
};

export const MADE_EASY_IMPORT = rawImport as MadeEasyImport;

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

export const MADE_EASY_QUESTIONS: MadeEasyQuestionWithTest[] =
  MADE_EASY_IMPORT.tests.flatMap((test) =>
    test.attentionQuestions.map((question) => ({
      ...question,
      question: decodePortalText(question.question),
      explanation: decodePortalText(question.explanation),
      options: question.options.map((option) => ({
        ...option,
        text: decodePortalText(option.text),
      })),
      testCode: test.code,
      testTitle: test.title,
    }))
  );

export const MADE_EASY_DRILL_QUESTIONS = MADE_EASY_QUESTIONS.filter(
  (question) => question.sourceQuality === "verified_text"
);

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
