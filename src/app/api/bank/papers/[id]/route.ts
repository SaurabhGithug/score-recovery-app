import { paperDetail } from "@/lib/server/bank/attempts";
import { handle, HttpError, jsonOk, requireUser, validId } from "@/lib/server/bank/http";

/** GET /api/bank/papers/[id] → BankPaperDetail. Never contains keys, evidence, solutions or explanations. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    if (!validId(id)) throw new HttpError(404, "Paper not found.");
    return jsonOk(await paperDetail(id, user.id));
  });
}
