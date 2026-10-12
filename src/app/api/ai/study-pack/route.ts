import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { studyPack } from "@/lib/server/followup/followup";
import { logActivity } from "@/lib/server/activity";

/**
 * POST /api/ai/study-pack { kind: "made_easy" | "bank", id, generate?: boolean } → { pack, pending, error }
 * The AI study pack for a question the learner has answered: its SSC JE syllabus topic (from the
 * previous-year papers), scope, exam points and cross-checked practice questions. Without
 * `generate` only a stored pack is returned (free); with it, a missing pack starts being made in
 * the background (paid) and `pending` is true: ask again without `generate` until it arrives.
 * Same errors as /api/ai/follow-up.
 */
function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // "null" or malformed Origin
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && !sameHost(origin, host)) throw new HttpError(403, "Ask from within the app.");
    const body = await readJsonBody(req, 4 * 1024);
    if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
    const pack = await studyPack(user.id, { kind: body.kind, id: body.id, generate: body.generate });
    // Logged when the learner asks for the notes, not on the background checks that follow.
    if (body.generate === true) await logActivity(req, user.id, "ai.studypack.open", { kind: body.kind === "bank" ? "bank" : "made_easy", id: String(body.id) });
    return jsonOk(pack);
  });
}
