import { after } from "next/server";
import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { requireSameSite } from "@/lib/server/standards/same-site";
import { askStandard, waitForStandardChecks } from "@/lib/server/standards/tutor";

/** A grounded lesson or answer takes up to a minute, and the second AI's check runs after the reply. */
export const maxDuration = 300;

/**
 * POST /api/standards/<id>/ask { message, history?, clauseNo?, lang? } → TutorAnswer (AI-generated, Google Search grounded).
 * 401 signed out · 403 cross-site · 404 not yours · 429 daily AI limit · 502 model failed · 503 AI not set up.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  // Keep the instance alive until the background check is stored (Vercel ends work after the reply otherwise).
  after(() => waitForStandardChecks());
  return handle(async () => {
    const user = await requireUser(req);
    requireSameSite(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, 96 * 1024);
    if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
    return jsonOk(await askStandard(user.id, { standardId: id, message: body.message, history: body.history, clauseNo: body.clauseNo, lang: body.lang }));
  });
}
