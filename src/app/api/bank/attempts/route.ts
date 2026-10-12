import { startAttempt } from "@/lib/server/bank/attempts";
import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { logActivity } from "@/lib/server/activity";

/** POST /api/bank/attempts { paperId, mode, section? } → { attempt: BankAttempt } */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJsonBody(req, 16 * 1024);
    const attempt = await startAttempt(user.id, body);
    await logActivity(req, user.id, "bank.attempt.start", { kind: "bank_paper", id: attempt.paperId }, { attempt: attempt.id, mode: attempt.mode, section: attempt.section ?? null });
    return jsonOk({ attempt }, 201);
  });
}
