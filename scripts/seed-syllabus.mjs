// Run with: npx tsx scripts/seed-syllabus.mjs [--no-tag] [--formulas <file.json>] [--json]
// Seeds the SSC JE Civil syllabus hierarchy (exam → cycles → papers → parts → subjects →
// chapters → topics) from src/lib/syllabus-source-ssc-je-2026.json into data/score_recovery.db,
// then tags every bank question with its official part from the section its paper printed.
// Idempotent: re-running changes nothing unless the source or the bank changed. Never deletes
// syllabus nodes (orphans are reported instead).
//
// --formulas <file.json>: imports a JSON array of formulas (FormulaInput in
// src/lib/syllabus/validate.ts). Every formula needs sourceTitle + exact sourceLocator
// (page/section/clause) + sourceEdition; missing units/assumptions are stored as gaps, never
// filled in. Minimal row:
//   {"id":"f.bending-stress","name":"…","expression":"σ = M·y / I","latex":"\\sigma = \\frac{M y}{I}",
//    "symbols":[{"symbol":"σ","meaning":"bending stress","unit":"N/mm²"}],
//    "sourceTitle":"…","sourceLocator":"p. 123, §4.2","sourceEdition":"…",
//    "links":[{"relation":"uses_formula","direction":"in","otherType":"node","otherId":"SSC_JE:2026:…"}]}
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const formulasFile = flag("--formulas") ? path.resolve(flag("--formulas")) : undefined;
process.chdir(process.env.SYLLABUS_DB_ROOT ?? repoRoot); // getDatabase() resolves data/ from cwd

const { buildSyllabusSeed } = await import("../src/lib/syllabus/seed-builder.ts");
const { validateSeed } = await import("../src/lib/syllabus/validate.ts");
const { SyllabusRepository } = await import("../src/lib/server/repositories/syllabus-repo.ts");

const seed = buildSyllabusSeed();
const problems = validateSeed(seed);
if (problems.length) {
  console.error("Seed validation failed — nothing written:\n- " + problems.join("\n- "));
  process.exit(1);
}
const seedStats = SyllabusRepository.applySeed(seed);
const tagStats = args.includes("--no-tag") ? null : SyllabusRepository.tagPaperLevel();

const formulaReport = [];
if (formulasFile) {
  const rows = JSON.parse(fs.readFileSync(formulasFile, "utf8"));
  if (!Array.isArray(rows)) throw new Error("--formulas file must be a JSON array");
  for (const f of rows) formulaReport.push({ id: f.id, ...SyllabusRepository.upsertFormula(f) });
}

const stats = SyllabusRepository.stats();
if (args.includes("--json")) {
  console.log(JSON.stringify({ seedStats, tagStats, formulaReport, stats }, null, 2));
  process.exit(0);
}
console.log(`Nodes: +${seedStats.nodesInserted} inserted, ${seedStats.nodesUpdated} updated, ${seedStats.nodesUnchanged} unchanged.`);
if (seedStats.orphanNodeIds.length) console.log(`Orphan official nodes (no longer produced; not deleted): ${seedStats.orphanNodeIds.join(", ")}`);
console.log("\nNodes by cycle / kind / origin / review:");
for (const r of stats.nodes) console.log(`  ${r.cycle_id}  ${String(r.kind).padEnd(8)} ${String(r.origin).padEnd(9)} ${String(r.review_status).padEnd(12)} ${r.n}`);
if (tagStats) {
  console.log(`\nPaper-level tagging: ${tagStats.tagged}/${tagStats.questionsSeen} bank questions tagged (${tagStats.bySource} from printed section, ${tagStats.byEditorialPosition} by Paper-I scheme order — needs review); ${tagStats.untagged} untagged; ${tagStats.removedStale} stale rows removed.`);
  for (const [part, n] of Object.entries(tagStats.byPart)) console.log(`  ${part}  ${n}`);
  for (const [section, n] of Object.entries(tagStats.untaggedSections)) console.log(`  untagged section "${section}": ${n}`);
}
console.log("\nQuestion tags by level / origin / method / review:");
for (const r of stats.tags) console.log(`  ${String(r.node_kind).padEnd(8)} ${String(r.origin).padEnd(12)} ${String(r.method).padEnd(26)} ${String(r.review_status).padEnd(12)} ${r.n}`);
for (const f of formulaReport) console.log(`Formula ${f.id}: ${f.gaps.length ? `gaps — ${f.gaps.join("; ")}` : "no gaps"}`);
