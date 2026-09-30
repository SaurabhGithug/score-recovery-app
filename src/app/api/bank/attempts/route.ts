import { startAttempt } from "@/lib/server/bank/attempts";
import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";

/** POST /api/bank/attempts { paperId, mode, section? } → { attempt: BankAttempt } */
export async function POST(req: Request) {
  return handle(async () => {
    const user = requireUser(req);
    const body = await readJsonBody(req, 16 * 1024);
    return jsonOk({ attempt: startAttempt(user.id, body) }, 201);
  });
}
