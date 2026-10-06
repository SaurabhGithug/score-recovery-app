// Run against a local dev server: node scripts/test-calendar-loading.mjs http://127.0.0.1:3040
// Every API response and browser profile is isolated; no learner data is changed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { addItem, mergePreset, planStorageKey, syncPreset } from "../src/lib/calendar/test-plan.ts";

const baseURL = process.argv[2] ?? "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Use a local dev server");
const preset = JSON.parse(readFileSync(new URL("../src/lib/calendar/pyq-plan-preset.json", import.meta.url), "utf8"));
const today = "2026-10-05";
const todayItems = preset.items.filter((item) => item.date === today);
const AUTO_NOTICE = "The test plan was loaded on this device.";

// The automatic load must give exactly what pressing "Load PYQ plan" on an empty plan gives (rows and ids), so later updates match.
assert.deepEqual(mergePreset([], preset.items).items, syncPreset([], preset.items, today).items);

const browser = await chromium.launch();
const errors = [];

/**
 * Opens /calendar in a fresh browser profile (or `context`, to share storage), signed in as a mocked user.
 * `denyStorage`: true blocks every plan write; "plan" blocks only the plan itself (its version stamp still saves).
 */
async function openCalendar({ userId = "calendar-fixture", normalizedName = "reema", saved, stamp, denyStorage = false, context: shared, expectCalendar = true } = {}) {
  const context = shared ?? await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Kolkata" });
  await context.unroute("**/api/**");
  await context.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/auth/me"
      ? { user: { id: userId, name: "Calendar fixture", normalized_name: normalizedName, created_at: today, updated_at: today } }
      : pathname === "/api/contexts" ? { contexts: [], activeContext: null } : {};
    await route.fulfill({ json: body });
  });
  const page = await context.newPage();
  // A redirected page (another profile's home) gets empty mocked answers, so only the calendar's own errors count.
  if (expectCalendar) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  }
  await page.clock.setFixedTime(new Date(`${today}T08:00:00Z`));
  const key = planStorageKey(userId);
  // Only seed once, so reloads exercise the actual saved plan.
  await page.addInitScript(({ key, saved, stamp, denyStorage }) => {
    const seeded = `calendar-fixture-seeded:${key}`;
    if (!sessionStorage.getItem(seeded)) {
      if (saved !== undefined) localStorage.setItem(key, saved);
      if (stamp !== undefined) localStorage.setItem(`${key}:preset`, stamp);
      sessionStorage.setItem(seeded, "yes");
    }
    if (denyStorage) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (storageKey, value) {
        const denied = denyStorage === "plan" ? storageKey === key : storageKey.startsWith("test-plan:");
        if (denied) throw new DOMException("Storage full", "QuotaExceededError");
        return original.call(this, storageKey, value);
      };
    }
  }, { key, saved, stamp, denyStorage });
  await page.goto(`${baseURL}/calendar`);
  if (expectCalendar) {
    await page.getByRole("button", { name: /(?:Load|Update) PYQ plan/ }).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes("Loading your plan…"));
  }
  return { context, page, key };
}

async function readPlan(page, key) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
}
const planKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((name) => name.startsWith("test-plan:")).sort());

try {
  const { context, page, key } = await openCalendar();
  await page.getByRole("button", { name: "Update PYQ plan", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Mark attempted:/ }).count(), todayItems.length);
  assert.equal((await readPlan(page, key)).length, preset.items.length);
  assert.equal(await page.evaluate((key) => localStorage.getItem(`${key}:preset`), key), preset.built);
  await page.getByRole("status").filter({ hasText: AUTO_NOTICE }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No mobile overflow");
  if (process.env.CALENDAR_SCREENSHOT) await page.screenshot({ path: process.env.CALENDAR_SCREENSHOT });

  await page.getByRole("button", { name: `Mark attempted: ${todayItems[0].title}`, exact: true }).click();
  await page.getByLabel("Score / notes", { exact: true }).fill("42/50");
  await page.getByLabel("Score / notes", { exact: true }).blur();
  const beforeReload = await readPlan(page, key);
  assert.equal(beforeReload.find((item) => item.title === todayItems[0].title).result, "42/50");
  await page.reload();
  await page.getByRole("button", { name: `Mark not done: ${todayItems[0].title}`, exact: true }).waitFor();
  assert.deepEqual(await readPlan(page, key), beforeReload, "Reload preserves progress without duplicate tests");
  assert.equal(await page.getByText(AUTO_NOTICE).count(), 0, "The new-device notice shows only on the visit that loaded the plan");

  // A second profile in the same browser gets its own plan and leaves the first one's progress alone.
  const second = await openCalendar({ userId: "second-calendar-fixture", normalizedName: "saurabh civil", context });
  assert.notEqual(second.key, key);
  assert.equal((await readPlan(second.page, second.key)).length, preset.items.length);
  assert.deepEqual(await readPlan(second.page, key), beforeReload, "Another profile's automatic load does not touch this plan");
  await context.close();

  // A profile without the calendar (Mechanical) is sent away and gets no plan written for it.
  const mechanical = await openCalendar({ userId: "mechanical-fixture", normalizedName: "saurabh", expectCalendar: false });
  await mechanical.page.waitForURL((url) => !url.pathname.startsWith("/calendar"));
  await mechanical.page.waitForTimeout(500);
  assert.deepEqual(await planKeys(mechanical.page), [], "No plan for a profile without the calendar");
  await mechanical.context.close();

  // The screenshot's empty state also occurs with [] or a damaged storage value.
  for (const saved of ["[]", "broken JSON"]) {
    const fixture = await openCalendar({ saved });
    assert.equal((await readPlan(fixture.page, fixture.key)).length, preset.items.length);
    await fixture.context.close();
  }

  // Damaged saved text is refilled even when stamped, and kept aside rather than lost.
  const damaged = await openCalendar({ saved: "{broken", stamp: preset.built });
  assert.equal((await readPlan(damaged.page, damaged.key)).length, preset.items.length);
  assert.equal(await damaged.page.evaluate((key) => localStorage.getItem(`${key}:unreadable`), damaged.key), "{broken");
  await damaged.context.close();

  // Existing personal plans and deliberately cleared plans remain as the learner left them.
  const personal = addItem([], { date: today, title: "My saved test", series: "other" }, "mine");
  for (const [saved, stamp] of [[personal, undefined], [[], preset.built]]) {
    const fixture = await openCalendar({ saved: JSON.stringify(saved), stamp });
    assert.deepEqual(await readPlan(fixture.page, fixture.key), saved);
    assert.equal(await fixture.page.getByText(AUTO_NOTICE).count(), 0);
    await fixture.context.close();
  }

  // An existing built-in plan keeps scores, skips, direct links, removals and custom tests.
  const existing = addItem(mergePreset([], preset.items).items.slice(1), { date: today, title: "My saved test", series: "other" }, "mine");
  Object.assign(existing.find((item) => item.title === todayItems[0].title), { status: "attempted", doneAt: `${today}T07:00:00Z`, result: "40/50" });
  Object.assign(existing.find((item) => item.title === todayItems[1].title), { status: "skipped", doneAt: `${today}T07:00:00Z`, url: "https://example.com/my-test" });
  const preserved = await openCalendar({ userId: "another-calendar-fixture", saved: JSON.stringify(existing), stamp: preset.built });
  assert.deepEqual(await readPlan(preserved.page, preserved.key), existing);
  await preserved.context.close();

  // "Load PYQ plan" whose save fails must not stamp the plan: next visit would read the unsaved plan as "cleared on purpose".
  const unsaved = await openCalendar({ saved: JSON.stringify(personal), denyStorage: "plan" });
  await unsaved.page.getByRole("button", { name: /^Load PYQ plan/ }).click();
  await unsaved.page.getByRole("alert").filter({ hasText: "This browser would not save your plan" }).waitFor();
  assert.equal(await unsaved.page.evaluate((key) => localStorage.getItem(`${key}:preset`), unsaved.key), null, "A failed Load must not persist its stamp");
  await unsaved.context.close();

  const blocked = await openCalendar({ saved: "[]", denyStorage: true });
  await blocked.page.getByRole("alert").filter({ hasText: "This browser would not save your plan" }).waitFor();
  assert.equal(await blocked.page.getByRole("button", { name: /^Mark attempted:/ }).count(), todayItems.length);
  await blocked.page.getByRole("button", { name: `Mark attempted: ${todayItems[0].title}`, exact: true }).click();
  await blocked.page.getByRole("button", { name: `Mark not done: ${todayItems[0].title}`, exact: true }).waitFor();
  assert.equal(await blocked.page.evaluate((key) => localStorage.getItem(`${key}:preset`), blocked.key), null, "A failed save must not persist its stamp");
  await blocked.context.close();

  assert.deepEqual(errors, [], "No browser errors");
  console.log(`Calendar loading passed: ${todayItems.length} tests today; automatic load with a new-device notice, reload, saved progress, two profiles in one browser, no plan for Mechanical, damaged plans kept aside, intentional empty plans and storage failures.`);
} finally {
  await browser.close();
}
