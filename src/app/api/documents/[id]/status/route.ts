import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { DocumentRepository } from "@/lib/server/repositories/document-repo";
import { ProcessingQueue } from "@/lib/server/jobs/processing-queue";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id } = await props.params;
    const document = await DocumentRepository.findById(id, user.id);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const job = ProcessingQueue.getJobStatus(id);

    return NextResponse.json({
      id: document.id,
      status: document.extraction_status,
      statusMessage: document.status_message,
      parserUsed: document.parser_used,
      pageCount: document.page_count,
      questionsCount: document.questions_count,
      readyCount: document.ready_questions_count,
      reviewCount: document.review_questions_count,
      progress: job?.progress ?? (document.extraction_status === "READY" ? 100 : 10),
      jobStatus: job?.status ?? document.extraction_status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
