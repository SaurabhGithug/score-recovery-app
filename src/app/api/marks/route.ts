import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { getMark, listMarks, setMark } from "@/lib/server/marks";
import { logActivity } from "@/lib/server/activity";

/** GET ?kind=&id= → { mark } for one question; GET with no params → { marks } (the marked list). */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const params = new URL(req.url).searchParams;
    if (params.has("kind") || params.has("id")) return jsonOk({ mark: await getMark(user.id, params.get("kind"), params.get("id")) });
    return jsonOk({ marks: await listMarks(user.id) });
  });
}

/** PUT { kind, id, level: "revise" | "important" | "super_important" | null, note? } → { mark } (null once cleared). */
export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = (await readJsonBody(req, 8_000)) as Record<string, unknown>;
    const mark = await setMark(user.id, { kind: body.kind, id: body.id, level: body.level, note: body.note });
    // setMark has already checked kind and id.
    await logActivity(req, user.id, mark ? "mark.set" : "mark.clear", { kind: body.kind === "bank" ? "bank" : "made_easy", id: String(body.id) }, mark ? { level: mark.level, note: mark.note !== "" } : {});
    return jsonOk({ mark });
  });
}
