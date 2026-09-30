import { NextRequest, NextResponse } from "next/server";
import type { BankExplanation, BankExplanationOption } from "@/lib/bank/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { explainForLearner } from "@/lib/server/bank/explain";
import { HttpError } from "@/lib/server/bank/http";
import { testbookQuestionId } from "@/lib/server/bank/import-testbook";
import { BankRepository } from "@/lib/server/repositories/bank-repo";
import { SSC_JE_CIVIL_SYLLABUS_SOURCE } from "@/lib/ssc-je-civil-syllabus";

/**
 * POST /api/testbook/explain { testId, questionId } — a teaching note for one question of the
 * learner's own Testbook capture.
 *
 * The request names the question only. The question text, options, key and portal solution are
 * loaded on the server from the learner's private copy in the question bank
 * (/api/bank/import/testbook), so a client cannot supply its own "portal-verified" answer.
 * 404 { code: "not_on_server" } means the capture has not been copied to the server yet.
 */

interface TeachingNote {
  lockedAnswer: string;
  suggestedSyllabusTopic: string;
  concept: string;
  steps: string[];
  whyCorrect: string;
  /** Why the key is right and each other option is wrong. */
  options?: BankExplanationOption[];
  traps: string[];
  prerequisites: string[];
  verificationLimits: string[];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function toTeachingNote(x: BankExplanation): TeachingNote {
  return {
    lockedAnswer: x.lockedAnswer,
    suggestedSyllabusTopic: x.topic,
    concept: x.concept,
    steps: x.steps,
    whyCorrect: x.whyCorrect,
    options: x.options,
    traps: x.examTip ? [...x.traps, x.examTip] : x.traps,
    prerequisites: [],
    verificationLimits: x.verificationLimits,
  };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to generate a teaching note." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const testId = typeof body?.testId === "string" ? body.testId : "";
  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  if (!ID_PATTERN.test(testId) || !ID_PATTERN.test(questionId)) {
    return NextResponse.json({ error: "Expected { testId, questionId } of a captured Testbook question." }, { status: 400 });
  }

  const bankQuestionId = testbookQuestionId(user.id, testId, questionId);
  if (!BankRepository.getQuestionFor(bankQuestionId, user.id)) {
    return NextResponse.json(
      { error: "This question is not on the server yet. Copy your Testbook bank to the server, then try again.", code: "not_on_server" },
      { status: 404 }
    );
  }

  try {
    const { explanation } = await explainForLearner(bankQuestionId, user.id);
    return NextResponse.json({
      note: toTeachingNote(explanation),
      evidence: {
        answerAuthority: "Testbook portal solution (your own capture, stored on the server)",
        teachingNoteAuthority: `AI-generated with ${explanation.model}`,
        syllabusSource: SSC_JE_CIVIL_SYLLABUS_SOURCE,
        canChangeAnswerKey: false,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[testbook explain] failed:", error);
    return NextResponse.json({ error: "AI explanation failed." }, { status: 502 });
  }
}
