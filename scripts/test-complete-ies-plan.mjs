import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergePreset, syncPreset, setStatus, setResult, setUrl, markOpened, addItem, parsePlan } from "../src/lib/calendar/test-plan.ts";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const current = read("../src/lib/calendar/pyq-plan-preset.json");
const before = read("./fixtures/pyq-plan-preset-2026-10-05.json");
const catalogue = read("./fixtures/ies-my-tests-2026-10-04.json").civil;
const isTechnical = (x) => /^IES T\d+ /.test(x.title);
const technical = current.items.filter(isTechnical);
assert.equal(current.built, "2026-10-08");
assert.equal(technical.length, 106);
assert.equal(new Set(technical.map((x) => x.portalName)).size, 106, "one full attempt per portal test");
assert.deepEqual(new Set(technical.map((x) => x.portalName)), new Set(catalogue.map((x) => x[0])), "no missing or fabricated portal tests");
const numbers = technical.map((x) => Number(x.title.match(/^IES T(\d+) /)[1]));
assert.deepEqual([...numbers].sort((a,b)=>a-b), Array.from({length:106},(_,i)=>i+1));
const known = new Set(before.items.filter(isTechnical).map((x) => x.portalName));
const additions = technical.filter((x) => !known.has(x.portalName));
assert.equal(additions.length, 47);
assert.equal(additions.reduce((sum,x) => sum+x.minutes,0), 672);
assert.equal(catalogue.reduce((sum,x) => sum+x[2],0), 4414);
const mockDays = new Set(current.items.filter((x) => x.title.startsWith("Full mock")).map((x) => x.date));
for (const row of additions) {
  assert.ok(row.date >= "2026-10-08" && row.date <= "2026-10-26", "future first attempts end before final revision");
  assert.ok(!mockDays.has(row.date), "no additions on mock days");
  const [name, minutes, questions] = catalogue.find((x) => x[0] === row.portalName);
  assert.equal(row.minutes, minutes, name);
  assert.ok(row.title.endsWith(`(${questions} Q, ${minutes} min)`));
}
for (const old of before.items) {
  assert.deepEqual(current.items.find((x) => x.date===old.date && x.title===old.title), old, "original schedule and revisions stay intact");
}
for (const date of new Set(additions.map((x) => x.date))) {
  const rows = additions.filter((x) => x.date===date);
  const review = current.items.filter((x) => x.date===date && x.title.startsWith("Review added technical tests"));
  assert.equal(review.length, 1);
  assert.equal(review[0].minutes, rows.reduce((sum,x) => sum+Math.ceil(x.minutes/2),0));
  const oldReview = Math.ceil(before.items.filter((x) => x.date===date && isTechnical(x)).reduce((sum,x) => sum+x.minutes,0)/2);
  const calendarMinutes = current.items.filter((x) => x.date===date).reduce((sum,x) => sum+x.minutes,0);
  assert.ok(calendarMinutes + oldReview <= 450, `${date}: at most 7.5 hours including the original technical review allowance`);
}

// Upgrade the actual old preset, with all kinds of learner progress in it.
let saved = mergePreset([], before.items).items;
const originals = saved.filter(isTechnical);
saved = setStatus(saved, originals[0].id, "attempted", "2026-10-07T08:00:00Z", "12/15");
saved = setStatus(saved, originals[1].id, "skipped", "2026-10-07T08:00:00Z");
saved = markOpened(saved, originals[2].id, "2026-10-07T08:00:00Z");
saved = setUrl(saved, originals[3].id, "https://example.com/my-test");
saved = setResult(saved, originals[4].id, "my notes");
saved = addItem(saved, {date:"2026-10-12",title:"My own revision",series:"other",minutes:10}, "mine");
const upgraded = syncPreset(saved, current.items, "2026-10-08");
assert.equal(upgraded.added, 60, "47 tests and 13 explicit review blocks");
assert.equal(upgraded.removed, 0);
for (const old of saved) assert.deepEqual(upgraded.items.find((x) => x.id===old.id), old, "scores, opened states, skips, links and personal items survive");
assert.equal(upgraded.items.filter(isTechnical).length, 106);
const again = syncPreset(upgraded.items, current.items, "2026-10-08");
assert.equal(again.added, 0);
assert.equal(again.removed, 0);
assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(again.items))), upgraded.items);
console.log("complete-ies-plan: coverage, workload and progress preservation passed");
