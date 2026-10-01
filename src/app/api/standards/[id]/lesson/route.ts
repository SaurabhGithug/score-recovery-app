import { after } from "next/server";
import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { requireSameSite } from "@/lib/server/standards/same-site";
import { clauseLesson, waitForStandardChecks } from "@/lib/server/standards/tutor";

/** A grounded lesson or answer takes up to a minute, and the second AI's check runs after the reply. */
export const maxDuration = 300;

/**
 * POST /api/standards/<id>/lesson { clauseNo, regenerate?, lang? } → Lesson (AI-generated, cached per clause).
 * 401 signed out · 403 cross-site · 404 not yours / unknown clause · 429 daily AI limit · 502 model failed · 503 AI not set up.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  // Keep the instance alive until the background check is stored (Vercel ends work after the reply otherwise).
  after(() => waitForStandardChecks());
  return handle(async () => {
    const user = await requireUser(req);
    requireSameSite(req);
    const { id } = await props.params;
    const body = await readJsonBody(req, 4 * 1024);
    if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
    return jsonOk(await clauseLesson(user.id, { standardId: id, clauseNo: body.clauseNo, regenerate: body.regenerate, lang: body.lang }));
  });
}
