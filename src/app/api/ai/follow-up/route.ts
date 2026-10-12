import { handle, HttpError, isRecord, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { askFollowUp } from "@/lib/server/followup/followup";
import { logActivity } from "@/lib/server/activity";

/**
 * POST /api/ai/follow-up { kind: "made_easy" | "bank", id, message, history? } → FollowUpAnswer
 * An AI-generated answer to the learner's follow-up question about a question they have already
 * answered. Google Gemini (with Google Search) by default; FOLLOWUP_PROVIDER=deepseek switches.
 * 401 signed out · 403 not answered yet / another account's data / cross-site · 404 unknown
 * question · 429 daily AI limit · 502 the model failed · 503 AI not set up.
 */
function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // "null" or malformed Origin
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    // Same-site only. Compared by host: behind an HTTPS tunnel req.url can say http while Origin says https.
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && !sameHost(origin, host)) throw new HttpError(403, "Ask from within the app.");
    const body = await readJsonBody(req, 64 * 1024);
    if (!isRecord(body)) throw new HttpError(400, "A JSON object is required.");
    const answer = await askFollowUp(user.id, { kind: body.kind, id: body.id, message: body.message, history: body.history });
    // askFollowUp has already checked kind, id and message.
    await logActivity(req, user.id, "ai.followup.ask", { kind: body.kind === "bank" ? "bank" : "made_easy", id: String(body.id) }, { question: String(body.message) });
    return jsonOk(answer);
  });
}
