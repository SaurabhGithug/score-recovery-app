import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { studyPack } from "@/lib/server/followup/followup";

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
    return jsonOk(await studyPack(user.id, { kind: body.kind, id: body.id, generate: body.generate }));
  });
}
