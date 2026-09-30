// Merges the Made Easy recapture (data/made-easy-recapture/test-XX.json, taken 2026-09-30 from the
// portal's solution view in the owner's own session) into src/lib/madeeasy-import.json.
// For every saved question it adds the portal's original HTML (question, options, explanation, with
// its image links) and replaces the lossy plain text with text derived from that HTML. A question
// is merged only when the portal key in the recapture equals the key already imported; any
// mismatch is reported and left untouched.
//
//   node --import tsx scripts/merge-madeeasy-recapture.mjs          (dry run: report only)
//   node --import tsx scripts/merge-madeeasy-recapture.mjs --write
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const { sourceHtmlToText, sourceHtmlImages } = await import("../src/lib/server/source-html.ts");

const ROOT = path.resolve(import.meta.dirname, "..");
const IMPORT_PATH = path.join(ROOT, "src/lib/madeeasy-import.json");
const DIR = path.join(ROOT, "data/made-easy-recapture");
const write = process.argv.includes("--write");

const data = JSON.parse(fs.readFileSync(IMPORT_PATH, "utf8"));
const report = { merged: 0, nowReady: 0, keyMismatch: [], missing: [], emptyParts: [] };
const files = {};

for (const test of data.tests) {
  const file = path.join(DIR, `${test.code}.json`);
  if (!fs.existsSync(file)) {
    report.missing.push(`${test.code}: no recapture file`);
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  files[test.code] = crypto.createHash("sha256").update(raw).digest("hex");
  const recapture = JSON.parse(raw);
  const byNumber = new Map(recapture.questions.map((q) => [q.n, q]));
  for (const q of test.attentionQuestions) {
    const r = byNumber.get(q.number);
    if (!r) {
      report.missing.push(`${test.code} Q${q.number}`);
      continue;
    }
    if (r.key !== q.correctOption) {
      report.keyMismatch.push(`${test.code} Q${q.number}: imported ${q.correctOption}, portal now ${r.key}`);
      continue;
    }
    if (r.o.length !== q.options.length || q.options.some((o, i) => o.id !== "ABCD"[i])) {
      report.keyMismatch.push(`${test.code} Q${q.number}: option layout differs`);
      continue;
    }
    const questionText = sourceHtmlToText(r.q);
    const optionTexts = r.o.map((html) => sourceHtmlToText(html));
    const complete = (questionText.replace(/\[image\]/g, "").trim() || sourceHtmlImages(r.q).length) && r.o.every((html, i) => optionTexts[i] || sourceHtmlImages(html).length);
    if (!complete) {
      report.emptyParts.push(`${test.code} Q${q.number}`);
      continue;
    }
    if (q.sourceQuality === "visual_review_required") report.nowReady++;
    q.questionHtml = r.q;
    q.optionsHtml = r.o;
    q.explanationHtml = r.s;
    q.question = questionText;
    q.options = q.options.map((o, i) => ({ id: o.id, text: optionTexts[i] }));
    q.explanation = sourceHtmlToText(r.s);
    q.sourceQuality = "verified_source";
    report.merged++;
  }
}

data.source.recapture = {
  capturedOn: "2026-09-30",
  method: "Portal solution view in the owner's own signed-in session (built-in browser); question, option and explanation HTML read from the page, image links kept (images stay on the portal's public image host).",
  files,
};
data.source.integrityPolicy =
  "Portal-visible facts only. Questions are shown from the portal's own HTML (text and its images); anything that could not be recaptured stays flagged visual_review_required and out of practice. Nothing is reconstructed or guessed.";

console.log(JSON.stringify(report, null, 2));
if (write) {
  fs.writeFileSync(IMPORT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, IMPORT_PATH)}`);
} else {
  console.log("Dry run. Add --write to save.");
}
