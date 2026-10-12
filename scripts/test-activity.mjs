// Activity log on a throwaway database.
//   npx tsx scripts/test-activity.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-recovery-activity-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(root, "data");

const UA = {
  claude: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/2.16120.0 Chrome/152.0.7977.130 Safari/537.36",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36",
};

try {
  const [activityRoute, marksRoute, practiceRoute, activity, { getDatabase }, { SessionRepository, SESSION_COOKIE_NAME }, madeEasy] = await Promise.all([
    import("../src/app/api/activity/route.ts"),
    import("../src/app/api/marks/route.ts"),
    import("../src/app/api/made-easy/practice/route.ts"),
    import("../src/lib/server/activity.ts"),
    import("../src/lib/server/db.ts"),
    import("../src/lib/server/repositories/session-repo.ts"),
    import("../src/lib/madeeasy-import.json", { with: { type: "json" } }),
  ]);
  const owner = madeEasy.default.source.ownerUserId;
  const db = getDatabase();
  for (const id of [owner, "usr_other"]) {
    await db.prepare("INSERT INTO users (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, id, id, "2026-10-02", "2026-10-02");
  }
  const cookie = async (userId) => `${SESSION_COOKIE_NAME}=${(await SessionRepository.create(userId)).token}`;
  const ownerCookie = await cookie(owner);
  const otherCookie = await cookie("usr_other");
  const request = (url, { method = "GET", cookie: c, ua = UA.macChrome, body } = {}) => new Request(`http://localhost${url}`, {
    method,
    headers: { "user-agent": ua, ...(c ? { cookie: c } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const send = async (events, opts = {}) => {
    const res = await activityRoute.POST(request("/api/activity", { method: "POST", cookie: ownerCookie, body: { events }, ...opts }));
    return { status: res.status, body: await res.json() };
  };
  const overview = async (c = ownerCookie) => (await activityRoute.GET(request("/api/activity", { cookie: c }))).json();

  // Client labels
  assert.equal(activity.clientLabel(UA.claude), "claude-app");
  assert.equal(activity.clientLabel(UA.macChrome), "Chrome · Mac");
  assert.equal(activity.clientLabel(UA.iphone), "Safari · iPhone");
  assert.equal(activity.clientLabel(UA.android), "Chrome · Android");
  assert.equal(activity.clientLabel(null), "Browser");

  // Browser events: accepted, typed, timed back by ageMs (clamped to 10 minutes)
  let r = await send([
    { type: "page.view", targetKind: "page", targetId: "/recovery-lab/test-12" },
    { type: "me.answer.view", targetKind: "made_easy", targetId: "test-12-q02", ageMs: 5000 },
    { type: "me.practice.start", targetKind: "made_easy_test", targetId: "test-12", detail: { questions: 3, from: 1 }, ageMs: 99_999_999 },
  ], { ua: UA.iphone });
  assert.deepEqual(r, { status: 200, body: { saved: 3 } });
  const stored = await db.prepare("SELECT type, at, client FROM activity_events WHERE user_id = ? ORDER BY at").all(owner);
  assert.equal(stored.length, 3);
  assert.ok(stored.every((e) => e.client === "Safari · iPhone"));
  assert.ok(Date.now() - Date.parse(stored[0].at) <= 10 * 60 * 1000 + 5000, "ageMs is clamped to 10 minutes");
  assert.equal(stored[0].type, "me.practice.start");

  // A browser cannot send server-only events, junk targets or nested detail
  assert.equal((await send([{ type: "me.practice.answer", targetKind: "made_easy", targetId: "test-12-q01", detail: { correct: true } }])).status, 400);
  assert.equal((await send([{ type: "auth.signin" }])).status, 400);
  assert.equal((await send([{ type: "page.view", targetKind: "page", targetId: "//evil.example" }])).status, 400);
  assert.equal((await send([{ type: "page.view", targetKind: "page", targetId: "/a b" }])).status, 400);
  assert.equal((await send([{ type: "me.answer.view", targetKind: "made_easy", targetId: "../x" }])).status, 400);
  assert.equal((await send([{ type: "me.answer.view", targetKind: "elsewhere", targetId: "x" }])).status, 400);
  assert.equal((await send([{ type: "page.view", detail: { nested: { a: 1 } } }])).status, 400);
  assert.equal((await send([{ type: "page.view", detail: { "bad key": 1 } }])).status, 400);
  assert.equal((await send(Array.from({ length: 51 }, () => ({ type: "page.view" })))).status, 400);
  assert.equal((await activityRoute.POST(request("/api/activity", { method: "POST", body: { events: [{ type: "page.view" }] } }))).status, 401);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM activity_events").get()).n, 3, "rejected batches store nothing");

  // Long text is cut, not refused
  r = await send([{ type: "chatgpt.send", targetKind: "made_easy", targetId: "test-12-q05", detail: { note: "x".repeat(500) } }]);
  assert.equal(r.status, 200);
  const cut = await db.prepare("SELECT detail FROM activity_events WHERE type = 'chatgpt.send'").get();
  assert.equal(JSON.parse(cut.detail).note.length, 200);

  // Server routes log their own actions, with the client label
  let res = await marksRoute.PUT(request("/api/marks", { method: "PUT", cookie: ownerCookie, ua: UA.android, body: { kind: "made_easy", id: "test-12-q06", level: "important" } }));
  assert.equal(res.status, 200);
  res = await practiceRoute.POST(request("/api/made-easy/practice", { method: "POST", cookie: ownerCookie, body: { id: "test-12-q17", selected: "A", seconds: 2 } }));
  assert.equal(res.status, 200);
  const q17 = madeEasy.default.tests.find((t) => t.code === "test-12").attentionQuestions.find((q) => q.id === "test-12-q17");
  const served = await db.prepare("SELECT type, target_id, detail, client FROM activity_events WHERE type IN ('mark.set', 'me.practice.answer') ORDER BY at").all();
  assert.deepEqual(served.map((e) => [e.type, e.target_id, e.client]), [["mark.set", "test-12-q06", "Chrome · Android"], ["me.practice.answer", "test-12-q17", "Chrome · Mac"]]);
  assert.deepEqual(JSON.parse(served[1].detail), { selected: "A", correct: q17.correctOption === "A", seconds: 2 });
  // A failed action logs nothing
  res = await marksRoute.PUT(request("/api/marks", { method: "PUT", cookie: otherCookie, body: { kind: "made_easy", id: "test-12-q06", level: "important" } }));
  assert.equal(res.status, 403);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE user_id = 'usr_other'").get()).n, 0);

  // Logging never breaks the action it records
  await activity.logActivity(null, "no-such-user", "auth.signin");

  // Claude's testing browser is recorded but left out of what the learner sees and of coverage
  await send([{ type: "me.answer.view", targetKind: "made_easy", targetId: "test-12-q07" }], { ua: UA.claude });
  await db.prepare("INSERT INTO recovery_practice (id, user_id, question_id, content_fp, correct, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("rp1", owner, "test-12-q08", "fp", 1, 30, new Date().toISOString());
  const data = await overview();
  assert.equal(data.hiddenTestEvents, 1);
  assert.ok(data.events.every((e) => e.client !== "claude-app"));
  assert.ok(data.events.every((e, i) => i === 0 || data.events[i - 1].at >= e.at), "newest first");
  assert.ok(data.trackingSince);
  const t12 = data.coverage.find((t) => t.code === "test-12");
  const state = (n) => t12.questions.find((q) => q.number === n).state;
  assert.equal(state(8), "correct");
  assert.equal(state(17), q17.correctOption === "A" ? "correct" : "wrong");
  assert.equal(state(2), "viewed", "looked at the answer");
  assert.equal(state(6), "viewed", "marked counts as looked at");
  assert.equal(state(5), "viewed", "sent to ChatGPT counts as looked at");
  assert.equal(state(7), "untouched", "Claude's testing view does not count");
  const counts = Object.values(t12.counts).reduce((a, b) => a + b, 0);
  assert.equal(counts, t12.questions.length);
  assert.deepEqual(data.coverage.map((t) => t.code), [...data.coverage.map((t) => t.code)].sort());

  // Another account sees only its own log and has no Made Easy coverage
  const other = await overview(otherCookie);
  assert.deepEqual(other.events, []);
  assert.equal(other.coverage, null);

  // Rate limit: at most 300 events a minute per account
  const now = new Date().toISOString();
  for (let i = 0; i < 300; i++) {
    await db.prepare("INSERT INTO activity_events (id, user_id, at, type, detail, client) VALUES (?, ?, ?, ?, ?, ?)").run(`flood${i}`, "usr_other", now, "page.view", "{}", "x");
  }
  const flood = await activityRoute.POST(request("/api/activity", { method: "POST", cookie: otherCookie, body: { events: [{ type: "page.view" }] } }));
  assert.equal(flood.status, 429);

  console.log("Activity log: labels, browser/server split, validation, logging never breaks actions, test traffic hidden, coverage and rate limit all hold.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
