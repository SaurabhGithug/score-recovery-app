// Run with: npx tsx scripts/test-import-text.mjs
// Text clean-up rules of the PYP importer: the English half of bilingual blocks with
// mis-encoded Hindi, and print furniture that must never reach question text.
import assert from "node:assert/strict";

const { englishHalf, stripPrintFurniture, englishOfBilingual } = await import("../src/lib/server/bank/import-pyp.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test("keeps the English before a mis-encoded Hindi run", () => {
  assert.equal(englishHalf("Which of the following statements is true? �न�न�ल�खत म� से कौन सा कथन स�य है ?"), "Which of the following statements is true?");
  assert.equal(englishHalf("A and B Only\nके वल A और B"), "A and B Only");
  assert.equal(englishHalf("curing\n��य� रगं"), "curing");
});

test("numbers opening the Hindi line belong to the Hindi, not the English", () => {
  assert.equal(
    englishHalf("What is the head (m) produced by the liquid?\n1.62 आपे��क घन�व के एक �व"),
    "What is the head (m) produced by the liquid?"
  );
  assert.equal(englishHalf("Series:\n2, 3, 5, 8\n2, 3, 5, 8 �न�न�ल�खत म� से"), "Series:\n2, 3, 5, 8");
  // numbers inside the English line itself are kept
  assert.equal(englishHalf("Find 2 + 2 in base 3 �न�न�ल�खत म� से"), "Find 2 + 2 in base 3");
});

test("plain English and plain numbers are unchanged", () => {
  assert.equal(englishHalf("2, 3, 5, 8, 13, ?, 34, ?"), "2, 3, 5, 8, 13, ?, 34, ?");
  assert.equal(englishHalf("1"), "1");
});

test("a replacement character inside the English (no Hindi nearby) is not intact ⇒ null", () => {
  assert.equal(englishHalf("Modulus of elasticity � of steel is taken as 2 x 10^5 N/mm2 in design"), null);
});

test("Hindi-only text has no English half ⇒ null", () => {
  assert.equal(englishHalf("�न�न�ल�खत म� से"), null);
  assert.equal(englishHalf(""), null);
});

test("print furniture: footer and the page counter above it go; fractions in content stay", () => {
  assert.equal(stripPrintFurniture("50/55\n13/02/2018 Staff Selection Commision"), "");
  assert.equal(stripPrintFurniture("Find the load.\n12/55\n13/02/2018 Staff Selection Commission\nmore text"), "Find the load.\nmore text");
  assert.equal(stripPrintFurniture("1/8"), "1/8");
  assert.equal(stripPrintFurniture("Ratio is\n1/10"), "Ratio is\n1/10");
  assert.equal(stripPrintFurniture("see https://ssc.digialm.com/per/g27/x.html # 3/55 here"), "see here");
});

test("bilingual promotion: only a real English+Hindi block with clean English becomes bilingual_en", () => {
  const hi = " �न�न�ल�खत म� से कौन सा";
  assert.deepEqual(englishOfBilingual(`Which lime is used under water?${hi}`, [`hydraulic${hi}`, "fat lime", "quick", "pure"]), {
    stem: "Which lime is used under water?",
    options: ["hydraulic", "fat lime", "quick", "pure"],
  });
  // English mojibake, no Hindi at all: stays garbled
  assert.equal(englishOfBilingual("Modulus of elasticity Ã¢â‚¬â€ of steel is", ["a", "b", "c", "d"]), null);
  // bilingual stem, but an option's English half carries mojibake
  assert.equal(englishOfBilingual(`Which lime is used under water?${hi}`, ["hydraulic", "Ã¢â‚¬", "c", "d"]), null);
  // stem too short to be a question
  assert.equal(englishOfBilingual(`Why?${hi}`, ["a", "b", "c", "d"]), null);
  // legitimate symbols are not mojibake
  assert.ok(englishOfBilingual(`Stress of 25 N/mm² at 20°C × factor is${hi}`, ["1", "2", "3", "4"]));
});

console.log(`\n${passed} import-text tests passed`);
