import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";
import { StandardsRepository } from "@/lib/server/standards/repo";

/** GET /api/standards → the signed-in account's standards (private to their owner). */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const rows = await StandardsRepository.listForUser(user.id);
    return jsonOk({
      standards: rows.map((s) => ({ id: s.id, code: s.code, title: s.title, source_name: s.source_name, clauses: Number(s.clauses), lessons: Number(s.lessons) })),
    });
  });
}
