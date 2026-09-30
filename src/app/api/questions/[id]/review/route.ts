import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { MissingAnswerKeyError, QuestionRepository, VerificationStatus } from "@/lib/server/repositories/question-repo";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id } = await props.params;
    const body = await req.json();
    const status = body.status as VerificationStatus;

    if (!["AUTO_ACCEPTED", "VERIFIED", "NEEDS_REVIEW", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const updated = QuestionRepository.updateVerification(id, user.id, {
      status,
      questionText: body.questionText,
      options: body.options,
      correctAnswer: body.correctAnswer,
      explanation: body.explanation,
      reviewReason: body.reviewReason,
    });

    if (!updated) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json({ question: updated });
  } catch (err: unknown) {
    if (err instanceof MissingAnswerKeyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to update question";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
