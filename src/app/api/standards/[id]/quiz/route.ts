import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { requireSameSite } from "@/lib/server/standards/same-site";
import { ActiveAttemptError, quizService } from "@/lib/server/standards/quiz";

/** GET /api/standards/<id>/quiz → QuizOverview (verified question counts, recent attempts, the running one). Owner only (404 otherwise). */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    return jsonOk(await quizService.overview(user.id, id));
  });
}

/**
 * POST /api/standards/<id>/quiz { scope, count, secondsPerQuestion? | limitSeconds? } → 201 AttemptView (no keys).
 * 400 invalid / not enough questions · 401 signed out · 403 cross-site · 404 not yours · 409 { error, activeAttemptId } a test is running.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    requireSameSite(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, 4 * 1024);
    try {
      return jsonOk(await quizService.start(user.id, id, body), 201);
    } catch (err) {
      if (err instanceof ActiveAttemptError) return jsonOk({ error: err.message, activeAttemptId: err.activeAttemptId }, 409);
      throw err;
    }
  });
}
