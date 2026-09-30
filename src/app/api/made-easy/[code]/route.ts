import { handle, HttpError, jsonOk, requireUser } from "@/lib/server/bank/http";
import { canReadMadeEasy, madeEasyTest } from "@/lib/server/made-easy";

/**
 * GET /api/made-easy/[code] → MadeEasyTestDetail: one test's result and its saved incorrect and
 * unattempted questions, with the portal's answers and explanations (these are the owner's own
 * completed attempts). Owner only: 401 signed out, 403 another account, 404 unknown test.
 */
export async function GET(req: Request, props: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const user = requireUser(req);
    if (!canReadMadeEasy(user.id)) throw new HttpError(403, "These Made Easy results belong to another account.");
    const { code } = await props.params;
    const detail = /^test-\d{1,3}$/.test(code) ? madeEasyTest(code) : null;
    if (!detail) throw new HttpError(404, "No such Made Easy test.");
    return jsonOk(detail);
  });
}
