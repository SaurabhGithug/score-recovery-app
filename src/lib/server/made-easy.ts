/**
 * Server-side access to the Made Easy test-series import (src/lib/madeeasy-import.json).
 * The results and questions belong to one app account (source.ownerUserId, set by Saurabh on
 * 2026-09-30: Reema's Made Easy account), so only that account may read them. Nothing here is
 * imported by client components, so the JSON never reaches a browser bundle.
 */
import rawImport from "@/lib/madeeasy-import.json";
import { sanitizeSourceHtml } from "./source-html";
import {
  decodePortalText,
  madeEasyReady,
  recoveryPriority,
  type MadeEasyImport,
  type MadeEasyOverview,
  type MadeEasyQuestionWithTest,
  type MadeEasyTest,
  type MadeEasyTestCard,
  type MadeEasyTestDetail,
} from "@/lib/madeeasy";

const IMPORT = rawImport as MadeEasyImport;

/**
 * The learner's attempted-tests page on the Made Easy portal (given by Saurabh, 2026-09-30). It points at the
 * ATTEMPTED filter on purpose, for capturing finished tests; the calendar's plan link (SERIES_LINK.madeeasy in
 * src/lib/calendar/test-plan.ts) drops ?tag=attempted so the learner sees the tests still to do.
 */
export const MADE_EASY_PORTAL_URL = "https://www.madeeasy.in/prep/mock-test-details/ce-ssc-je-2026-cbt-1-online-test-series?tag=attempted";

export function madeEasyOwner(): string | null {
  return IMPORT.source.ownerUserId?.trim() || null;
}

/** True only for the account the import belongs to. With no owner recorded, nobody may read it. */
export function canReadMadeEasy(userId: string): boolean {
  const owner = madeEasyOwner();
  return owner !== null && owner === userId;
}

function decoded(test: MadeEasyTest): MadeEasyQuestionWithTest[] {
  return test.attentionQuestions
    .map((question) => ({
      ...question,
      question: decodePortalText(question.question),
      explanation: decodePortalText(question.explanation),
      options: question.options.map((option) => ({ ...option, text: decodePortalText(option.text) })),
      // Third-party HTML is rebuilt from an allowlist before it leaves the server (source-html.ts).
      questionHtml: question.questionHtml ? sanitizeSourceHtml(question.questionHtml) : undefined,
      optionsHtml: question.optionsHtml?.map(sanitizeSourceHtml),
      explanationHtml: question.explanationHtml ? sanitizeSourceHtml(question.explanationHtml) : undefined,
      testCode: test.code,
      testTitle: test.title,
    }))
    .sort((a, b) => recoveryPriority(b) - recoveryPriority(a));
}

function card(test: MadeEasyTest): MadeEasyTestCard {
  const questions = test.attentionQuestions;
  const ready = questions.filter(madeEasyReady).length;
  return {
    code: test.code,
    title: test.title,
    summary: test.summary,
    counts: {
      attention: questions.length,
      ready,
      needsSource: questions.length - ready,
      incorrect: questions.filter((q) => q.status === "incorrect").length,
      unattempted: questions.filter((q) => q.status === "unattempted").length,
    },
  };
}

export function madeEasyOverview(): MadeEasyOverview {
  return {
    provider: IMPORT.source.provider,
    series: IMPORT.source.series,
    capturedOn: IMPORT.source.capturedOn,
    portalUrl: MADE_EASY_PORTAL_URL,
    tests: IMPORT.tests.map(card),
  };
}

export function madeEasyTest(code: string): MadeEasyTestDetail | null {
  const test = IMPORT.tests.find((t) => t.code === code);
  if (!test) return null;
  return {
    provider: IMPORT.source.provider,
    capturedOn: IMPORT.source.capturedOn,
    portalUrl: MADE_EASY_PORTAL_URL,
    test: card(test),
    questions: decoded(test),
  };
}

export function allMadeEasyQuestions(): MadeEasyQuestionWithTest[] {
  return IMPORT.tests.flatMap(decoded);
}

export function madeEasyQuestion(id: string): MadeEasyQuestionWithTest | null {
  for (const test of IMPORT.tests) {
    if (!test.attentionQuestions.some((q) => q.id === id)) continue;
    return decoded(test).find((q) => q.id === id) ?? null;
  }
  return null;
}
