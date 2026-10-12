// Question marks (Revise / Important / Super important) on a throwaway database.
//   npx tsx scripts/test-question-marks.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-recovery-marks-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(root, "data");

try {
  const [route, { getDatabase }, { SessionRepository, SESSION_COOKIE_NAME }, madeEasy] = await Promise.all([
    import("../src/app/api/marks/route.ts"),
    import("../src/lib/server/db.ts"),
    import("../src/lib/server/repositories/session-repo.ts"),
    import("../src/lib/madeeasy-import.json", { with: { type: "json" } }),
  ]);
  const owner = madeEasy.default.source.ownerUserId;
  const db = getDatabase();
  for (const id of [owner, "usr_someone_else"]) {
    await db.prepare("INSERT INTO users (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, id, id, "2026-10-02", "2026-10-02");
  }
  const cookieFor = async (userId) => `${SESSION_COOKIE_NAME}=${(await SessionRepository.create(userId)).token}`;
  const ownerCookie = await cookieFor(owner);
  const otherCookie = await cookieFor("usr_someone_else");

  const call = async (method, cookie, { query = "", body } = {}) => {
    const res = await route[method](new Request(`http://localhost/api/marks${query}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }));
    return { status: res.status, body: await res.json() };
  };
  const put = (cookie, body) => call("PUT", cookie, { body });
  const one = (cookie, id) => call("GET", cookie, { query: `?kind=made_easy&id=${id}` });
  const list = (cookie) => call("GET", cookie);

  // Nothing marked yet
  assert.deepEqual((await one(ownerCookie, "test-11-q01")).body, { mark: null });

  // Mark, change level, add a note, change level again (note kept), then replace the note
  let r = await put(ownerCookie, { kind: "made_easy", id: "test-11-q01", level: "important" });
  assert.equal(r.status, 200);
  assert.equal(r.body.mark.level, "important");
  assert.equal(r.body.mark.note, "");
  r = await put(ownerCookie, { kind: "made_easy", id: "test-11-q01", level: "super_important", note: "  Options A and B are identical on the portal  " });
  assert.equal(r.body.mark.level, "super_important");
  assert.equal(r.body.mark.note, "Options A and B are identical on the portal", "note is trimmed");
  r = await put(ownerCookie, { kind: "made_easy", id: "test-11-q01", level: "revise" });
  assert.equal(r.body.mark.note, "Options A and B are identical on the portal", "changing only the level keeps the note");
  r = await put(ownerCookie, { kind: "made_easy", id: "test-11-q01", level: "super_important", note: "" });
  assert.equal(r.body.mark.note, "", "an explicit empty note replaces it");
  const created = r.body.mark.createdAt;
  assert.equal((await one(ownerCookie, "test-11-q01")).body.mark.createdAt, created, "one row per question");

  // The marked list: most important first, with the question as the owner sees it
  await put(ownerCookie, { kind: "made_easy", id: "test-06-q03", level: "revise", note: "coding" });
  await put(ownerCookie, { kind: "made_easy", id: "test-09-q01", level: "important" });
  r = await list(ownerCookie);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.marks.map((m) => [m.id, m.level]), [["test-11-q01", "super_important"], ["test-09-q01", "important"], ["test-06-q03", "revise"]]);
  const top = r.body.marks[0];
  assert.equal(top.unavailable, null);
  assert.match(top.view.heading, /Made Easy Test 11, Q1/);
  assert.match(top.view.question, /conical bar/);
  assert.ok(top.view.questionHtml?.includes("conical bar"), "portal HTML is kept for figures");
  assert.equal(top.view.options.length, 4);
  assert.ok(top.view.options.every((o) => o.html));
  assert.match(top.view.key, /^A /);
  assert.equal(top.view.learnerAnswer, "B");
  assert.ok(top.view.explanationHtml?.includes("<img"));

  // Another account can neither mark nor see the owner's Made Easy questions, nor the owner's marks
  r = await put(otherCookie, { kind: "made_easy", id: "test-11-q01", level: "important" });
  assert.equal(r.status, 403);
  assert.deepEqual((await list(otherCookie)).body, { marks: [] });
  assert.deepEqual((await one(otherCookie, "test-11-q01")).body, { mark: null });

  // Validation
  assert.equal((await put(ownerCookie, { kind: "made_easy", id: "test-11-q02" })).status, 400, "level is required");
  assert.equal((await put(ownerCookie, { kind: "made_easy", id: "test-11-q02", level: "urgent" })).status, 400);
  assert.equal((await put(ownerCookie, { kind: "notes", id: "test-11-q02", level: "revise" })).status, 400);
  assert.equal((await put(ownerCookie, { kind: "made_easy", id: "../etc", level: "revise" })).status, 400);
  assert.equal((await put(ownerCookie, { kind: "made_easy", id: "test-11-q02", level: "revise", note: "x".repeat(1001) })).status, 400);
  assert.equal((await put(ownerCookie, { kind: "made_easy", id: "test-11-q02", level: "revise", note: 5 })).status, 400);
  assert.equal((await put(ownerCookie, { kind: "made_easy", id: "test-99-q01", level: "revise" })).status, 404);
  assert.equal((await put(ownerCookie, { kind: "bank", id: "no-such-question", level: "revise" })).status, 404);
  assert.equal((await put(null, { kind: "made_easy", id: "test-11-q01", level: "revise" })).status, 401);
  assert.equal((await list(null)).status, 401);
  assert.equal((await list(ownerCookie)).body.marks.length, 3, "rejected requests changed nothing");

  // A mark on a question that is no longer visible stays listed but says why
  await db.prepare("INSERT INTO question_marks (id, user_id, source_kind, source_id, level, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("mark_orphan", owner, "made_easy", "test-99-q01", "revise", "", "2026-10-01", "2026-10-01");
  const orphan = (await list(ownerCookie)).body.marks.find((m) => m.id === "test-99-q01");
  assert.equal(orphan.view, null);
  assert.match(orphan.unavailable, /No such Made Easy question/);

  // The database refuses levels and sources outside the list even if code is bypassed
  await assert.rejects(() => db.prepare("INSERT INTO question_marks (id, user_id, source_kind, source_id, level, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("mark_bad", owner, "made_easy", "test-11-q05", "urgent", "", "x", "x"));

  // Clearing deletes the mark
  r = await put(ownerCookie, { kind: "made_easy", id: "test-11-q01", level: null });
  assert.deepEqual(r.body, { mark: null });
  assert.deepEqual((await one(ownerCookie, "test-11-q01")).body, { mark: null });

  console.log("Question marks: set, change, note kept/replaced, ordering, owner-only, validation, orphan and clear all hold.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
