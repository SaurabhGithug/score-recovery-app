import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";
import { askCheck } from "@/lib/server/standards/tutor";

/** GET /api/standards/check?id=<checkId> → the second AI's check of one of this learner's answers. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    return jsonOk(await askCheck(user.id, new URL(req.url).searchParams.get("id")));
  });
}
