import { resolveDispute } from "@/lib/server/bank/attempts";
import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";

/**
 * POST /api/bank/questions/[id]/resolve { answer: string | null, note?: string } → { key: BankKeyView }
 * Only while the question is disputed for this learner; stored as their own human_review row.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = requireUser(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, 16 * 1024);
    return jsonOk(resolveDispute(id, user.id, body));
  });
}
