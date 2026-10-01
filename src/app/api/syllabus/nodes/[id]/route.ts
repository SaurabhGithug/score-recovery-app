import { getCurrentUser } from "@/lib/server/auth";
import { handle, HttpError, jsonOk, validId } from "@/lib/server/bank/http";
import { SyllabusRepository } from "@/lib/server/repositories/syllabus-repo";

/**
 * GET /api/syllabus/nodes/[id] → SyllabusNodeDetail: the node with its ancestors, official text
 * and citation, relations, linked formulas (with gaps), theory notes, worked examples (without
 * answers) and PYP question counts by paper/year. Never contains answer keys.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser(req);
    if (!user) throw new HttpError(401, "Sign in to view the syllabus.");
    const { id } = await props.params;
    let decoded: string;
    try {
      decoded = decodeURIComponent(id);
    } catch {
      throw new HttpError(404, "Syllabus node not found.");
    }
    if (!validId(decoded)) throw new HttpError(404, "Syllabus node not found.");
    const detail = await SyllabusRepository.nodeDetail(decoded, user.id);
    if (!detail) throw new HttpError(404, "Syllabus node not found.");
    return jsonOk(detail);
  });
}
