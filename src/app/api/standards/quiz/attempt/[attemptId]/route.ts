import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { requireSameSite } from "@/lib/server/standards/same-site";
import { quizService } from "@/lib/server/standards/quiz";

/** GET /api/standards/quiz/attempt/<id> → AttemptView while running (resume), ResultView once finished or out of time. Owner only (404 otherwise). */
export async function GET(req: Request, props: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { attemptId } = await props.params;
    return jsonOk(await quizService.get(user.id, attemptId));
  });
}

/**
 * POST /api/standards/quiz/attempt/<id>
 *   { action: "save", responses } → { saved, serverNow } (409 once submitted, or after the deadline's grace period)
 *   { action: "submit", responses?, auto? } → ResultView (idempotent)
 * Body at most 64 KB.
 */
export async function POST(req: Request, props: { params: Promise<{ attemptId: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    requireSameSite(req);
    const { attemptId } = await props.params;
    const body = await readJsonBody(req, 64 * 1024);
    if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
    if (body.action === "save") return jsonOk(await quizService.save(user.id, attemptId, body));
    if (body.action === "submit") return jsonOk(await quizService.submit(user.id, attemptId, body));
    throw new HttpError(400, 'action must be "save" or "submit".');
  });
}
