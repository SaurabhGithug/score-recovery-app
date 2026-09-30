import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { answerCheck } from "@/lib/server/followup/followup";

function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // "null" or malformed Origin
  }
}

/**
 * POST /api/ai/follow-up/check { id } → AnswerCheck
 * The second AI's check of a follow-up answer (status pending → done | failed). Only the learner
 * who asked can read it; checks are kept in memory for an hour. 401 · 403 cross-site · 404.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && !sameHost(origin, host)) throw new HttpError(403, "Ask from within the app.");
    const body = await readJsonBody(req, 1024);
    if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
    return jsonOk(answerCheck(user.id, body.id));
  });
}
