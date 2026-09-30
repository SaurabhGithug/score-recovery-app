import type { BankAiStatus } from "@/lib/bank/api-types";
import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";
import { getLlmSetup } from "@/lib/server/llm";

/** GET /api/bank/ai-status → BankAiStatus. Reports only whether AI is set up, never the key. */
export async function GET(req: Request) {
  return handle(() => {
    requireUser(req);
    const setup = getLlmSetup();
    const status: BankAiStatus = { configured: setup.configured, reason: setup.configured ? null : setup.unavailableReason };
    return jsonOk(status);
  });
}
