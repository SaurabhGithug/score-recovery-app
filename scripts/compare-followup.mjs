// Google vs DeepSeek for follow-up answers (Saurabh, 2026-09-30: "let Google answer; allow DeepSeek
// only if it is better"). Asks both providers the same follow-up questions about the Made Easy
// owner's ready questions and writes the answers, unlabelled and in random order, for a blind
// judgement. Needs GOOGLE_GENERATIVE_AI_API_KEY and DEEPSEEK_API_KEY in .env.local.
// Spends real money (recorded against the normal daily limit): roughly 2 x N small calls.
//
//   node --env-file=.env.local --import tsx scripts/compare-followup.mjs [N=8]
import fs from "node:fs";
import crypto from "node:crypto";

const N = Math.max(1, Math.min(20, Number(process.argv[2] ?? 8)));
const { askFollowUp, followUpDeps } = await import("../src/lib/server/followup/followup.ts");
const { madeEasyOverview, madeEasyTest, madeEasyOwner } = await import("../src/lib/server/made-easy.ts");

const owner = madeEasyOwner();
if (!owner) throw new Error("The Made Easy import has no owner account.");
const base = followUpDeps();
if (!base.googleKey || !base.deepseek) throw new Error("Both GOOGLE_GENERATIVE_AI_API_KEY and DEEPSEEK_API_KEY are needed.");

// Spread across the tests; wrong answers first, as a learner would ask about those.
const questions = madeEasyOverview().tests
  .flatMap((t) => madeEasyTest(t.code).questions.filter((q) => q.sourceQuality === "verified_text"))
  .sort((a, b) => (a.status === b.status ? 0 : a.status === "incorrect" ? -1 : 1))
  .filter((q, i, all) => all.findIndex((x) => x.testCode === q.testCode) === i || i % 3 === 0)
  .slice(0, N);

const PROMPTS = [
  (q) => (q.selectedOption && q.selectedOption !== q.correctOption ? `Why is option ${q.selectedOption} wrong here?` : "How do I solve this quickly in the exam?"),
  () => "Explain the concept behind this question in simple words, with one exam tip.",
];

const rows = [];
for (const [i, q] of questions.entries()) {
  const message = PROMPTS[i % PROMPTS.length](q);
  const pair = {};
  for (const provider of ["google", "deepseek"]) {
    try {
      const a = await askFollowUp(owner, { kind: "made_easy", id: q.id, message }, { ...base, provider });
      pair[provider] = { answer: a.answer, grounded: a.grounded, sources: a.sources.map((s) => s.uri) };
    } catch (err) {
      pair[provider] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  const flip = crypto.randomInt(2) === 1;
  rows.push({
    questionId: q.id,
    question: q.question,
    options: q.options,
    key: q.correctOption,
    sourceExplanation: q.explanation,
    followUp: message,
    X: flip ? pair.deepseek : pair.google,
    Y: flip ? pair.google : pair.deepseek,
    _reveal: flip ? { X: "deepseek", Y: "google" } : { X: "google", Y: "deepseek" },
  });
  console.log(`${i + 1}/${questions.length} ${q.id}`);
}

const out = `output/followup-comparison-${new Date().toISOString().slice(0, 10)}.json`;
fs.mkdirSync("output", { recursive: true });
fs.writeFileSync(out, JSON.stringify(rows, null, 2));
console.log(`Wrote ${out}. Judge X vs Y blind (correctness vs the key and explanation, no invented facts, exam usefulness), then read _reveal.`);
