// Run with: npx tsx scripts/test-option-order.mjs
// Option display order and labels: shuffled per attempt only while answering a text-led question;
// printed order (and one label per option) once committed, for image-led questions, and when
// options refer to each other by position.
import assert from "node:assert/strict";

const { displayOrder, displayLabel, optionLabel, optionRef, optionsNeedImage, imageLed } = await import("../src/components/bank/optionOrder.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

const opts = (texts) => texts.map((text, i) => ({ id: "ABCD"[i], text }));
const q = (texts, extra = {}) => ({ options: opts(texts), hasFigure: false, textQuality: "text_layer", ...extra });
const ids = (list) => list.map((x) => x.id).join("");

test("text-led, not committed: shuffled deterministically per attempt, labelled A–D by position", () => {
  const x = q(["lime", "cement", "gypsum", "clay"]);
  const orders = new Set(Array.from({ length: 20 }, (_, i) => ids(displayOrder(x, `att-${i}`, "q1", false))));
  assert.ok(orders.size > 1, "some attempt shuffles");
  assert.deepEqual(displayOrder(x, "att-1", "q1", false), displayOrder(x, "att-1", "q1", false), "stable across reloads");
  assert.deepEqual([0, 1, 2, 3].map((p) => displayLabel(x, p)), ["A", "B", "C", "D"]);
});

test("committed: printed order, and the displayed label of every option equals optionLabel (sources, notes, disputes)", () => {
  const x = q(["M25", "M15", "M20", "M30"]);
  for (let i = 0; i < 50; i++) {
    const order = displayOrder(x, `att-${i}`, "q1", true);
    assert.equal(ids(order), "ABCD");
    order.forEach((o, pos) => assert.equal(displayLabel(x, pos), optionLabel(x, o.id), `${o.id} at ${pos}`));
  }
  assert.equal(optionRef(x, "C"), "C (M20)");
});

test("image-led questions never shuffle and use the image's numbers 1–4, before and after commitment", () => {
  const cases = [
    q(["", "", "", ""], { textQuality: "garbled" }),
    q(["2 m", "", "4 m", "5 m"]),
    q(["a", "b", "c", "d"], { hasFigure: true }),
    q(["a", "b", "c", "d"], { textQuality: "ocr" }),
    q(["a", "b", "c", "d"], { textQuality: "garbled" }),
  ];
  for (const x of cases) {
    assert.equal(imageLed(x), true);
    for (let i = 0; i < 20; i++) assert.equal(ids(displayOrder(x, `att-${i}`, "q1", false)), "ABCD");
    assert.deepEqual([0, 1, 2, 3].map((p) => displayLabel(x, p)), ["1", "2", "3", "4"]);
    assert.equal(optionLabel(x, "C"), "3");
  }
  assert.equal(optionsNeedImage(opts(["a", "b", "c", "   "])), true);
});

test("bilingual English text is text-led (shuffled while answering)", () => {
  const x = q(["lime", "cement", "gypsum", "clay"], { textQuality: "bilingual_en" });
  assert.equal(imageLed(x), false);
  const orders = new Set(Array.from({ length: 20 }, (_, i) => ids(displayOrder(x, `att-${i}`, "q1", false))));
  assert.ok(orders.size > 1);
});

test("options that refer to other options keep printed order", () => {
  const x = q(["only 1", "only 2", "both 1 and 2", "none of these"]);
  for (let i = 0; i < 20; i++) assert.equal(ids(displayOrder(x, `att-${i}`, "q1", false)), "ABCD");
});

test("provider option ids (o1…o4) are labelled by printed position, never by raw id", () => {
  const x = { options: ["o1", "o2", "o3", "o4"].map((id, i) => ({ id, text: `opt ${i + 1}` })), hasFigure: false, textQuality: "text_layer" };
  assert.equal(optionLabel(x, "o2"), "B");
  assert.equal(optionRef(x, "o4"), "D (opt 4)");
});

console.log(`\n${passed} option-order tests passed`);
