import { randomUUID } from "node:crypto";
import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { canReadMadeEasy, madeEasyQuestion } from "@/lib/server/made-easy";
import { madeEasyReady } from "@/lib/madeeasy";
import { getDatabase } from "@/lib/server/db";
import { recoveryFingerprint } from "@/lib/server/followup/question-context";
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    if (!canReadMadeEasy(user.id)) throw new HttpError(403, "These questions belong to another account.");
    const body = await readJsonBody(req, 4096);
    if (!isRecord(body) || typeof body.id !== "string" || typeof body.selected !== "string" || !Number.isInteger(body.seconds) || Number(body.seconds) < 0 || Number(body.seconds) > 86400) throw new HttpError(400, "Invalid practice result.");
    const q = madeEasyQuestion(body.id);
    if (!q || !madeEasyReady(q) || !q.options.some(o => o.id === body.selected)) throw new HttpError(400, "Invalid question or option.");
    await getDatabase().prepare("INSERT INTO recovery_practice (id, user_id, question_id, content_fp, correct, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), user.id, q.id, recoveryFingerprint(q), body.selected === q.correctOption ? 1 : 0, body.seconds, new Date().toISOString());
    return jsonOk({ saved: true });
  });
}
