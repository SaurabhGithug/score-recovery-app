import type { BankPaperCode, BankPaperKind } from "@/lib/bank/api-types";
import { listPapers } from "@/lib/server/bank/attempts";
import { handle, HttpError, jsonOk, requireUser } from "@/lib/server/bank/http";

/** GET /api/bank/papers?kind=pyp|mock&paper=P1|P2 → { papers: BankPaperSummary[] } */
export async function GET(req: Request) {
  return handle(() => {
    const user = requireUser(req);
    const params = new URL(req.url).searchParams;
    const kind = params.get("kind");
    const paper = params.get("paper");
    if (kind !== null && kind !== "pyp" && kind !== "mock") throw new HttpError(400, 'kind must be "pyp" or "mock".');
    if (paper !== null && paper !== "P1" && paper !== "P2") throw new HttpError(400, 'paper must be "P1" or "P2".');
    return jsonOk({
      papers: listPapers(user.id, {
        kind: (kind ?? undefined) as BankPaperKind | undefined,
        paper: (paper ?? undefined) as BankPaperCode | undefined,
      }),
    });
  });
}
