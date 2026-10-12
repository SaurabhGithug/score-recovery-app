import type { BankAiStatus } from "@/lib/bank/api-types";
import { handle, jsonOk, requireUser } from "@/lib/server/bank/http";
import { getLlmSetup } from "@/lib/server/llm";
import { codexStatus } from "@/lib/server/llm/codex-provider";

/** GET /api/bank/ai-status → BankAiStatus. Reports only whether AI is set up, never the key. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req);
    const setup = getLlmSetup();
    if (setup.provider?.name === "codex") {
      // ChatGPT through Codex: "set up" means Codex is installed and signed in to a ChatGPT account.
      const codex = await codexStatus();
      return jsonOk({ configured: codex.signedIn, reason: codex.signedIn ? null : codex.message } satisfies BankAiStatus);
    }
    const status: BankAiStatus = { configured: setup.configured, reason: setup.configured ? null : setup.unavailableReason };
    return jsonOk(status);
  });
}
