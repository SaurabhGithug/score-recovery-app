import { check } from "@/lib/server/bank/attempts";
import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";

/**
 * POST /api/bank/attempts/[id]/check { questionId, answer } → BankCheckResult
 * Practice mode only: locks the answer, then reveals that one question's key.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, 16 * 1024);
    return jsonOk(await check(id, user.id, body));
  });
}
