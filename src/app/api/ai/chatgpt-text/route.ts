import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";
import { questionForChatGpt } from "@/lib/server/followup/followup";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const params = new URL(req.url).searchParams;
    return jsonOk({ text: await questionForChatGpt(user.id, { kind: params.get("kind"), id: params.get("id") }) });
  });
}
