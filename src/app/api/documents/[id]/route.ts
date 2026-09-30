import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { DocumentRepository } from "@/lib/server/repositories/document-repo";
import { QuestionRepository } from "@/lib/server/repositories/question-repo";
import { documentStorage } from "@/lib/server/storage/document-storage";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id } = await props.params;
    const document = DocumentRepository.findById(id, user.id);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const pages = DocumentRepository.getPages(id);
    const questions = QuestionRepository.listByDocumentId(id, user.id);

    return NextResponse.json({
      document,
      pages,
      questions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id } = await props.params;
    const document = DocumentRepository.findById(id, user.id);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.storage_path) {
      await documentStorage.deleteFile(document.storage_path).catch(() => {});
    }

    DocumentRepository.delete(id, user.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
