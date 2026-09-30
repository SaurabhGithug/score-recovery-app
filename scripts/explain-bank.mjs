// Run with: npx tsx scripts/explain-bank.mjs --paper <paperId> [--limit N] [--dry-run] [--json]
// Blind-solves and explains one question-bank paper (DECISION-002) with the same code as
// POST /api/bank/papers/[id]/explain, against data/score_recovery.db and the AI settings in
// .env.local. Global evidence only. Every billed call is recorded in llm_spend, and the run stops
// at GENERATION_MAX_USD_PER_RUN or the rolling GENERATION_MAX_USD_PER_DAY, whichever comes first.
// --dry-run calls no model: it lists what would be sent or skipped and estimates the cost.
//
// Note: this is a separate process, so the server's "one run at a time" slot does not see it.
// Don't start a batch from the UI while this is running (the daily limit still bounds spend).
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot); // getDatabase() resolves data/ from cwd
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: getLlmSetup() reports what is missing
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const paperId = flag("--paper");
const limitRaw = flag("--limit");
const limit = limitRaw === undefined ? undefined : Number(limitRaw);
const dryRun = args.includes("--dry-run");
const asJson = args.includes("--json");

if (!paperId || (limit !== undefined && (!Number.isInteger(limit) || limit < 1))) {
  console.error("Usage: npx tsx scripts/explain-bank.mjs --paper <paperId> [--limit N] [--dry-run] [--json]");
  process.exit(2);
}

const { BankRepository } = await import("../src/lib/server/repositories/bank-repo.ts");
const { getLlmSetup } = await import("../src/lib/server/llm/index.ts");
const { runExplainBatch, planPaper, estimateQuestionCostUsd, depsFromSetup } = await import("../src/lib/server/bank/explain.ts");

const paper = BankRepository.getPaper(paperId);
if (!paper) {
  console.error(`Paper not found: ${paperId}`);
  process.exit(1);
}

if (dryRun) {
  const setup = getLlmSetup();
  const plan = planPaper(paperId, limit);
  const byId = new Map(BankRepository.listQuestions(paperId).map((q) => [q.id, q]));
  const toSend = plan.filter((p) => p.action === "send");
  const cost = toSend.reduce(
    (sum, p) => {
      const e = estimateQuestionCostUsd(byId.get(p.questionId), setup.checkModel, setup.generationModel);
      return { offPeak: sum.offPeak + e.offPeak, peak: sum.peak + e.peak };
    },
    { offPeak: 0, peak: 0 }
  );
  const counts = {};
  for (const p of plan) counts[p.action] = (counts[p.action] ?? 0) + 1;
  const out = {
    paperId,
    title: paper.title,
    configured: setup.configured,
    unavailableReason: setup.unavailableReason,
    models: { blindSolve: setup.checkModel, teachingNote: setup.generationModel },
    counts,
    estimatedUsd: { offPeak: Number(cost.offPeak.toFixed(4)), peak: Number(cost.peak.toFixed(4)) },
    limits: { perRun: setup.maxUsdPerRun, perDay: setup.maxUsdPerDay },
    plan,
  };
  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${paper.title} (${paperId}) — dry run, no model called`);
    console.log(`Models: blind solve ${setup.checkModel}, teaching note ${setup.generationModel}${setup.configured ? "" : `  [not configured: ${setup.unavailableReason}]`}`);
    for (const [action, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(4)}  ${action}`);
    console.log(`Estimated cost for ${toSend.length} question(s): $${out.estimatedUsd.offPeak} off-peak, $${out.estimatedUsd.peak} peak (limits: $${setup.maxUsdPerRun}/run, $${setup.maxUsdPerDay}/24h)`);
  }
  process.exit(0);
}

let deps;
try {
  deps = depsFromSetup("cli");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

let lastPrinted = -1;
const report = await runExplainBatch(paperId, deps, {
  limit,
  onUpdate: (p) => {
    if (asJson || p.done === lastPrinted) return;
    lastPrinted = p.done;
    process.stdout.write(`\r${p.done}/${p.total} done · ${p.explained} explained · $${p.spentUsd.toFixed(4)} spent   `);
  },
});

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n${report.state}: ${report.message ?? ""}`);
  console.log(`Explained ${report.explained}/${report.total} · disputed by AI ${report.disputedByAi} · AI dissent on scored keys ${report.aiDissent} · blind solve gave nothing ${report.blindSolveNoAnswer} · spent $${report.spentUsd.toFixed(4)}`);
  for (const [reason, n] of Object.entries(report.skipped)) console.log(`  skipped ×${n}  ${reason}`);
  for (const p of report.problems) console.log(`  Q${p.position}: ${p.reason}`);
}
process.exit(report.state === "done" ? 0 : 1);
