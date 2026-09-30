// Run with: npx tsx scripts/import-question-concepts.mjs <file.json> [--cycle 2026] [--replace] [--dry-run]
// Imports question → syllabus-node suggestions (e.g. subject/topic tags proposed by a model) into
// question_concepts. The file is a JSON array of
//   {"questionId": "...", "nodeId": "SSC_JE:2026:subject:...", "role": "primary"|"secondary",
//    "origin": "ai_suggested", "confidence": 0.82, "method": "deepseek-v4 subject tagger v1",
//    "model": "optional model id"}
// All-or-nothing: the whole file is validated first and nothing is written if any row fails.
// Rejected: unknown question/node ids, nodes outside the cycle, part-level nodes (parts come only
// from the printed paper section), nodes outside the question's own part (GI&R / GA / Civil never
// mix), origin "source", unknown fields, and more than one primary per question per level (in the
// file or against stored rows). Every imported row is stored with review_status "needs_review".
// --replace: first drop this file's questions' earlier unreviewed ai_suggested/keyword rows.
// Idempotent: importing the same file twice leaves the same rows.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--cycle");
if (!file) {
  console.error("usage: npx tsx scripts/import-question-concepts.mjs <file.json> [--cycle 2026] [--replace] [--dry-run]");
  process.exit(2);
}
const cycleArg = args.includes("--cycle") ? args[args.indexOf("--cycle") + 1] : "2026";
const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
process.chdir(process.env.SYLLABUS_DB_ROOT ?? repoRoot);

const { SyllabusRepository } = await import("../src/lib/server/repositories/syllabus-repo.ts");
const result = SyllabusRepository.importQuestionConcepts(raw, {
  cycleId: `SSC_JE:${cycleArg}`,
  replaceSuggestions: args.includes("--replace"),
  dryRun: args.includes("--dry-run"),
});
if (!result.ok) {
  console.error(`Rejected — nothing written. ${result.problems.length} problem(s):\n- ${result.problems.slice(0, 50).join("\n- ")}`);
  process.exit(1);
}
console.log(args.includes("--dry-run") ? `Valid: ${Array.isArray(raw) ? raw.length : 0} row(s) would be written.` : `Imported ${result.written} row(s); replaced ${result.replaced} earlier suggestion(s).`);
