import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { documentStorage } from "@/lib/server/storage/document-storage";
import { DocumentRepository } from "@/lib/server/repositories/document-repo";
import { ProcessingQueue } from "@/lib/server/jobs/processing-queue";
import path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const contextId = req.nextUrl.searchParams.get("contextId") || req.headers.get("x-context-id") || null;
    const documents = await DocumentRepository.listByUserId(user.id, contextId);
    return NextResponse.json({ documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DOCUMENT_PARSER !== "true") {
      return NextResponse.json(
        { error: "Online document parsing is disabled. Import prepared content from the offline workspace." },
        { status: 410 }
      );
    }
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User profile required before uploading" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const contextId = (formData.get("contextId") as string) || req.headers.get("x-context-id") || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const originalName = file.name;
    const ext = path.extname(originalName).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          error: `Unsupported file type '${ext}'. Please upload PDF, Word, PowerPoint, Excel, or Image files.`,
        },
        { status: 400 }
      );
    }

    // Size limit check (max 50 MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds maximum allowed limit of 50 MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = `${user.id}_${Date.now()}_${originalName}`;
    const storagePath = await documentStorage.saveFile(storageKey, buffer, file.type || "application/octet-stream");

    // Create StudyDocument in database with preparationContextId
    const docRecord = await DocumentRepository.create({
      userId: user.id,
      preparationContextId: contextId,
      originalName,
      mimeType: file.type || "application/octet-stream",
      storagePath,
      fileSizeBytes: file.size,
    });

    // Enqueue background processing job with context
    await ProcessingQueue.enqueueDocument(docRecord.id, user.id, storagePath, contextId);

    return NextResponse.json({
      documentId: docRecord.id,
      document: docRecord,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
