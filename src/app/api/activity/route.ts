import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { activityOverview, recordClientEvents } from "@/lib/server/activity";

/** GET → the signed-in learner's own activity log and Made Easy coverage. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    return jsonOk(await activityOverview(user.id));
  });
}

/** POST { events: [...] } → { saved } — UI-only events from this learner's browser. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJsonBody(req, 32 * 1024);
    return jsonOk({ saved: await recordClientEvents(req, user.id, body) });
  });
}
