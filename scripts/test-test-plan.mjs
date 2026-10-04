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
assert.ok(civil.length === 60 && civil.every((i) => i.portalName && /Test\s*-?\s*\d+/.test(i.portalName)), "every IES Civil test carries its exact portal name");
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
  assert.ok(["2026-10-28", "2026-10-30", "2026-11-01"].includes(p3[0].date), `T${n}: Pass 3 on a final review day (not a mock day)`);
  assert.equal(p2[0].minutes, Math.max(5, Math.ceil((p1[0].minutes * 30) / 100)), `T${n}: Pass 2 is 30% of the test`);
  assert.equal(p3[0].minutes, Math.max(5, Math.ceil((p1[0].minutes * 20) / 100)), `T${n}: Pass 3 is 20% of the test`);
  assert.ok(p2[0].title.endsWith(`- redo your wrong and guessed questions (about ${p2[0].minutes} min)`));
  assert.equal(p2[0].portalName, p1[0].portalName, `T${n}: same portal test for every pass`);
  assert.equal(p3[0].portalName, p1[0].portalName);
  assert.equal(p2[0].series, "ies");
}
assert.ok(!preset.items.some((i) => /^(Retake|Second pass)/.test(i.title)), "no generic retake or taper items left");

// full mocks: 8 Made Easy Full Syllabus Tests + 2 unseen real 2024 papers in this app; nothing else heavy on those days
const mocks = preset.items.filter((i) => i.title.startsWith("Full mock (200 Q, 120 min): "));
const mockDays = new Set(mocks.map((i) => i.date));
assert.equal(mocks.length, 10, "10 full mocks");
assert.equal(mockDays.size, 10, "one mock per mock day");
assert.equal(mocks.filter((i) => i.title.endsWith(" - optional")).map((i) => i.date).join(), "2026-10-31", "only the last mock is optional");
assert.ok(![...mockDays].some((d) => ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"].includes(d)), "no mock on a Pass-2 review day");
assert.equal(mocks.filter((i) => i.series === "madeeasy").length, 8, "all 8 Made Easy Full Syllabus Tests");
for (let k = 1; k <= 8; k++) assert.equal(mocks.filter((i) => i.title.endsWith(`Made Easy Full Syllabus Test ${k}`)).length, 1, `Made Easy FST ${k} once`);
for (const m of mocks.filter((i) => i.series === "app")) assert.match(m.url, /^\/papers\/sscje-civil-p1-2024-06-06-(0900|1700)\/instructions$/, "app mocks open an unseen 06 Jun 2024 paper in this app");
assert.ok(preset.items.every((i) => !mockDays.has(i.date) || !(i.title.startsWith("IES T") || i.title.startsWith("Pass ") || i.title.startsWith("Made Easy subject test") || i.title.startsWith("GK/CA"))), "no topic test, pass, subject test or GA set on a mock day");
for (const d of mockDays) assert.equal(preset.items.filter((i) => i.date === d && i.title.startsWith("Analyse today's mock")).length, 1, `${d}: analysis item`);
const meSubject = preset.items.filter((i) => /Made Easy subject test \d+:/.test(i.title));
const meNos = meSubject.map((i) => Number(i.title.match(/subject test (\d+):/)[1])).sort((a, b) => a - b);
assert.deepEqual(meNos, [1, 3, 4, 10, 13, 14, 15, 16], "every Made Easy subject test not yet attempted (as of 2 Oct) is planned once");
assert.ok(meSubject.every((i) => !mockDays.has(i.date)), "no subject test on a mock day");
for (const d of new Set(preset.items.map((i) => i.date).filter((d) => d !== "2026-10-03"))) assert.ok(preset.items.filter((i) => i.date === d).reduce((a, i) => a + i.minutes, 0) <= 330, `${d}: at most 330 planned minutes`);
assert.equal(parsePlan(mergePreset([], preset.items).items).filter((i) => i.url).length, 2, "the in-app mock links survive validation");

// a link that came with the built-in plan is not a learner action: the row can still be moved or removed by an update
{
  const loaded = mergePreset([], preset.items).items;
  const mockRow = loaded.find((i) => i.url);
  assert.equal(mockRow.presetUrl, mockRow.url, "built-in rows remember their built-in link");
  const movedPreset = preset.items.map((i) => (i.url ? { ...i, date: "2026-10-30" } : i));
  const moved = syncPreset(loaded, movedPreset);
  assert.equal(moved.items.filter((i) => i.title === mockRow.title).length, 1, "an untouched built-in row with a link moves instead of doubling");
  const pasted = setUrl(loaded, mockRow.id, "https://example.com/my-own-link");
  assert.ok(syncPreset(pasted, movedPreset).items.some((i) => i.id === mockRow.id), "a link the learner pasted keeps the row");
  assert.equal(parsePlan(JSON.parse(JSON.stringify(loaded))).find((i) => i.id === mockRow.id).presetUrl, mockRow.url, "presetUrl survives storage");
}

// a test the learner already acted on is not added again when an update moves it to another day
{
  const loaded = mergePreset([], preset.items).items;
  const t38 = loaded.find((i) => i.title.startsWith("IES T38 "));
  const started = setStatus(loaded, t38.id, "attempted", "2026-10-05T10:00:00.000Z", "70/93");
  const movedPreset = preset.items.map((i) => (i.title.startsWith("IES T38 ") ? { ...i, date: "2026-10-11" } : i));
  const res = syncPreset(started, movedPreset);
  assert.equal(res.items.filter((i) => i.title.startsWith("IES T38 ")).length, 1, "no second copy of an attempted test");
  assert.equal(res.items.find((i) => i.title.startsWith("IES T38 ")).status, "attempted");
  assert.equal(res.skipped, 1);
  const untouchedMove = syncPreset(loaded, movedPreset);
  assert.equal(untouchedMove.items.find((i) => i.title.startsWith("IES T38 ")).date, "2026-10-11", "an untouched test simply moves");
  assert.equal(untouchedMove.skipped, 0);
  const keys = res.items.map((i) => `${i.date}|${i.title}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicate date+title rows");
}

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

// the app never has to cut a built-in title or note
for (const i of preset.items) {
  assert.ok(i.title.length <= 200, `title too long on ${i.date}: ${i.title.slice(0, 40)}`);
  assert.ok((i.note ?? "").length <= 300, `note too long on ${i.date}: ${i.title.slice(0, 40)}`);
}

// the real upgrade: a plan saved from the committed 3 Oct preset, with some progress, updated to today's plan
{
  const head = JSON.parse(readFileSync(new URL("./fixtures/pyq-plan-preset-2026-10-03.json", import.meta.url), "utf8")).items;
  let saved = mergePreset([], head).items;
  const find = (date, prefix) => saved.find((i) => i.date === date && i.title.startsWith(prefix));
  const touchedIds = [];
  const touch = (row, f) => { touchedIds.push(row.id); saved = f(saved, row.id); };
  touch(find("2026-10-03", "IES T42 "), (s, id) => setStatus(s, id, "attempted", "2026-10-03T12:00:00.000Z", "201/315"));
  touch(find("2026-10-03", "Reasoning 1/3"), (s, id) => markOpened(s, id, "2026-10-03T09:00:00.000Z"));
  touch(find("2026-10-03", "GK/CA"), (s, id) => markOpened(s, id, "2026-10-03T09:05:00.000Z"));
  const oct5 = saved.find((i) => i.date === "2026-10-05" && i.title.startsWith("IES T"));
  touch(oct5, (s, id) => setStatus(s, id, "attempted", "2026-10-05T12:00:00.000Z", "60/93"));
  const oct9 = saved.find((i) => i.date === "2026-10-09" && i.title.startsWith("IES T"));
  touch(oct9, (s, id) => setResult(s, id, "need to redo"));
  saved = addItem(saved, { date: "2026-10-06", title: "My own revision of formulas", series: "other" }, "own-1");
  saved = parsePlan(JSON.parse(JSON.stringify(saved)));            // through storage, like the app
  const before = new Map(saved.map((i) => [i.id, JSON.stringify(i)]));
  const up = syncPreset(saved, preset.items);
  for (const id of [...touchedIds, "own-1"]) assert.equal(JSON.stringify(up.items.find((i) => i.id === id)), before.get(id), `${id}: kept unchanged`);
  const keys = up.items.map((i) => `${i.date}|${i.title}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicate date+title rows after the upgrade");
  for (const id of touchedIds) {
    const row = up.items.find((i) => i.id === id);
    if (/^IES T\d+ /.test(row.title)) assert.equal(up.items.filter((i) => i.title === row.title).length, 1, `${row.title.slice(0, 20)}: one copy only`);
  }
  assert.deepEqual(up.items.filter((i) => i.date === "2026-10-03").map((i) => i.title).sort(), head.filter((i) => i.date === "2026-10-03").map((i) => i.title).sort(), "3 Oct is unchanged");
  assert.ok(up.removed > 0 && up.added > 0, "outdated rows go, new ones arrive");
  const again = syncPreset(up.items, preset.items);
  assert.equal(again.added + again.removed, 0, "updating twice changes nothing");
  assert.equal(again.items.length, up.items.length);
}

console.log("test-plan: all checks passed");
