import { handle, HttpError, jsonOk, requireUser } from "@/lib/server/bank/http";
import { canReadMadeEasy, madeEasyOverview } from "@/lib/server/made-easy";

/**
 * GET /api/made-easy → MadeEasyOverview: the imported Made Easy tests with their results.
 * Only the account the import belongs to may read it (403 for anyone else, 401 signed out).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    if (!canReadMadeEasy(user.id)) throw new HttpError(403, "These Made Easy results belong to another account.");
    return jsonOk(madeEasyOverview());
  });
}
