import { ExplainQueue } from "@/lib/server/bank/explain";
import { handle, HttpError, jsonOk, readJsonBody, requireUser, validId } from "@/lib/server/bank/http";

/**
 * POST /api/bank/papers/[id]/explain { limit?: number } → 202 { job: ExplainJobProgress }
 *   Starts a background run over the paper (global evidence only): blind solve, re-resolve,
 *   teaching note. One run at a time server-wide (409), 503 when AI is not configured, 429 when
 *   the 24-hour spending limit is used up.
 * GET  /api/bank/papers/[id]/explain[?job=<id>] → { job: ExplainJobProgress } (404 when none).
 * Progress holds counts and reasons only, never a key.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    let limit: number | undefined;
    if (req.headers.get("content-length") !== "0" && req.body) {
      const body = await readJsonBody(req, 1024).catch((err) => {
        if (err instanceof HttpError && err.message === "A JSON body is required.") return {};
        throw err;
      });
      const raw = (body as Record<string, unknown> | null)?.limit;
      if (raw !== undefined) {
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 1000) {
          throw new HttpError(400, "limit must be a whole number from 1 to 1000.");
        }
        limit = raw;
      }
    }
    return jsonOk({ job: await ExplainQueue.start(id, user.id, { limit }) }, 202);
  });
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser(req);
    const { id } = await props.params;
    if (!validId(id)) throw new HttpError(404, "Paper not found.");
    const job = ExplainQueue.get(id, new URL(req.url).searchParams.get("job"));
    if (!job) throw new HttpError(404, "No explanation run for this paper since the server started.");
    return jsonOk({ job });
  });
}
