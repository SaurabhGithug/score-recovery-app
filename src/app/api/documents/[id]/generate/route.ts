import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { DocumentRepository } from "@/lib/server/repositories/document-repo";
import { PreparationContextRepository } from "@/lib/server/repositories/preparation-context-repo";
import { GenerationQueue } from "@/lib/server/jobs/generation-queue";
import { getLlmSetup } from "@/lib/server/llm";
import { chunkPages } from "@/lib/server/generation/chunker";
import { loadSourcePages, questionTarget } from "@/lib/server/generation/question-generator";
import { estimateRunCostUsd } from "@/lib/server/generation/pricing";

const MAX_QUESTIONS_PER_PAGE = 5;

function parseRange(
  raw: { pageFrom?: unknown; pageTo?: unknown; questionsPerPage?: unknown },
  firstPage: number,
  lastPage: number
): { pageFrom: number; pageTo: number; questionsPerPage: number } | string {
  const pageFrom = raw.pageFrom == null || raw.pageFrom === "" ? firstPage : Number(raw.pageFrom);
  const pageTo = raw.pageTo == null || raw.pageTo === "" ? lastPage : Number(raw.pageTo);
  const questionsPerPage = raw.questionsPerPage == null || raw.questionsPerPage === "" ? 3 : Number(raw.questionsPerPage);

  if (![pageFrom, pageTo, questionsPerPage].every(Number.isInteger)) return "Pages and questions per page must be whole numbers";
  if (pageFrom < firstPage || pageTo > lastPage || pageFrom > pageTo) {
    return `Choose pages between ${firstPage} and ${lastPage}`;
  }
  if (questionsPerPage < 1 || questionsPerPage > MAX_QUESTIONS_PER_PAGE) {
    return `Questions per page must be 1 to ${MAX_QUESTIONS_PER_PAGE}`;
  }
  return { pageFrom, pageTo, questionsPerPage };
}

/** Setup state, a cost estimate for the chosen range, and the current or last run. */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "User session required" }, { status: 401 });

    const { id } = await props.params;
    const document = DocumentRepository.findById(id, user.id);
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const pageNumbers = DocumentRepository.getPages(id).map((p) => p.page_number);
    const firstPage = pageNumbers.length ? Math.min(...pageNumbers) : 1;
    const lastPage = pageNumbers.length ? Math.max(...pageNumbers) : 1;
    const setup = getLlmSetup();

    const sp = req.nextUrl.searchParams;
    const range = parseRange(
      { pageFrom: sp.get("pageFrom"), pageTo: sp.get("pageTo"), questionsPerPage: sp.get("questionsPerPage") },
      firstPage,
      lastPage
    );

    let estimate = null;
    if (typeof range !== "string" && pageNumbers.length > 0) {
      const chunks = chunkPages(loadSourcePages(id, range.pageFrom, range.pageTo));
      const questions = chunks.reduce((sum, c) => sum + questionTarget(c, range.questionsPerPage), 0);
      const chars = chunks.reduce((sum, c) => sum + c.charCount, 0);
      estimate = {
        sections: chunks.length,
        usablePages: new Set(chunks.flatMap((c) => c.pages.map((p) => p.pageNumber))).size,
        questions,
        costUsd: estimateRunCostUsd(chars, questions, setup.generationModel, setup.checkModel),
      };
    }

    return NextResponse.json({
      configured: setup.configured,
      unavailableReason: setup.unavailableReason,
      provider: setup.provider?.name ?? null,
      generationModel: setup.generationModel,
      checkModel: setup.checkModel,
      maxUsdPerRun: setup.maxUsdPerRun,
      maxUsdPerDay: setup.maxUsdPerDay,
      dailyRemainingUsd: GenerationQueue.dailyRemainingUsd(),
      pages: { first: firstPage, last: lastPage, count: pageNumbers.length },
      rangeError: typeof range === "string" ? range : null,
      estimate,
      run: GenerationQueue.getSummary(id, document.metadata),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load generation status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Starts a generation run for the chosen page range. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "User session required" }, { status: 401 });

    const { id } = await props.params;
    const document = DocumentRepository.findById(id, user.id);
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const block = GenerationQueue.checkCanStart(id);
    if (block) return NextResponse.json({ error: block.error }, { status: block.status });

    const pageNumbers = DocumentRepository.getPages(id).map((p) => p.page_number);
    if (pageNumbers.length === 0) {
      return NextResponse.json({ error: "This document has no readable pages yet" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const range = parseRange(body ?? {}, Math.min(...pageNumbers), Math.max(...pageNumbers));
    if (typeof range === "string") return NextResponse.json({ error: range }, { status: 400 });

    const context = document.preparation_context_id
      ? PreparationContextRepository.findById(document.preparation_context_id, user.id)
      : null;

    const refused = GenerationQueue.start({
      documentId: id,
      userId: user.id,
      preparationContextId: document.preparation_context_id,
      // Only the exam name (e.g. "ISRO JPA") goes to the model — never the user's name,
      // their context label or the file name.
      examName: context?.exam_name?.trim().slice(0, 80) || null,
      ...range,
    });
    if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });

    return NextResponse.json({ run: GenerationQueue.getSummary(id, null) }, { status: 202 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
