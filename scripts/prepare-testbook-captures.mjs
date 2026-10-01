// Prepare checked, private Testbook captures for the existing bank importer.
// Run: node_modules/.bin/tsx scripts/prepare-testbook-captures.mjs [--import-local]
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const captureDir = path.join(root, "data/testbook-captures");
const output = path.join(root, "data/testbook-prepared/captured-tests.json");
const inventory = JSON.parse(fs.readFileSync(path.join(captureDir, "_inventory.json"), "utf8"));
const listed = new Map(inventory.categories.flatMap((category) =>
  category.tests.map((test) => [test.url.split("/").at(-1), { ...test, category: category.name }])
));

function assets(part) {
  return [...new Set((part?.images ?? []).map((image) => image.url).filter((url) =>
    typeof url === "string" && url.startsWith("https://")
  ))];
}

function originalResult(text) {
  const status = text?.match(/Question No\.\d+\s*(Correct|Incorrect|Skipped|Unattempted|Partially Correct)/i)?.[1]?.toLowerCase();
  if (status === "correct" || status === "incorrect") return status;
  if (status === "skipped" || status === "unattempted") return "unattempted";
  if (status === "partially correct") return "partial";
  return "unknown";
}

function sectionAt(raw, index, total) {
  if (raw.section) return raw.section;
  if (total === 100) return "General Engineering (Civil)";
  if (total === 200) {
    if (index < 50) return "General Intelligence and Reasoning";
    if (index < 100) return "General Awareness";
    return "General Engineering (Civil)";
  }
  throw new Error(`Missing source section for ${raw.id}`);
}

function prepare(id, capture) {
  const entry = listed.get(id);
  if (!entry) throw new Error(`Test ${id} is absent from the checked catalogue`);
  if (capture.questions.length !== capture.expected) throw new Error(`Incomplete test ${id}`);
  const seen = new Set();
  const questions = capture.questions.map((raw, index) => {
    if (!raw.id || seen.has(raw.id)) throw new Error(`Duplicate or missing question ID in ${id}`);
    seen.add(raw.id);
    const stem = raw.stem ?? raw.question;
    const answer = raw.options?.find((option) => option.correct);
    if (!stem?.text || raw.options?.length !== 4 || raw.options.filter((option) => option.correct).length !== 1 || !raw.solution?.text) {
      throw new Error(`Incomplete question ${index + 1} in ${id}`);
    }
    const section = sectionAt(raw, index, capture.questions.length);
    return {
      id: raw.id,
      globalNumber: index + 1,
      section,
      sectionQuestion: Number(raw.number) || index + 1,
      questionText: stem.text,
      questionHtml: stem.html ?? stem.text,
      questionAssets: assets(stem),
      options: raw.options.map((option) => ({
        id: option.id,
        text: option.text,
        html: option.html ?? option.text,
        assets: assets(option),
      })),
      originalResult: originalResult(raw.analysisText),
      marksText: raw.analysisText?.match(/Marks\s*(-?\d+(?:\.\d+)?)/i)?.[1] ?? "",
      syllabusTopic: null,
      topicEvidence: "pending",
      evidenceState: "portal_verified",
      portalSolution: {
        correctOption: answer.id,
        html: raw.solution.html ?? raw.solution.text,
        text: raw.solution.text,
        assets: assets(raw.solution),
        evidenceText: `Answer ${answer.id}; solution captured from the authenticated Testbook solution page.`,
      },
    };
  });
  const groups = new Map();
  const summary = { correct: 0, incorrect: 0, unattempted: 0, partial: 0, unknown: 0 };
  for (const question of questions) {
    groups.set(question.section, (groups.get(question.section) ?? 0) + 1);
    summary[question.originalResult] += 1;
  }
  const scoreMatch = entry.status.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*Marks/i);
  return {
    id,
    title: capture.questions[0].title?.trim() || entry.title,
    score: scoreMatch ? Number(scoreMatch[1]) : 0,
    maxScore: scoreMatch ? Number(scoreMatch[2]) : capture.expected,
    attemptNumber: 1,
    questionCount: questions.length,
    sections: [...groups].map(([name, questionCount]) => ({ name, questionCount })),
    summary,
    questions,
  };
}

const files = fs.readdirSync(captureDir).filter((file) => file.endsWith("-solutions.json")).sort();
const tests = files.map((file) => {
  const id = file.slice(0, -"-solutions.json".length);
  return prepare(id, JSON.parse(fs.readFileSync(path.join(captureDir, file), "utf8")));
});
const bundle = {
  schemaVersion: 1,
  source: {
    provider: "Testbook",
    exam: "SSC JE",
    branch: "Civil Engineering",
    series: "SSC JE Civil 2026 Mock Test (Paper 1 & Paper 2)",
    capturedOn: "2026-10-01",
    sourceUrl: "https://testbook.com/ssc-je-ce/test-series/my",
    attemptLabel: `${tests.length} completed Testbook captures`,
    integrityPolicy: "Only question IDs, answers and explanations seen on the signed-in solution pages are imported; missing result statuses remain unknown.",
  },
  catalogue: {
    observedTotalTests: 1027,
    observedProgress: "39/1027",
    categories: inventory.categories.map((category) => ({ name: category.name, observedCount: category.tests.length })),
    warning: "Catalogue listings are not question captures; each imported test passed full question and key checks.",
  },
  tests,
};

const { parseTestbookImport } = await import("../src/lib/testbook.ts");
parseTestbookImport(bundle);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(bundle, null, 2) + "\n");
console.log(JSON.stringify({ prepared: output, tests: tests.length, questions: tests.reduce((n, test) => n + test.questionCount, 0), unknownResults: tests.reduce((n, test) => n + test.summary.unknown, 0) }));

if (process.argv.includes("--import-local")) {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.SCORE_RECOVERY_DATA_DIR) {
    throw new Error("Refusing import because this process is not using the default local SQLite database");
  }
  const local = new DatabaseSync(path.join(root, "data/score_recovery.db"), { readOnly: true });
  const reema = local.prepare("SELECT id FROM users WHERE normalized_name = ? ORDER BY created_at LIMIT 1").get("reema");
  local.close();
  if (!reema?.id) throw new Error("Reema profile was not found in local SQLite");
  const { importTestbook } = await import("../src/lib/server/bank/import-testbook.ts");
  const result = await importTestbook(bundle, reema.id);
  console.log(JSON.stringify({ localImport: result }));
}
