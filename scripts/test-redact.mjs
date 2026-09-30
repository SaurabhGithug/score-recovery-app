// Run with: npx tsx scripts/test-redact.mjs
// Clean (key-free) PYP crops: the importer records only verified clean crops, the paper view
// exposes only clean image URLs before submit, clean crops are served to any signed-in learner
// while original crops stay locked until the learner commits, and path traversal stays blocked.
// Uses a throwaway SQLite database and crop folders in a temp directory.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-test-"));
process.chdir(workDir); // getDatabase() and the crop roots resolve from cwd on first use

// Two distinct valid PNGs (1x1), so an original and its clean crop are distinguishable.
const PNG_ORIG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_CLEAN = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAG7buVgAAAABJRU5ErkJggg==", "base64");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const PARSED = path.join(workDir, "data/pyp-sources/parsed");
const CROPS = path.join(workDir, "data/storage/pyp-crops");
const CLEAN = path.join(workDir, "data/storage/pyp-crops-clean");
fs.mkdirSync(PARSED, { recursive: true });
const KEY = "sscje-civil-P1-2024-06-05-0900-en";
const manifest = {};

function crop(pos, { clean = "ok", originalOk = true } = {}) {
  fs.mkdirSync(path.join(CROPS, KEY), { recursive: true });
  fs.mkdirSync(path.join(CLEAN, KEY), { recursive: true });
  fs.writeFileSync(path.join(CROPS, KEY, `${pos}.png`), PNG_ORIG);
  const rel = `${KEY}/${pos}.png`;
  if (clean === "none") return `data/storage/pyp-crops/${rel}`;
  fs.writeFileSync(path.join(CLEAN, KEY, `${pos}.png`), PNG_CLEAN);
  manifest[rel] = {
    status: clean === "failed" ? "failed" : "ok",
    crop_sha256: clean === "stale" ? sha(Buffer.from("an older crop")) : sha(PNG_ORIG),
    clean_sha256: clean === "swapped" ? sha(Buffer.from("another file")) : sha(PNG_CLEAN),
    // pyp-redact: the ORIGINAL crop holds one question and no candidate / print data
    original_ok: clean === "ok-orig-unproven" ? false : originalOk,
    ocr_chars: 120,
  };
  return `data/storage/pyp-crops/${rel}`;
}

// Q1 ok, Q2 ok, Q3 redaction failed (a leftover file must not be used), Q4 original crop changed
// since redaction (stale), Q5 clean file differs from the one the redactor wrote, Q6 no clean crop,
// Q7 clean crop verified but the ORIGINAL not proven free of candidate / print data (original_ok false).
const CASES = ["ok", "ok", "failed", "stale", "swapped", "none", "ok-orig-unproven"];
const questions = CASES.map((clean, i) => ({
  position: i + 1,
  printed_number: i + 1,
  section: "General Engineering",
  stem: i === 0 ? "" : `Stem ${i + 1}`, // Q1: garbled/empty text, attempted from the image
  options: ["A", "B", "C", "D"].map((id, k) => ({ id, printed_number: k + 1, text: `opt ${k + 1}` })),
  ssc_question_id: `700${i + 1}`,
  ssc_option_ids: [1, 2, 3, 4].map((k) => `700${i + 1}${k}`),
  key: { option_id: "B", basis: "text_colour+icon" },
  page: 1,
  crop: crop(i + 1, { clean }),
  has_figure: i === 1,
  text_quality: i === 0 ? "garbled" : "text_layer",
  language: "en",
  warnings: [],
}));
fs.writeFileSync(
  path.join(PARSED, "en-2024-06-05-S1.json"),
  JSON.stringify({
    schema: 1,
    source: { file: "data/pyp-sources/careerpower/en.pdf", sha256: "0".repeat(64), publisher: "careerpower", source_url: null },
    paper: { header_title: "Junior Engineer Civil Examination 2024 Paper I", cycle_year: 2024, paper: "P1", exam_date: "2024-06-05", exam_time: "09:00-11:00", subject: "Civil", language: "en", paper_key: KEY },
    sections: [{ name: "General Engineering", first_position: 1, count: CASES.length }],
    questions,
    diagnostics: { warnings: [] },
  })
);
fs.writeFileSync(path.join(CLEAN, "_manifest.json"), JSON.stringify(manifest));

// ------------------------------------------------------------------ modules
const { importPypDirectory } = await import("../src/lib/server/bank/import-pyp.ts");
const { UserRepository } = await import("../src/lib/server/repositories/user-repo.ts");
const { SessionRepository } = await import("../src/lib/server/repositories/session-repo.ts");
const { BankRepository } = await import("../src/lib/server/repositories/bank-repo.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");
const paperRoute = await import("../src/app/api/bank/papers/[id]/route.ts");
const attemptsRoute = await import("../src/app/api/bank/attempts/route.ts");
const submitRoute = await import("../src/app/api/bank/attempts/[id]/submit/route.ts");
const checkRoute = await import("../src/app/api/bank/attempts/[id]/check/route.ts");
const reviewRoute = await import("../src/app/api/bank/attempts/[id]/review/route.ts");
const assetsRoute = await import("../src/app/api/bank/assets/[...path]/route.ts");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}
function session(name) {
  const { user } = UserRepository.register(name, "correct horse battery");
  const { token } = SessionRepository.create(user.id);
  return { user, cookie: `score_recovery_session=${encodeURIComponent(token)}` };
}
const A = session("Learner A");
const B = session("Learner B");
function request(url, { cookie, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function call(handler, url, opts = {}, params = {}) {
  const res = await handler(request(url, opts), { params: Promise.resolve(params) });
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, body };
}
const asset = (segments, cookie = A.cookie) => call(assetsRoute.GET, `/api/bank/assets/${segments.join("/")}`, { cookie }, { path: segments });
const PAPER = "sscje-civil-p1-2024-06-05-0900";
const qid = (n) => `${PAPER}-q700${n}`;
const cleanUrl = (n) => `/api/bank/assets/clean/${KEY}/${n}.png?v=${sha(PNG_CLEAN).slice(0, 12)}`;
const origUrl = (n) => `/api/bank/assets/${KEY}/${n}.png?v=${sha(PNG_ORIG).slice(0, 12)}`;

// ------------------------------------------------------------------ importer
await test("importer: records metadata.clean_crop only for a passed, current, unmodified clean crop", () => {
  const report = importPypDirectory();
  assert.equal(report.papers.length, 1);
  assert.equal(report.papers[0].cleanCrops, 3);
  const qs = BankRepository.listQuestions(PAPER);
  assert.deepEqual(
    qs.map((q) => q.metadata.clean_crop ?? null),
    [`${KEY}/1.png`, `${KEY}/2.png`, null, null, null, null, `${KEY}/7.png`]
  );
  assert.deepEqual(
    qs.map((q) => q.metadata.original_crop_ok === true),
    [true, true, false, false, false, false, false],
    "original servable only with a verified clean twin AND original_ok"
  );
  // idempotent
  importPypDirectory();
  assert.deepEqual(BankRepository.listQuestions(PAPER).map((q) => q.metadata.clean_crop ?? null), qs.map((q) => q.metadata.clean_crop ?? null));
});

await test("GET /papers/[id]: before submit only clean image URLs, never an original crop", async () => {
  const detail = await call(paperRoute.GET, `/api/bank/papers/${PAPER}`, { cookie: A.cookie }, { id: PAPER });
  assert.equal(detail.status, 200);
  const text = JSON.stringify(detail.body);
  assert.doesNotMatch(text, /\/api\/bank\/assets\/(?!clean\/)/, "no original-crop URL before submit");
  assert.doesNotMatch(text, /pyp-crops|clean_crop/);
  const byPos = new Map(detail.body.questions.map((q) => [q.position, q]));
  assert.equal(byPos.get(1).imageUrl, cleanUrl(1), "garbled question is attemptable from its clean crop");
  assert.equal(byPos.get(1).cleanImageUrl, cleanUrl(1));
  assert.equal(byPos.get(2).imageUrl, cleanUrl(2));
  assert.equal(byPos.get(7).imageUrl, cleanUrl(7));
  for (const pos of [3, 4, 5, 6]) {
    assert.equal(byPos.get(pos).imageUrl, null, `Q${pos}: no verified clean crop ⇒ no image before submit`);
    assert.equal(byPos.get(pos).cleanImageUrl, undefined);
  }
});

await test("assets: clean crop served to any signed-in learner before submit; original refused", async () => {
  for (const who of [A, B]) {
    const res = await asset(["clean", KEY, "1.png"], who.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.equals(PNG_CLEAN), "the clean file, not the original");
    assert.equal((await asset([KEY, "1.png"], who.cookie)).status, 404, "original shows the key: locked before commitment");
  }
  assert.equal((await asset(["clean", KEY, "1.png"], "")).status, 401, "signed out");
  // a file in the clean root that the importer did not record (failed / stale / swapped) is not served
  for (const pos of [3, 4, 5]) assert.equal((await asset(["clean", KEY, `${pos}.png`])).status, 404, `Q${pos}`);
  assert.equal((await asset(["clean", KEY, "6.png"])).status, 404, "no clean file at all");
});

await test("assets: traversal, encoded, absolute, symlink and non-PNG paths blocked on the clean route", async () => {
  fs.writeFileSync(path.join(workDir, "data/storage/secret.png"), PNG_ORIG);
  for (const segs of [
    ["clean"],
    ["clean", "..", "secret.png"],
    ["clean", "..", "pyp-crops", KEY, "1.png"], // original crop through the clean route
    ["clean", KEY, "..", "..", "secret.png"],
    ["clean", "%2e%2e", "secret.png"],
    ["clean", "..%2fsecret.png"],
    ["clean", "/etc/passwd"],
    ["clean", path.join(workDir, "data/storage/secret.png")],
    ["clean", KEY, "1.txt"],
    ["clean", "_manifest.json"],
    ["clean", "clean", KEY, "1.png"],
  ]) {
    assert.equal((await asset(segs)).status, 404, JSON.stringify(segs));
  }
  // a registered clean path that is a symlink escaping the clean root
  fs.symlinkSync(path.join(workDir, "data/storage/secret.png"), path.join(CLEAN, KEY, "link.png"));
  const db = getDatabase();
  const row = db.prepare("SELECT visual_path, metadata FROM bank_questions WHERE id = ?").get(qid(2));
  const meta = JSON.parse(row.metadata);
  db.prepare("UPDATE bank_questions SET visual_path = ?, metadata = ? WHERE id = ?").run(`${KEY}/link.png`, JSON.stringify({ ...meta, clean_crop: `${KEY}/link.png` }), qid(2));
  assert.equal((await asset(["clean", KEY, "link.png"])).status, 404, "symlink escaping the clean root");
  db.prepare("UPDATE bank_questions SET visual_path = ?, metadata = ? WHERE id = ?").run(row.visual_path, row.metadata, qid(2));
  // metadata naming a different crop than visual_path is ignored
  db.prepare("UPDATE bank_questions SET metadata = ? WHERE id = ?").run(JSON.stringify({ ...meta, clean_crop: `${KEY}/2.png`, }), qid(3));
  assert.equal((await asset(["clean", KEY, "3.png"])).status, 404);
  const d = await call(paperRoute.GET, `/api/bank/papers/${PAPER}`, { cookie: A.cookie }, { id: PAPER });
  assert.equal(d.body.questions.find((q) => q.position === 3).imageUrl, null, "clean_crop must equal visual_path");
  db.prepare("UPDATE bank_questions SET metadata = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(db.prepare("SELECT metadata FROM bank_questions WHERE id = ?").get(qid(3)).metadata), clean_crop: null }), qid(3));
});

await test("practice /check and review after submit: original crop (key shown) plus the clean one", async () => {
  const pr = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "practice" } });
  const pid = pr.body.attempt.id;
  const c = await call(checkRoute.POST, `/api/bank/attempts/${pid}/check`, { cookie: A.cookie, method: "POST", body: { questionId: qid(1), answer: "B" } }, { id: pid });
  assert.equal(c.status, 200);
  assert.equal(c.body.imageUrl, origUrl(1));
  assert.equal((await asset([KEY, "1.png"])).status, 200, "original served once checked");
  assert.equal((await asset([KEY, "2.png"])).status, 404, "but not for an unchecked question");
  // Q7: clean crop verified, original NOT proven free of candidate / print data
  const c7 = await call(checkRoute.POST, `/api/bank/attempts/${pid}/check`, { cookie: A.cookie, method: "POST", body: { questionId: qid(7), answer: "B" } }, { id: pid });
  assert.equal(c7.status, 200);
  assert.equal(c7.body.imageUrl, cleanUrl(7), "original_ok false: the check returns the clean crop, not the original");
  assert.equal((await asset([KEY, "7.png"])).status, 404, "original_ok false: the original stays locked even after a check");

  const st = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: B.cookie, method: "POST", body: { paperId: PAPER, mode: "full" } });
  const id = st.body.attempt.id;
  const responses = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [qid(n), { answer: "B", seconds: 10, visits: 1, changes: 0, marked: false }]));
  assert.equal((await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: B.cookie, method: "POST", body: { responses } }, { id })).status, 200);
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${id}/review`, { cookie: B.cookie }, { id });
  assert.equal(rv.status, 200);
  const q1 = rv.body.questions.find((q) => q.position === 1);
  const q6 = rv.body.questions.find((q) => q.position === 6);
  const q7 = rv.body.questions.find((q) => q.position === 7);
  assert.equal(q1.imageUrl, origUrl(1));
  assert.equal(q1.cleanImageUrl, cleanUrl(1));
  // Q6 has no verified clean crop, so nothing proves its original free of candidate data
  assert.equal(q6.imageUrl, null, "no verified clean twin: the original is never served");
  assert.equal(q6.cleanImageUrl, undefined);
  assert.equal(q7.imageUrl, cleanUrl(7), "original_ok false: review shows the clean crop");
  assert.equal((await asset([KEY, "6.png"], B.cookie)).status, 404, "unproven original locked after submit");
  assert.equal((await asset([KEY, "7.png"], B.cookie)).status, 404, "original_ok false: locked after submit");
  const orig = await asset([KEY, "2.png"], B.cookie);
  assert.equal(orig.status, 200, "original served after submit");
  assert.ok(orig.body.equals(PNG_ORIG));
});

console.log(`\n${passed} redact tests passed`);
fs.rmSync(workDir, { recursive: true, force: true });
