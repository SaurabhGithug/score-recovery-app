import { explainForLearner } from "@/lib/server/bank/explain";
import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";

/**
 * POST /api/bank/questions/[id]/explain → { explanation: BankExplanation }
 * The note shows the key, so it opens only once this learner has submitted the question or
 * checked it in practice (403 before that). Uses this learner's own evidence for the key.
 * 401 signed out · 404 unknown question · 503 AI not configured · 409 no scored key (including
 * when the blind solve just disputed a single-source key) · 422 needs its figure/clean text ·
 * 429 spending limit reached · 502 the model failed or its note failed the check.
 * A fresh stored note is returned without calling the model.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    return jsonOk(await explainForLearner(id, user.id));
  });
}
