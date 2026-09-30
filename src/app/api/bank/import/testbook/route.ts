import { handle, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { importTestbook } from "@/lib/server/bank/import-testbook";

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/**
 * POST /api/bank/import/testbook (TestbookImport JSON) → BankTestbookImportResult (400 when the file is invalid).
 * The imported papers and their keys are private to the signed-in learner.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJsonBody(req, MAX_IMPORT_BYTES);
    return jsonOk(await importTestbook(body, user.id));
  });
}
