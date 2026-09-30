import { submit } from "@/lib/server/bank/attempts";
import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";

/** POST /api/bank/attempts/[id]/submit { responses } → { result: BankAttemptResult } */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, 512 * 1024);
    return jsonOk({ result: await submit(id, user.id, body) });
  });
}
