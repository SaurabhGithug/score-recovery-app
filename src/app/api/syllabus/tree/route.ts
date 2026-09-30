import { getCurrentUser } from "@/lib/server/auth";
import { handle, HttpError, jsonOk } from "@/lib/server/bank/http";
import { SyllabusRepository } from "@/lib/server/repositories/syllabus-repo";
import { EXAM_ID } from "@/lib/syllabus/seed-builder";

/**
 * GET /api/syllabus/tree?cycle=2026 → SyllabusTreeResponse: the cycle's node tree with
 * official/editorial and review badges, citations, and per-node counts of this learner's visible
 * PYP questions (direct and rolled up). Counts only — no questions, keys or solutions.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser(req);
    if (!user) throw new HttpError(401, "Sign in to view the syllabus.");
    const raw = new URL(req.url).searchParams.get("cycle") ?? "2026";
    if (!/^\d{4}$/.test(raw)) throw new HttpError(400, "cycle must be a four-digit year.");
    const cycle = await SyllabusRepository.getCycleByYear(EXAM_ID, Number(raw));
    if (!cycle) throw new HttpError(404, `No syllabus is stored for the ${raw} cycle.`);
    const tree = await SyllabusRepository.tree(cycle.id, user.id);
    if (!tree) throw new HttpError(404, `No syllabus is stored for the ${raw} cycle.`);
    return jsonOk({ ...tree, cycles: await SyllabusRepository.listCycles(EXAM_ID) });
  });
}
