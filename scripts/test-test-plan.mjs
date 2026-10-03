import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addItem, askPending, clearOpened, dayMarks, fillPortalNames, isValidDate, itemsOn, linkFor, markOpened, mergePreset,
  parsePlan, planStorageKey, presetId, removeItem, safeUrl, setResult, setStatus, setUrl, summarize, syncPreset,
} from "../src/lib/calendar/test-plan.ts";

// links: only http(s) and in-app paths are allowed
assert.equal(safeUrl("https://ehub.iesmaster.org/student/course"), "https://ehub.iesmaster.org/student/course");
assert.equal(safeUrl("  /papers  "), "/papers");
for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "//evil.example", "/\\evil", "ftp://x.y", "not a url", "", null, 5]) {
  assert.equal(safeUrl(bad), "", `must reject ${String(bad)}`);
}
assert.equal(isValidDate("2026-10-03"), true);
assert.equal(isValidDate("2026-02-30"), false);
assert.equal(isValidDate("3 Oct 2026"), false);
assert.equal(planStorageKey("usr_1"), "test-plan:v1:usr_1");

// adding: sorted by date, trimmed, validated
let plan = [];
plan = addItem(plan, { date: "2026-10-05", title: "  IES T38 Aggregates ", series: "ies", minutes: 60 }, "b");
plan = addItem(plan, { date: "2026-10-03", title: "Made Easy FLT 1", series: "madeeasy", url: "https://example.com/t1" }, "a");
assert.deepEqual(plan.map((i) => i.id), ["a", "b"]);
assert.equal(plan[1].title, "IES T38 Aggregates");
assert.equal(plan[1].status, "planned");
assert.throws(() => addItem(plan, { date: "2026-10-05", title: "   ", series: "ies" }), /name/);
assert.throws(() => addItem(plan, { date: "2026-13-05", title: "x", series: "ies" }), /date/);
assert.throws(() => addItem(plan, { date: "2026-10-05", title: "x", series: "ies", url: "javascript:alert(1)" }), /link/);
assert.equal(addItem(plan, { date: "2026-10-05", title: "x", series: "nonsense", minutes: 9999 })[2].minutes, 600);
assert.equal(addItem(plan, { date: "2026-10-05", title: "x", series: "nonsense" })[2].series, "other");

// links: own link wins, else the series link
assert.equal(linkFor(plan[0]), "https://example.com/t1");
assert.equal(linkFor(plan[1]), "https://ehub.iesmaster.org/student/testment/test", "IES items open the My Tests list");
plan = setUrl(plan, "b", "https://ehub.iesmaster.org/student/testment/test/abc");
assert.equal(linkFor(plan.find((i) => i.id === "b")), "https://ehub.iesmaster.org/student/testment/test/abc", "a pasted direct link wins");
assert.throws(() => setUrl(plan, "b", "javascript:alert(1)"), /link/);
plan = setUrl(plan, "b", "  ");
assert.equal(linkFor(plan.find((i) => i.id === "b")), "https://ehub.iesmaster.org/student/testment/test", "empty goes back to the series page");
assert.equal(addItem([], { date: "2026-10-03", title: "t", series: "ies", portalName: "  Topic wise Test - 42   Estimating " }, "p")[0].portalName, "Topic wise Test - 42 Estimating");

// open, ask, answer
plan = markOpened(plan, "b", "2026-10-05T10:00:00.000Z");
plan = markOpened(plan, "a", "2026-10-05T11:00:00.000Z");
assert.deepEqual(askPending(plan).map((i) => i.id), ["a", "b"], "newest first");
plan = clearOpened(plan, "a");
assert.deepEqual(askPending(plan).map((i) => i.id), ["b"]);
plan = setStatus(plan, "b", "attempted", "2026-10-05T12:00:00.000Z", "  41/60,   50 min ");
const done = plan.find((i) => i.id === "b");
assert.equal(done.status, "attempted");
assert.equal(done.openedAt, null, "answered, so no longer asked");
assert.equal(done.doneAt, "2026-10-05T12:00:00.000Z");
assert.equal(done.result, "41/60, 50 min");
assert.deepEqual(askPending(plan), []);
plan = markOpened(plan, "b", "2026-10-06T00:00:00.000Z");
assert.equal(plan.find((i) => i.id === "b").openedAt, null, "an attempted test is never asked about again");
plan = setStatus(plan, "b", "planned", "2026-10-06T00:00:00.000Z");
assert.equal(plan.find((i) => i.id === "b").doneAt, null, "undo clears the done time");
assert.equal(plan.find((i) => i.id === "b").result, "41/60, 50 min", "undo keeps what the learner typed");
plan = setResult(plan, "b", "x".repeat(500));
assert.equal(plan.find((i) => i.id === "b").result.length, 120);

// summary and day marks
plan = setStatus(plan, "b", "attempted", "2026-10-05T12:00:00.000Z");
plan = setStatus(plan, "a", "skipped", "2026-10-05T12:00:00.000Z");
plan = addItem(plan, { date: "2026-10-05", title: "Reasoning full", series: "ies", minutes: 30 }, "c");
plan = addItem(plan, { date: "2026-10-02", title: "Old test", series: "app", minutes: 20 }, "d");
const s = summarize(plan, "2026-10-05");
assert.deepEqual(s, { todayTotal: 2, todayDone: 1, todayMinutesLeft: 30, overallTotal: 4, overallDone: 1, overdue: 1 });
assert.deepEqual(dayMarks(plan)["2026-10-05"], { total: 2, done: 1, skipped: 0 });
assert.deepEqual(dayMarks(plan)["2026-10-03"], { total: 1, done: 0, skipped: 1 });
assert.equal(itemsOn(plan, "2026-10-05").length, 2);
plan = removeItem(plan, "d");
assert.equal(plan.length, 3);

// storage round trip and hostile data
const roundTrip = parsePlan(JSON.parse(JSON.stringify(plan)));
assert.deepEqual(roundTrip, plan);
const hostile = parsePlan([
  null, 5, "x", { date: "bad", title: "x" }, { date: "2026-10-05", title: "" },
  { id: "dup", date: "2026-10-05", title: "one", series: "ies", url: "javascript:x", minutes: -5, status: "attempted", openedAt: "now", doneAt: "t" },
  { id: "dup", date: "2026-10-06", title: "same id, dropped" },
  { date: "2026-10-04", title: "second", status: "weird", openedAt: "t", doneAt: "t" },
]);
assert.equal(hostile.length, 2);
assert.equal(hostile[0].title, "second");
assert.equal(hostile[0].status, "planned");
assert.equal(hostile[0].doneAt, null);
assert.equal(hostile[0].openedAt, "t");
assert.equal(hostile[1].url, "");
assert.equal(hostile[1].minutes, 0);
assert.equal(hostile[1].openedAt, null, "an attempted item has no pending question");
assert.deepEqual(parsePlan("not an array"), []);

// built-in plan: loading it twice adds nothing the second time and never touches your own items
const preset = JSON.parse(readFileSync(new URL("../src/lib/calendar/pyq-plan-preset.json", import.meta.url), "utf8"));
assert.ok(preset.items.length > 150, "the PYQ plan has its items");
const first = mergePreset([], preset.items);
assert.equal(first.added, preset.items.length);
const second = mergePreset(first.items, preset.items);
assert.equal(second.added, 0);
assert.equal(second.items.length, first.items.length);
assert.equal(first.items[0].id, presetId(first.items[0].date, first.items[0].title));
const mine = addItem([], { date: "2026-10-03", title: "My own note", series: "other" }, "mine");
assert.equal(mergePreset(mine, preset.items).items.find((i) => i.id === "mine").title, "My own note");
const days = new Set(preset.items.map((i) => i.date));
assert.equal(days.size, 30, "3 Oct to 1 Nov is 30 days");
assert.ok([...days].every((d) => d >= "2026-10-03" && d <= "2026-11-01"));
for (const d of days) {
  const todays = preset.items.filter((i) => i.date === d);
  assert.equal(todays.filter((i) => i.title.startsWith("Reasoning")).length, 3, `${d}: three reasoning blocks`);
  assert.equal(todays.filter((i) => i.title.startsWith("Hot-topic drill")).length, 1, `${d}: one hot-topic drill`);
}
assert.equal(parsePlan(first.items).length, first.items.length, "every preset item survives validation");
const civil = preset.items.filter((i) => i.title.startsWith("IES T"));
assert.ok(civil.length >= 55 && civil.every((i) => i.portalName && /Test\s*-?\s*\d+/.test(i.portalName)), "every IES Civil test carries its exact portal name");
assert.ok(preset.items.filter((i) => i.portalName).length > 120, "reasoning and GA sets carry their portal names too");
assert.ok(first.items.every((i) => !i.portalName || i.portalName.length <= 200));
assert.equal(first.items.find((i) => i.title.startsWith("IES T42")).portalName, "Topic wise Test - 42 Estimating,Costing and Valuation _ (Estimating ,Costing and Valuation -42)");

// older saved plans get exact names filled in, nothing else changes
const stripped = first.items.map((i) => ({ ...i, portalName: "" }));
const filled = fillPortalNames(stripped, preset.items);
assert.equal(filled.filter((i) => i.portalName).length, first.items.filter((i) => i.portalName).length);
assert.equal(filled.length, stripped.length);
assert.equal(fillPortalNames(filled, preset.items), filled, "nothing to fill, same array back");
const own = addItem([], { date: "2026-10-03", title: "IES T42 Estimating, Costing and Valuation (315 Q, 197 min)", series: "ies" }, "mine2");
assert.equal(fillPortalNames(own, preset.items)[0].portalName, "", "your own items are never renamed");

// every hot test three times: Pass 1 on its day, then Pass 2 and Pass 3 on later days
const passItems = preset.items.filter((i) => /^Pass [23] of 3: IES T\d+ /.test(i.title));
const hotTests = new Set(passItems.map((i) => i.title.match(/IES T(\d+) /)[1]));
assert.equal(hotTests.size, 36, "Tier 1 (11) + Tier 2 (25) tests get extra passes");
assert.equal(passItems.length, 72, "two extra passes per hot test");
for (const n of hotTests) {
  const pass = (k) => preset.items.filter((i) => (k === 1 ? i.title.startsWith(`IES T${n} `) : i.title.startsWith(`Pass ${k} of 3: IES T${n} `)));
  const [p1, p2, p3] = [pass(1), pass(2), pass(3)];
  assert.deepEqual([p1.length, p2.length, p3.length], [1, 1, 1], `T${n}: exactly one item per pass`);
  assert.ok(p1[0].date < p2[0].date && p2[0].date < p3[0].date, `T${n}: Pass 1 < Pass 2 < Pass 3`);
  assert.ok(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"].includes(p2[0].date), `T${n}: Pass 2 on a review day`);
  assert.ok(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"].includes(p3[0].date), `T${n}: Pass 3 in the last four days`);
  assert.equal(p2[0].minutes, Math.max(5, Math.ceil((p1[0].minutes * 30) / 100)), `T${n}: Pass 2 is 30% of the test`);
  assert.equal(p3[0].minutes, Math.max(5, Math.ceil((p1[0].minutes * 20) / 100)), `T${n}: Pass 3 is 20% of the test`);
  assert.ok(p2[0].title.endsWith(`- redo your wrong and guessed questions (about ${p2[0].minutes} min)`));
  assert.equal(p2[0].portalName, p1[0].portalName, `T${n}: same portal test for every pass`);
  assert.equal(p3[0].portalName, p1[0].portalName);
  assert.equal(p2[0].series, "ies");
}
assert.ok(!preset.items.some((i) => /^(Retake|Second pass)/.test(i.title)), "no generic retake or taper items left");

// updating a saved plan: an older plan with generic retake/taper items, some of which the learner touched
const generic = [
  ...["2026-10-07", "2026-10-14", "2026-10-21"].map((date) => ({ date, title: "Retake: re-sit the 2-3 weakest topic tests of the last 7 days (lowest accuracy) and redo their wrong questions", series: "ies", minutes: 90, note: "RETAKE DAY" })),
  ...["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"].map((date) => ({ date, title: "Second pass: redo every wrong question from your log + the hot facts you missed most", series: "app", minutes: 90, note: "No new tests today" })),
];
const oldPreset = [...preset.items.filter((i) => !i.title.startsWith("Pass ")), ...generic];
let saved = mergePreset([], oldPreset).items;
const staleId = (date) => saved.find((i) => i.date === date && /^(Retake|Second pass)/.test(i.title)).id;
const t42 = saved.find((i) => i.title.startsWith("IES T42 ")).id;
saved = setStatus(saved, staleId("2026-10-07"), "attempted", "2026-10-07T10:00:00.000Z", "41/60");   // attempted: kept
saved = setUrl(saved, staleId("2026-10-14"), "https://ehub.iesmaster.org/student/testment/test/x"); // own link: kept
saved = markOpened(saved, staleId("2026-10-30"), "2026-10-03T10:00:00.000Z");                      // opened: kept
saved = setResult(saved, staleId("2026-10-31"), "note to self");                                    // own note: kept
saved = setStatus(saved, t42, "attempted", "2026-10-03T12:00:00.000Z", "201/315");
saved = addItem(saved, { date: "2026-10-21", title: "Retake: re-sit the 2-3 weakest topic tests of the last 7 days (lowest accuracy) and redo their wrong questions", series: "ies" }, "mine-retake");
saved = addItem(saved, { date: "2026-10-28", title: "Made Easy FLT 4", series: "madeeasy" }, "mine-flt");
const synced = syncPreset(saved, preset.items);
assert.equal(synced.removed, 4, "untouched stale items go: the 10-21 retake and the 10-28 / 10-29 / 11-01 taper items");
assert.equal(synced.added, passItems.length, "every pass item is added");
for (const date of ["2026-10-07", "2026-10-14", "2026-10-30", "2026-10-31"]) {
  assert.ok(synced.items.some((i) => i.id === staleId(date)), `${date}: a stale item the learner touched is kept`);
}
for (const date of ["2026-10-21", "2026-10-28", "2026-10-29", "2026-11-01"]) {
  assert.ok(!synced.items.some((i) => i.id === staleId(date)), `${date}: an untouched stale item is removed`);
}
assert.equal(synced.items.find((i) => i.id === "mine-retake").title, generic[0].title, "your own items are never removed, even with an old built-in title");
assert.ok(synced.items.some((i) => i.id === "mine-flt"));
assert.deepEqual(
  (({ status, result }) => ({ status, result }))(synced.items.find((i) => i.id === t42)),
  { status: "attempted", result: "201/315" }, "progress on current items is kept",
);
assert.equal(synced.items.find((i) => i.id === staleId("2026-10-07")).result, "41/60");
const currentIds = new Set(mergePreset([], preset.items).items.map((i) => i.id));
assert.ok([...currentIds].every((id) => synced.items.some((i) => i.id === id)), "every current built-in item is in the plan");
assert.equal(new Set(synced.items.map((i) => i.id)).size, synced.items.length, "no duplicate ids");
assert.equal(synced.items.length, saved.length - 4 + passItems.length);
assert.ok(synced.items.every((i, k, all) => k === 0 || all[k - 1].date <= i.date), "still sorted by date");
assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(synced.items))), synced.items, "the updated plan survives storage");
for (const n of hotTests) {
  const dates = new Set(synced.items.filter((i) => new RegExp(`^(Pass [23] of 3: )?IES T${n} `).test(i.title)).map((i) => i.date));
  assert.equal(dates.size, 3, `T${n}: on three dates after the update`);
}
// idempotent: a second update changes nothing and returns the same array
const again = syncPreset(synced.items, preset.items);
assert.deepEqual([again.added, again.removed], [0, 0]);
assert.equal(again.items, synced.items, "same array back when nothing changes");
const reloaded = syncPreset(parsePlan(JSON.parse(JSON.stringify(synced.items))), preset.items);
assert.deepEqual([reloaded.added, reloaded.removed], [0, 0], "still nothing to do after the plan is saved and reloaded");
assert.ok(mergePreset([], preset.items).items.every((i) => i.title === i.title.trim()), "cut titles carry no trailing space");
// a fresh load through sync is the same as the first load
const fresh = syncPreset([], preset.items);
assert.deepEqual([fresh.added, fresh.removed], [preset.items.length, 0]);
assert.deepEqual(fresh.items, first.items);
assert.deepEqual([syncPreset(first.items, preset.items).added, syncPreset(first.items, preset.items).removed], [0, 0]);
// old saved plans without portal names get them during the update
assert.equal(syncPreset(stripped, preset.items).items.filter((i) => i.portalName).length, first.items.filter((i) => i.portalName).length);
// own items only: nothing removed
const onlyMine = addItem([], { date: "2026-10-05", title: "My mock", series: "other" }, "m1");
assert.equal(syncPreset(onlyMine, preset.items).items.find((i) => i.id === "m1").title, "My mock");
assert.equal(syncPreset(onlyMine, preset.items).removed, 0);

console.log("test-plan: all checks passed");
