import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getCurrentUser } from "@/lib/server/auth";
import { DocumentRepository } from "@/lib/server/repositories/document-repo";

/**
 * GET /api/documents/[id]/crop/[cropName] → a page/question image of one of the learner's own
 * uploads. Signed-in only; the document must belong to the learner, and the crop must be one of
 * that document's (crop files are named "<documentId>_…"). Private uploads are never cached publicly.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string; cropName: string }> }) {
  try {
    const user = getCurrentUser(req);
    if (!user) return new NextResponse("Sign in required", { status: 401 });
    const { id, cropName } = await props.params;
    const safeCropName = path.basename(cropName);
    if (!DocumentRepository.findById(id, user.id) || !safeCropName.startsWith(`${id}_`) || !safeCropName.endsWith(".png")) {
      return new NextResponse("Image not found", { status: 404 });
    }
    const cropPath = path.join(path.resolve(process.cwd(), "data", "storage", "crops"), safeCropName);
    if (!fs.existsSync(cropPath)) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const fileBuffer = await fs.promises.readFile(cropPath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Error reading image", { status: 500 });
  }
}
