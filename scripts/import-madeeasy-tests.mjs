// Adds the Made Easy tests captured on 2026-10-02 (Tests 6, 7, 8 and 11) to src/lib/madeeasy-import.json.
//
// Questions: data/made-easy-recapture/2026-10-02/test-XX.json, read from each test's solution view
// (the page's Apollo cache) in the owner's own signed-in session in the built-in browser. Only the
// incorrect and unattempted questions were kept, as for the first four tests. Each file must hash to
// the value recorded below: SHA-256 of its canonical JSON (keys sorted), computed in the portal page at
// capture time, so a file that changed after capture is refused.
//
// Summaries: each test's result page (score, rank, percentile, accuracy, time, median) and its cached
// stats (average score, highest score, average accuracy), as shown on 2026-10-02.
//
// Text and completeness follow scripts/merge-madeeasy-recapture.mjs: plain text is derived from the
// portal HTML, and a question whose text or any option is empty (no text and no image) is flagged
// visual_review_required and kept out of practice.
//
//   node --import tsx scripts/import-madeeasy-tests.mjs          (dry run: report only)
//   node --import tsx scripts/import-madeeasy-tests.mjs --write
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const { sourceHtmlToText, sourceHtmlImages } = await import("../src/lib/server/source-html.ts");

const ROOT = path.resolve(import.meta.dirname, "..");
const IMPORT_PATH = path.join(ROOT, "src/lib/madeeasy-import.json");
const DIR = path.join(ROOT, "data/made-easy-recapture/2026-10-02");
const CAPTURED_ON = "2026-10-02";
const write = process.argv.includes("--write");

// Titles drop the portal's "Test N - " prefix (as the first four do). The portal names of Tests 7 and 8
// repeat their last topics ("…Cubes and DiceArrangement of Words…", "…Statement and Conclusions
// Statement and Conclusions )"); the titles here list each topic once. The raw names stay in the files.
const TESTS = [
  {
    code: "test-06", number: 6, sha256: "16091a06759e1f4f053121c927f5ed9fd03effe0562b02231580076cd4797715",
    title: "Directions and Distance Test + Series + Coding and Decoding + Word Formation",
    summary: { score: 30, maxScore: 50, correct: 31, incorrect: 4, unattempted: 15, rank: 4, participants: 11, percentile: 63.64, accuracy: 88, timeMinutes: 30, averageScore: 23.52, highestScore: 33.5, averageAccuracy: 79, medianScore: 25 },
  },
  {
    code: "test-07", number: 7, sha256: "1912d8f523d46852e67ef9a899d0835a80f94b422bb5abff102721859926adbd",
    title: "Completion of Figure + Ranking Arrangement + Find the Missing Number + Arrangement of Words in Logical Order + Cubes and Dice",
    summary: { score: 27.5, maxScore: 50, correct: 29, incorrect: 6, unattempted: 15, rank: 3, participants: 7, percentile: 57.14, accuracy: 82, timeMinutes: 30, averageScore: 21.43, highestScore: 33.75, averageAccuracy: 75.81, medianScore: 22.25 },
  },
  {
    code: "test-08", number: 8, sha256: "afff3fe35e37bc911e0cfd944f4677805ea4a734a56224ce629ffb5d33253410",
    title: "Logical Venn Diagram + Paper Cutting, Folding and Mirror images + Matrix reasoning + Syllogism + Statement and Conclusions",
    summary: { score: 31, maxScore: 50, correct: 32, incorrect: 4, unattempted: 14, rank: 1, participants: 9, percentile: 88.89, accuracy: 88, timeMinutes: 30, averageScore: 23.64, highestScore: 31, averageAccuracy: 77.89, medianScore: 25.5 },
  },
  {
    // The portal shows "--" for percentile at rank 6 of 6; it is recorded as null, not derived.
    code: "test-11", number: 11, sha256: "dd34eb203a993e33af737f17e907f85fc1a68880b4ab5086468f115662c01d60",
    title: "Theory of structures",
    summary: { score: 5.25, maxScore: 50, correct: 7, incorrect: 7, unattempted: 36, rank: 6, participants: 6, percentile: null, accuracy: 50, timeMinutes: 30, averageScore: 20.6, highestScore: 33.25, averageAccuracy: 70.55, medianScore: 17.75 },
  },
];

const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const LETTERS = ["A", "B", "C", "D"];

function fail(message) {
  console.error(`Refusing: ${message}`);
  process.exit(1);
}

function buildTest(spec) {
  const file = path.join(DIR, `${spec.code}.json`);
  if (!fs.existsSync(file)) fail(`${spec.code}: no capture file at ${path.relative(ROOT, file)}`);
  const capture = JSON.parse(fs.readFileSync(file, "utf8"));
  const hash = crypto.createHash("sha256").update(JSON.stringify(canon(capture))).digest("hex");
  if (hash !== spec.sha256) fail(`${spec.code}: file hash ${hash} is not the hash taken on the portal (${spec.sha256})`);
  if (!capture.test.startsWith(`Test ${spec.number} - `)) fail(`${spec.code}: capture is of "${capture.test}"`);

  const incorrect = capture.questions.filter((q) => q.status === "incorrect").length;
  const unattempted = capture.questions.filter((q) => q.status === "unattempted").length;
  if (incorrect !== spec.summary.incorrect || unattempted !== spec.summary.unattempted) {
    fail(`${spec.code}: ${incorrect} incorrect / ${unattempted} unattempted questions, but the result page says ${spec.summary.incorrect} / ${spec.summary.unattempted}`);
  }
  if (spec.summary.correct + incorrect + unattempted !== 50) fail(`${spec.code}: counts do not add up to 50`);

  const notes = [];
  const attentionQuestions = capture.questions.map((q) => {
    if (q.o.length !== 4) fail(`${spec.code} Q${q.n}: ${q.o.length} options`);
    if (!LETTERS.includes(q.key)) fail(`${spec.code} Q${q.n}: key ${q.key}`);
    if (q.status === "unattempted" && q.choice !== null) fail(`${spec.code} Q${q.n}: unattempted with a choice`);
    if (q.status === "incorrect" && (q.choice === null || q.choice === q.key)) fail(`${spec.code} Q${q.n}: incorrect but choice ${q.choice}`);

    const questionText = sourceHtmlToText(q.q);
    const optionTexts = q.o.map((html) => sourceHtmlToText(html));
    const complete = Boolean((questionText.replace(/\[image\]/g, "").trim() || sourceHtmlImages(q.q).length) && q.o.every((html, i) => optionTexts[i] || sourceHtmlImages(html).length));
    if (!complete) notes.push(`${spec.code} Q${q.n}: part of the question or an option is empty; flagged visual_review_required`);
    const sameText = optionTexts.filter((text, i) => text && !text.includes("[image]") && optionTexts.indexOf(text) !== i);
    if (sameText.length) notes.push(`${spec.code} Q${q.n}: the portal shows two identical options ("${sameText[0]}"); key ${q.key}${q.choice ? `, chosen ${q.choice}` : ""}`);

    return {
      id: `${spec.code}-q${String(q.n).padStart(2, "0")}`,
      number: q.n,
      status: q.status,
      timeSeconds: q.time,
      marksAwarded: q.score,
      avgAttemptRate: q.attemptRate,
      avgTimeSeconds: q.avgTime,
      question: questionText,
      options: optionTexts.map((text, i) => ({ id: LETTERS[i], text })),
      selectedOption: q.choice,
      correctOption: q.key,
      explanation: sourceHtmlToText(q.s),
      deceptiveChoice: q.deceptive,
      popularChoice: q.popular,
      sourceQuality: complete ? "verified_source" : "visual_review_required",
      questionHtml: q.q,
      optionsHtml: q.o,
      explanationHtml: q.s,
    };
  });
  return { test: { code: spec.code, title: spec.title, summary: spec.summary, attentionQuestions }, notes };
}

const data = JSON.parse(fs.readFileSync(IMPORT_PATH, "utf8"));
const report = { added: [], notes: [] };
for (const spec of TESTS) {
  if (data.tests.some((t) => t.code === spec.code)) fail(`${spec.code} is already in the import`);
  const { test, notes } = buildTest(spec);
  data.tests.push(test);
  report.added.push(`${spec.code}: ${test.attentionQuestions.length} questions (${spec.summary.incorrect} incorrect, ${spec.summary.unattempted} unattempted), ${test.attentionQuestions.filter((q) => q.sourceQuality === "verified_source").length} practice-ready`);
  report.notes.push(...notes);
}
data.tests.sort((a, b) => Number(a.code.slice(5)) - Number(b.code.slice(5)));
data.source.scope = "Attempt-level results plus incorrect and unattempted question content from eight completed tests (Tests 2, 5, 9 and 12 captured 2026-09-29; Tests 6, 7, 8 and 11 added 2026-10-02).";
data.source.added = {
  capturedOn: CAPTURED_ON,
  tests: TESTS.map((t) => t.code),
  method: "Portal result page and solution view in the owner's own signed-in session (built-in browser); question, option and explanation HTML, the learner's answer, timing and cohort stats read from the page's Apollo cache. Image links kept (images stay on the portal's public image host).",
  files: Object.fromEntries(TESTS.map((t) => [t.code, t.sha256])),
};

console.log(JSON.stringify(report, null, 2));
if (write) {
  fs.writeFileSync(IMPORT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, IMPORT_PATH)}`);
} else {
  console.log("Dry run. Add --write to save.");
}
