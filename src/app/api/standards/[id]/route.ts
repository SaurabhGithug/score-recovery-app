import { handle, HttpError, jsonOk, requireUser } from "@/lib/server/bank/http";
import { StandardsRepository } from "@/lib/server/standards/repo";
import { storedLessons } from "@/lib/server/standards/tutor";

/** GET /api/standards/<id>?lang=en|hi → the standard's verbatim clauses and the lessons already made. Owner only (404 otherwise). */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await props.params;
    const standard = await StandardsRepository.find(id, user.id);
    if (!standard) throw new HttpError(404, "No such standard.");
    const lang = new URL(req.url).searchParams.get("lang") === "hi" ? "hi" : "en";
    return jsonOk({
      standard: { id: standard.id, code: standard.code, title: standard.title, source_name: standard.source_name },
      clauses: await StandardsRepository.clauses(id),
      lessons: await storedLessons(user.id, id, lang),
    });
  });
}
