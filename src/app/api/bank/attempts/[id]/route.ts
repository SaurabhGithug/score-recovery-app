import { autosave, getAttempt } from "@/lib/server/bank/attempts";
import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";

const MAX_RESPONSES_BYTES = 512 * 1024;

/** GET /api/bank/attempts/[id] → { attempt, responses, result | null } (own attempts only; 404 otherwise). */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = requireUser(req);
    const { id } = await props.params;
    return jsonOk(getAttempt(id, user.id));
  });
}

/** PUT /api/bank/attempts/[id] { responses } → { ok: true } (autosave, before submit only). */
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = requireUser(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, MAX_RESPONSES_BYTES);
    autosave(id, user.id, body);
    return jsonOk({ ok: true });
  });
}
