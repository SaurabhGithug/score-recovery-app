import { review } from "@/lib/server/bank/attempts";
import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";

/** GET /api/bank/attempts/[id]/review → BankReview (409 before submit). */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = requireUser(req);
    const { id } = await props.params;
    return jsonOk(review(id, user.id));
  });
}
