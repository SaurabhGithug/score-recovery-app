import assert from "node:assert/strict";
import { chatGptPrompt } from "../src/lib/server/followup/chatgpt-text.ts";

const base = {
  heading: "Made Easy Test 5, Q12 (Civil Engineering Test 5)",
  question: "The unit of dynamic viscosity in SI is",
  options: [
    { label: "A", text: "N·s/m²" },
    { label: "B", text: "m²/s" },
    { label: "C", text: "N/m" },
    { label: "D", text: "kg/m³" },
  ],
  key: "A (N·s/m²)",
  keySource: "the Made Easy test series' answer key",
  learnerAnswer: "B",
  explanation: "Dynamic viscosity μ = τ / (du/dy), so its unit is N·s/m².",
  incomplete: null,
  images: [],
};

const text = chatGptPrompt(base);
assert.match(text, /SSC JE 2026 \(Civil Engineering\)/);
assert.match(text, /Made Easy Test 5, Q12/);
assert.match(text, /Question:\nThe unit of dynamic viscosity in SI is/);
assert.match(text, /\nA\. N·s\/m²\nB\. m²\/s\nC\. N\/m\nD\. kg\/m³\n/, "every option, one per line, in order");
assert.match(text, /Answer key: A \(N·s\/m²\), from the Made Easy test series' answer key\./);
assert.match(text, /I originally chose B\./);
assert.match(text, /Source explanation:\nDynamic viscosity/);
assert.match(text, /explain how to solve this step by step, say why each wrong option is wrong/);
assert.ok(!/Note:/.test(text) && !/pictures, tables/.test(text), "no incomplete note or image block when there is none");

// No settled key: never presented as a key
const noKey = chatGptPrompt({ ...base, key: null, keySource: "no settled key: disputed", learnerAnswer: null, explanation: null });
assert.match(noKey, /Answer key: none \(no settled key: disputed\)\./);
assert.ok(!/I originally chose/.test(noKey) && !/Source explanation/.test(noKey));

// Incomplete text is flagged, and pictures are listed with where they appear
const withFigure = chatGptPrompt({
  ...base,
  incomplete: "A figure was an image that was not captured, so the text below is incomplete.",
  images: [{ url: "https://cdnstatic.madeeasyprime.com/q12.png", where: "in the question" }, { url: "https://cdnstatic.madeeasyprime.com/o2.png", where: "option B" }],
});
assert.match(withFigure, /Note: A figure was an image/);
assert.match(withFigure, /- in the question: https:\/\/cdnstatic\.madeeasyprime\.com\/q12\.png\n- option B: https:\/\/cdnstatic\.madeeasyprime\.com\/o2\.png/);

// Missing text never produces an empty line that looks like a real question or option
const missing = chatGptPrompt({ ...base, question: "  ", options: [{ label: "A", text: "" }] });
assert.match(missing, /\(question text missing\)/);
assert.match(missing, /A\. \(text missing\)/);

console.log("ChatGPT text: question, options, key, explanation, notes and images are laid out as expected.");
