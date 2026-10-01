import { handle, jsonOk, requireUser, HttpError, validId } from "@/lib/server/bank/http";
import { topicAnalysis } from "@/lib/server/repositories/topic-analysis";
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    if (!validId(id)) throw new HttpError(404, "Topic not found.");
    const page = Number(new URL(req.url).searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, "Invalid page.");
    return jsonOk(await topicAnalysis(user.id, id, page));
  });
}
