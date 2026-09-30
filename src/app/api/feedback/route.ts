import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { FeedbackCategory, FeedbackRepository } from "@/lib/server/repositories/feedback-repo";
import { DocumentRepository } from "@/lib/server/repositories/document-repo";
import { QuestionRepository } from "@/lib/server/repositories/question-repo";
import { PreparationContextRepository } from "@/lib/server/repositories/preparation-context-repo";

const ALLOWED_CATEGORIES = new Set<FeedbackCategory>([
  "content",
  "experience",
  "technical",
  "idea",
  "question_issue",
]);

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const body = await req.json();
    const category = body.category as FeedbackCategory;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const rating = body.rating == null ? null : Number(body.rating);

    if (!ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Choose a valid feedback category" }, { status: 400 });
    }
    if (message.length < 3 || message.length > 2000) {
      return NextResponse.json({ error: "Feedback must be between 3 and 2,000 characters" }, { status: 400 });
    }
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "Rating must be from 1 to 5" }, { status: 400 });
    }

    const documentId = typeof body.documentId === "string" ? body.documentId : null;
    const questionId = typeof body.questionId === "string" ? body.questionId : null;
    const contextId = typeof body.contextId === "string" ? body.contextId : null;
    if (contextId && !(await PreparationContextRepository.findById(contextId, user.id))) {
      return NextResponse.json({ error: "Preparation context not found" }, { status: 404 });
    }
    if (documentId && !(await DocumentRepository.findById(documentId, user.id))) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (questionId && !(await QuestionRepository.findById(questionId, user.id))) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const feedback = await FeedbackRepository.create({
      userId: user.id,
      preparationContextId: contextId,
      documentId,
      questionId,
      category,
      rating,
      message,
      placement: typeof body.placement === "string" ? body.placement.slice(0, 80) : "unknown",
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    return NextResponse.json({ feedbackId: feedback.id }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save feedback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
