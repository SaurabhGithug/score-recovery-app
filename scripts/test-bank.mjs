// Run with: npx tsx scripts/test-bank.mjs
// Question bank (DECISION-002): importer, scoring, routes and isolation. Uses a throwaway SQLite
// database and crop folder in a temp directory — never touches data/score_recovery.db.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bank-test-"));
process.chdir(workDir); // getDatabase() and the crop root resolve from cwd on first use

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const PARSED = path.join(workDir, "data/pyp-sources/parsed");
const CROPS = path.join(workDir, "data/storage/pyp-crops");
fs.mkdirSync(PARSED, { recursive: true });
fs.mkdirSync(CROPS, { recursive: true });

// ------------------------------------------------------------------ fixtures
function crop(key, pos) {
  fs.mkdirSync(path.join(CROPS, key), { recursive: true });
  fs.writeFileSync(path.join(CROPS, key, `${pos}.png`), PNG);
  return `data/storage/pyp-crops/${key}/${pos}.png`;
}
function opts(texts) {
  return texts.map((text, i) => ({ id: "ABCD"[i], printed_number: i + 1, text }));
}
function q(position, section, stem, texts, extra = {}) {
  return {
    position,
    printed_number: position,
    section,
    stem,
    options: opts(texts),
    ssc_question_id: null,
    ssc_option_ids: null,
    key: { option_id: null, basis: "none" },
    page: 1,
    crop: null,
    has_figure: false,
    text_quality: "text_layer",
    language: "en",
    warnings: [],
    ...extra,
  };
}
function file(name, { paper = "P1", date, time, language, sections, questions, publisher = "adda247", sha }) {
  const data = {
    schema: 1,
    source: { file: `data/pyp-sources/${publisher}/${name}.pdf`, sha256: sha ?? name.padEnd(64, "0"), publisher, source_url: null },
    paper: { header_title: "Junior Engineer (Civil) Examination 2023 Paper-I", cycle_year: 2023, paper, exam_date: date, exam_time: time, subject: "Civil", language, paper_key: name },
    sections,
    questions,
    diagnostics: { warnings: [] },
  };
  fs.writeFileSync(path.join(PARSED, `${name}.json`), JSON.stringify(data));
}

// Identity 1: English + Hindi response sheets of one shift (different candidates: shuffled order).
const EN = [
  ["Which cement is used under water?", ["Hydraulic lime", "Fat lime", "Quick lime", "Pure lime"], "A"],
  ["Unit of stress?", ["N/m²", "N", "N·m", "J"], "B"],
  ["Slump test measures?", ["Strength", "Setting", "Workability", "Density"], "C"],
  ["Series: 2, 4, 8, ?", ["10", "12", "14", "16"], "D"],
  ["Capital of India?", ["New Delhi", "Mumbai", "Kolkata", "Chennai"], "A"],
];
const SECTIONS_EN = [
  { name: "General Engineering", first_position: 1, count: 3 },
  { name: "Reasoning", first_position: 4, count: 2 },
];
const sscOpt = (i) => [`${i}1`, `${i}2`, `${i}3`, `${i}4`];
file("en-2024-06-05-S1", {
  date: "2024-06-05",
  time: "09:00-11:00",
  language: "en",
  publisher: "careerpower",
  sections: SECTIONS_EN,
  questions: EN.map(([stem, texts, key], i) =>
    q(i + 1, i < 3 ? "General Engineering" : "Reasoning", stem, texts, {
      ssc_question_id: `900${i + 1}`,
      ssc_option_ids: sscOpt(i + 1),
      key: { option_id: key, basis: "text_colour+icon" },
      crop: crop("sscje-civil-P1-2024-06-05-0900-en", i + 1),
      has_figure: i === 1,
      page: 10 + i,
    })
  ),
});
// Hindi sheet: Q2 and Q1 swapped in position; Q2's options printed in another order; Q3's tick is
// on a different option (disagreement ⇒ disputed); Q4 garbled; Q5 has no key.
const hi = (i, pos, section, stem, texts, optionOrder, key, extra = {}) =>
  q(pos, section, stem, optionOrder.map((k) => texts[k]), {
    ssc_question_id: `900${i + 1}`,
    ssc_option_ids: optionOrder.map((k) => sscOpt(i + 1)[k]),
    key: { option_id: key, basis: key ? "text_colour+icon" : "none" },
    crop: crop("sscje-civil-P1-2024-06-05-0900-hi", pos),
    language: "hi",
    page: 20 + pos,
    ...extra,
  });
const HI_TEXTS = [
  ["हाइड्रोलिक चूना", "फैट चूना", "क्विक चूना", "शुद्ध चूना"],
  ["N/m²", "N", "N·m", "J"],
  ["सामर्थ्य", "जमाव", "कार्यशीलता", "घनत्व"],
  ["10", "12", "14", "16"],
  ["नई दिल्ली", "मुंबई", "कोलकाता", "चेन्नई"],
];
file("hi-2024-06-05-S1", {
  date: "2024-06-05",
  time: "09:00-11:00",
  language: "hi",
  sections: [
    { name: "सामान्य अभियांत्रिकी", first_position: 1, count: 3 },
    { name: "तर्कशक्ति", first_position: 4, count: 2 },
  ],
  questions: [
    // position 1 = Q2 with options printed D,C,B,A → SSC key "B" (N) is printed 3rd ⇒ letter C
    hi(1, 1, "सामान्य अभियांत्रिकी", "प्रतिबल की इकाई?", HI_TEXTS[1], [3, 2, 1, 0], "C"),
    hi(0, 2, "सामान्य अभियांत्रिकी", "पानी के नीचे कौन सा चूना?", HI_TEXTS[0], [0, 1, 2, 3], "A"),
    hi(2, 3, "सामान्य अभियांत्रिकी", "स्लंप परीक्षण क्या मापता है?", HI_TEXTS[2], [0, 1, 2, 3], "A"), // disagrees (EN says C)
    hi(3, 4, "तर्कशक्ति", "िनि त ?", HI_TEXTS[3], [0, 1, 2, 3], "D", { text_quality: "garbled" }),
    hi(4, 5, "तर्कशक्ति", "भारत की राजधानी?", HI_TEXTS[4], [0, 1, 2, 3], null),
  ],
});

// Identity 2: an older QID-layout paper (no SSC ids), Adda247 + Career Power copies.
const QID = [
  ["For construction under water, the type of lime used is", ["hydraulic lime", "fat lime", "quick lime", "pure lime"], "A"],
  ["The bulking of sand is maximum at a moisture content of about", ["2 percent", "4 percent", "6 percent", "10 percent"], "B"],
  ["The minimum grade of concrete for RCC as per IS 456 is", ["M15", "M20", "M25", "M30"], "B"],
  ["Which of the following is a non-renewable resource of energy", ["coal", "wind", "solar", "tidal"], "A"],
  ["Who wrote the national anthem of India in Bengali", ["Tagore", "Bankim", "Sarojini", "Iqbal"], "A"],
];
const QID_SECTIONS = [{ name: "General Engineering", first_position: 1, count: 5 }];
file("qid-adda-2017-03-02", {
  date: "2017-03-02",
  time: null,
  language: "en",
  sections: QID_SECTIONS,
  questions: QID.map(([stem, texts, key], i) =>
    q(i + 1, "General Engineering", stem, texts, { key: { option_id: key, basis: "answer_text" }, crop: crop("sscje-civil-P1-2017-03-02-notime-en", i + 1) })
  ),
});
file("qid-cp-2017-03-02", {
  date: "2017-03-02",
  time: null,
  language: "en",
  publisher: "careerpower",
  sections: QID_SECTIONS,
  questions: QID.map(([stem, texts, key], i) => {
    if (i === 0) {
      // same question, options printed in another order: "hydraulic lime" is printed 3rd ⇒ letter C
      return q(1, "General Engineering", stem, [texts[2], texts[1], texts[0], texts[3]], { key: { option_id: "C", basis: "answer_text" } });
    }
    if (i === 4) return q(5, "General Engineering", "Completely different stem about surveying chains and links", texts, { key: { option_id: "D", basis: "answer_text" } });
    return q(i + 1, "General Engineering", stem, texts, { key: { option_id: key, basis: "answer_text" } });
  }),
});
// Same identity, Hindi, no SSC ids: cannot be proven to match ⇒ not merged.
file("qid-hi-2017-03-02", {
  date: "2017-03-02",
  time: null,
  language: "hi",
  sections: QID_SECTIONS,
  questions: QID.map(([, texts, key], i) => q(i + 1, "General Engineering", `हिंदी प्रश्न ${i + 1}`, texts, { key: { option_id: key, basis: "answer_text" }, language: "hi" })),
});
// A layout without section headings, and one whose paper number could not be read.
file("nosection-2019-09-23", {
  date: "2019-09-23",
  time: "10:00-",
  language: "en",
  sections: [{ name: null, first_position: 1, count: 2 }],
  questions: [q(1, null, "Stem one about levelling", ["a", "b", "c", "d"]), q(2, null, "Stem two about chaining", ["a", "b", "c", "d"])],
});
file("unknown-paper-2020-10-28", { paper: null, date: "2020-10-28", time: "15:00-17:00", language: "en", sections: QID_SECTIONS, questions: [q(1, "General Engineering", "x", ["a", "b", "c", "d"])] });
fs.writeFileSync(path.join(PARSED, "_summary.json"), JSON.stringify({ not: "a paper" }));

// pyp-redact's manifest for the 2024 English crops: every clean crop verified; the ORIGINAL of
// Q4 failed redact's one-question / no-candidate-data check (original_ok false), so it is never served.
const CLEAN = path.join(workDir, "data/storage/pyp-crops-clean");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const cleanManifest = {};
for (let pos = 1; pos <= 5; pos++) {
  const rel = `sscje-civil-P1-2024-06-05-0900-en/${pos}.png`;
  fs.mkdirSync(path.dirname(path.join(CLEAN, rel)), { recursive: true });
  fs.writeFileSync(path.join(CLEAN, rel), PNG);
  cleanManifest[rel] = { status: "ok", crop_sha256: sha(PNG), clean_sha256: sha(PNG), original_ok: pos !== 4, ocr_chars: 120 };
}
fs.writeFileSync(path.join(CLEAN, "_manifest.json"), JSON.stringify(cleanManifest));

// ------------------------------------------------------------------ modules
const { importPypDirectory } = await import("../src/lib/server/bank/import-pyp.ts");
const { UserRepository } = await import("../src/lib/server/repositories/user-repo.ts");
const { SessionRepository } = await import("../src/lib/server/repositories/session-repo.ts");
const { BankRepository } = await import("../src/lib/server/repositories/bank-repo.ts");
const { getDatabase } = await import("../src/lib/server/db.ts");
const { contentFingerprint } = await import("../src/lib/server/bank/content-fp.ts");
const { learnerCommitted } = await import("../src/lib/server/bank/commitment.ts");
const { presentable } = await import("../src/lib/server/bank/presentable.ts");
const viewsModule = await import("../src/lib/server/bank/views.ts");
const { paperCodeFromTitle: importTitleCode, testbookPaperId } = await import("../src/lib/server/bank/import-testbook.ts");
const papersRoute = await import("../src/app/api/bank/papers/route.ts");
const paperRoute = await import("../src/app/api/bank/papers/[id]/route.ts");
const attemptsRoute = await import("../src/app/api/bank/attempts/route.ts");
const attemptRoute = await import("../src/app/api/bank/attempts/[id]/route.ts");
const submitRoute = await import("../src/app/api/bank/attempts/[id]/submit/route.ts");
const checkRoute = await import("../src/app/api/bank/attempts/[id]/check/route.ts");
const reviewRoute = await import("../src/app/api/bank/attempts/[id]/review/route.ts");
const resolveRoute = await import("../src/app/api/bank/questions/[id]/resolve/route.ts");
const aiStatusRoute = await import("../src/app/api/bank/ai-status/route.ts");
const assetsRoute = await import("../src/app/api/bank/assets/[...path]/route.ts");
const testbookRoute = await import("../src/app/api/bank/import/testbook/route.ts");

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
const TB = testbookPaperId(A.user.id, "tb-test-77");

function request(url, { cookie, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
const ctx = (params) => ({ params: Promise.resolve(params) });
async function call(handler, url, opts = {}, params = {}) {
  const res = await handler(request(url, opts), ctx(params));
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, body, headers: res.headers };
}
const resp = (answer, extra = {}) => ({ answer, seconds: 30, visits: 1, changes: 0, marked: false, ...extra });

const PAPER = "sscje-civil-p1-2024-06-05-0900";
const QIDP = "sscje-civil-p1-2017-03-02-notime";
const qid = (n) => `${PAPER}-q900${n}`;

// ------------------------------------------------------------------ importer
let report;
await test("importer: EN+HI sheets of one shift merge into one paper by SSC question id", () => {
  report = importPypDirectory();
  const p = report.papers.find((x) => x.paperId === PAPER);
  assert.ok(p, "paper imported");
  assert.equal(p.questions, 5);
  assert.deepEqual(p.languages, ["en", "hi"]);
  assert.deepEqual(p.files.map((f) => [f.role, f.method, f.matched]), [["primary", null, 5], ["merged", "ssc_question_id", 5]]);
  const qs = BankRepository.listQuestions(PAPER);
  assert.deepEqual(qs.map((x) => x.id), [1, 2, 3, 4, 5].map(qid));
  assert.equal(qs[0].stem, EN[0][0], "English is the primary text");
  assert.equal(qs[1].hasVisual, true);
  assert.equal(qs[0].visualPath, "sscje-civil-P1-2024-06-05-0900-en/1.png");
});

await test("importer: option order mapped through SSC option ids; one disagreeing tick ⇒ disputed", () => {
  const ev = BankRepository.loadEvidenceForPapers([PAPER], "");
  const q2 = ev.get(qid(2));
  assert.equal(q2.length, 2);
  assert.deepEqual(q2.map((e) => e.answer), ["B", "B"], "HI printed letter C maps back to option B");
  assert.ok(q2.every((e) => e.authority === "ssc_response_sheet" && e.sourceGroup === "ssc"));
  assert.match(q2.find((e) => e.detail.parsed.startsWith("en")).sourceLabel, /^SSC response-sheet tick — Career Power PDF en-2024-06-05-S1\.pdf, p\.11 \(likely the provisional key\)$/);
  assert.equal(BankRepository.resolveKeyFor(qid(2), A.user.id).status, "official");
  assert.equal(BankRepository.resolveKeyFor(qid(3), A.user.id).status, "disputed");
  assert.equal(ev.get(qid(5)).length, 1, "HI key null ⇒ no row from that file");
  const p = report.papers.find((x) => x.paperId === PAPER);
  assert.deepEqual(p.keyStatus, { official: 4, disputed: 1 });
});

await test("importer: Hindi goes to translations.hi (garbled Hindi is kept but not exposed)", async () => {
  const q1 = BankRepository.getQuestion(qid(1));
  assert.equal(q1.metadata.translations.hi.stem, "पानी के नीचे कौन सा चूना?");
  const q2 = BankRepository.getQuestion(qid(2));
  assert.deepEqual(q2.metadata.translations.hi.options.map((o) => o.text), HI_TEXTS[1], "translated options follow the primary option ids");
  const { body } = await call(paperRoute.GET, `/api/bank/papers/${PAPER}`, { cookie: A.cookie }, { id: PAPER });
  assert.equal(body.questions[0].translations.hi.options[0].text, "हाइड्रोलिक चूना");
  assert.equal(body.questions[3].translations, undefined, "garbled translation withheld");
});

await test("importer: position match needs text agreement; option order mapped by text; unmatched reported", () => {
  const p = report.papers.find((x) => x.paperId === QIDP);
  assert.ok(p);
  assert.equal(p.questions, 5);
  assert.deepEqual(p.files.map((f) => [f.role, f.method, f.matched]), [["primary", null, 5], ["merged", "position+text", 4]]);
  assert.equal(p.unmatched.length, 1);
  assert.equal(p.unmatched[0].position, 5);
  const ev = BankRepository.loadEvidenceForPapers([QIDP], "");
  assert.deepEqual(ev.get(`${QIDP}-p1`).map((e) => e.answer), ["A", "A"], "Career Power's printed C is option A's text");
  assert.equal(ev.get(`${QIDP}-p5`).length, 1, "unmatched question's key not merged");
  assert.match(ev.get(`${QIDP}-p1`)[0].sourceLabel, /"Correct Answer" line/);
  assert.ok(report.skippedFiles.some((s) => s.file === "qid-hi-2017-03-02.json" && /another language without SSC ids/.test(s.reason)));
  assert.ok(!report.skippedFiles.some((s) => s.file === "_summary.json"), "_summary.json is ignored, not reported");
  assert.ok(report.skippedFiles.some((s) => s.file === "unknown-paper-2020-10-28.json" && /paper number unknown/.test(s.reason)));
  const ns = report.papers.find((x) => x.paperId === "sscje-civil-p1-2019-09-23-1000");
  assert.equal(ns.questions, 2);
  assert.equal(BankRepository.getPaper(ns.paperId).shift, "10:00");
  assert.deepEqual(BankRepository.listQuestions(ns.paperId).map((x) => x.section), ["Unlabelled section", "Unlabelled section"]);
  assert.deepEqual(ns.keyStatus, { no_key: 2 });
});

await test("importer: re-running is idempotent (same ids, same evidence, no duplicates)", () => {
  const before = getDatabase().prepare("SELECT id, answer, observed_at FROM bank_answer_evidence ORDER BY id").all();
  const qBefore = getDatabase().prepare("SELECT id, position FROM bank_questions ORDER BY id").all();
  importPypDirectory();
  assert.deepEqual(getDatabase().prepare("SELECT id, answer, observed_at FROM bank_answer_evidence ORDER BY id").all(), before);
  assert.deepEqual(getDatabase().prepare("SELECT id, position FROM bank_questions ORDER BY id").all(), qBefore);
});

// ------------------------------------------------------------------ auth + key privacy
function deepScan(value, pathSoFar = "$") {
  const banned = ["key", "keys", "answer", "evidence", "basis", "dissent", "sourceSolution", "source_solution", "explanation", "lockedAnswer", "keySnapshot"];
  if (Array.isArray(value)) return value.forEach((v, i) => deepScan(v, `${pathSoFar}[${i}]`));
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      assert.ok(!banned.includes(k), `pre-submit payload leaks "${k}" at ${pathSoFar}`);
      deepScan(v, `${pathSoFar}.${k}`);
    }
  }
}

await test("routes: every bank route answers 401 when signed out", async () => {
  const checks = [
    [papersRoute.GET, "/api/bank/papers", {}],
    [paperRoute.GET, `/api/bank/papers/${PAPER}`, { id: PAPER }],
    [aiStatusRoute.GET, "/api/bank/ai-status", {}],
    [assetsRoute.GET, "/api/bank/assets/x/1.png", { path: ["x", "1.png"] }],
  ];
  for (const [h, url, params] of checks) assert.equal((await call(h, url, {}, params)).status, 401, url);
  assert.equal((await call(attemptsRoute.POST, "/api/bank/attempts", { method: "POST", body: { paperId: PAPER, mode: "full" } })).status, 401);
  assert.equal((await call(testbookRoute.POST, "/api/bank/import/testbook", { method: "POST", body: {} })).status, 401);
});

await test("GET /papers and /papers/[id] contain no key, evidence, solution or explanation, and no key-bearing crop", async () => {
  const list = await call(papersRoute.GET, "/api/bank/papers?kind=pyp&paper=P1", { cookie: A.cookie });
  assert.equal(list.status, 200);
  const summary = list.body.papers.find((p) => p.id === PAPER);
  assert.deepEqual(summary.keyCounts, { official: 4, disputed: 1 });
  assert.equal(summary.scoredCount, 4);
  assert.deepEqual(summary.languages, ["en", "hi"]);
  assert.equal((await call(papersRoute.GET, "/api/bank/papers?kind=bogus", { cookie: A.cookie })).status, 400);
  const detail = await call(paperRoute.GET, `/api/bank/papers/${PAPER}`, { cookie: A.cookie }, { id: PAPER });
  assert.equal(detail.status, 200);
  deepScan(list.body);
  deepScan(detail.body);
  const text = JSON.stringify(detail.body);
  // Only key-free clean crops may appear before submit, never an original (key-bearing) one.
  assert.doesNotMatch(text, /response-sheet|Correct Answer|pyp-crops|\/api\/bank\/assets\/(?!clean\/)/);
  assert.match(text, /\/api\/bank\/assets\/clean\/sscje-civil-P1-2024-06-05-0900-en\/1\.png/);
  assert.deepEqual(detail.body.sections, [
    { name: "General Engineering", firstPosition: 1, count: 3 },
    { name: "Reasoning", firstPosition: 4, count: 2 },
  ]);
  assert.equal(detail.body.questions[2].scored, false, "disputed question shown but unscored");
  assert.equal(detail.body.questions[1].imageUrl, `/api/bank/assets/clean/sscje-civil-P1-2024-06-05-0900-en/2.png?v=${sha(PNG).slice(0, 12)}`, "before submit: the key-free crop, never the original");
  assert.equal((await call(paperRoute.GET, "/api/bank/papers/nope", { cookie: A.cookie }, { id: "nope" })).status, 404);
});

// ------------------------------------------------------------------ attempts + scoring
let fullAttempt;
await test("scoring: +1/−0.25, disputed question excluded from score and maxScore", async () => {
  const start = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "full" } });
  assert.equal(start.status, 201);
  fullAttempt = start.body.attempt;
  assert.equal(fullAttempt.durationSeconds, 7200);
  const responses = {
    [qid(1)]: resp("A"), // correct
    [qid(2)]: resp("A"), // wrong
    [qid(3)]: resp("C"), // disputed ⇒ unscored even though answered
    [qid(4)]: resp(null, { marked: true }), // unattempted
    [qid(5)]: resp("A", { seconds: 12.5 }), // correct
  };
  const save = await call(attemptRoute.PUT, `/api/bank/attempts/${fullAttempt.id}`, { cookie: A.cookie, method: "PUT", body: { responses } }, { id: fullAttempt.id });
  assert.deepEqual(save.body, { ok: true });
  const bad = await call(attemptRoute.PUT, `/api/bank/attempts/${fullAttempt.id}`, { cookie: A.cookie, method: "PUT", body: { responses: { [qid(1)]: resp("Z") } } }, { id: fullAttempt.id });
  assert.equal(bad.status, 400);
  const got = await call(attemptRoute.GET, `/api/bank/attempts/${fullAttempt.id}`, { cookie: A.cookie }, { id: fullAttempt.id });
  assert.deepEqual(got.body.responses, responses);
  assert.equal(got.body.result, null);
  deepScan(got.body.attempt); // responses are the learner's own answers, nothing more
  assert.deepEqual(Object.keys(got.body).sort(), ["attempt", "responses", "result"]);

  const before = await call(reviewRoute.GET, `/api/bank/attempts/${fullAttempt.id}/review`, { cookie: A.cookie }, { id: fullAttempt.id });
  assert.equal(before.status, 409, "review refused before submit");

  const sub = await call(submitRoute.POST, `/api/bank/attempts/${fullAttempt.id}/submit`, { cookie: A.cookie, method: "POST", body: { responses } }, { id: fullAttempt.id });
  assert.equal(sub.status, 200);
  const r = sub.body.result;
  assert.equal(r.score, 1.75);
  assert.equal(r.maxScore, 4);
  assert.deepEqual(r.counts, { correct: 2, wrong: 1, unattempted: 1, unscored: 1 });
  assert.equal(r.negativeMarksLost, 0.25);
  assert.deepEqual(r.marking, { correct: 1, negative: 0.25, scheme: r.marking.scheme });
  assert.equal(r.totalSeconds, 132.5);
  assert.deepEqual(r.sections.map((s) => [s.name, s.score, s.maxScore, s.unscored]), [["General Engineering", 0.75, 2, 1], ["Reasoning", 1, 2, 0]]);
  const again = await call(submitRoute.POST, `/api/bank/attempts/${fullAttempt.id}/submit`, { cookie: A.cookie, method: "POST", body: { responses } }, { id: fullAttempt.id });
  assert.equal(again.status, 409, "no double submit");
  const late = await call(attemptRoute.PUT, `/api/bank/attempts/${fullAttempt.id}`, { cookie: A.cookie, method: "PUT", body: { responses } }, { id: fullAttempt.id });
  assert.equal(late.status, 409, "no autosave after submit");
});

await test("review after submit: keys, evidence and crops; outcome uses the submit-time snapshot", async () => {
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${fullAttempt.id}/review`, { cookie: A.cookie }, { id: fullAttempt.id });
  assert.equal(rv.status, 200);
  const [q1, q2, q3, q4] = rv.body.questions;
  assert.equal(q1.outcome, "correct");
  assert.equal(q1.key.status, "official");
  assert.equal(q1.key.answer, "A");
  assert.equal(q1.key.basis.length, 2);
  assert.equal(q2.outcome, "wrong");
  assert.equal(q3.outcome, "unscored");
  assert.equal(q3.key.answer, null);
  assert.equal(q3.key.dissent.length, 2);
  assert.equal(q4.outcome, "unattempted");
  assert.equal(q1.imageUrl, `/api/bank/assets/sscje-civil-P1-2024-06-05-0900-en/1.png?v=${sha(PNG).slice(0, 12)}`);
  assert.equal(q4.imageUrl, `/api/bank/assets/clean/sscje-civil-P1-2024-06-05-0900-en/4.png?v=${sha(PNG).slice(0, 12)}`, "unproven original ⇒ clean crop even after submit");
  assert.equal(q1.explanation, null);
  assert.equal(q1.keyAtSubmit, undefined);
});

await test("explanations: shown only when locked_answer equals the current key", async () => {
  const note = JSON.stringify({
    topic: "Lime",
    concept: "Hydraulic lime sets under water.",
    steps: ["Identify the setting mechanism."],
    whyCorrect: "Hydraulic lime contains clay.",
    options: ["A", "B", "C", "D"].map((id) => ({ id, verdict: id === "A" ? "correct" : "wrong", why: "…" })),
    traps: ["Fat lime sounds strong."],
    examTip: "Under water ⇒ hydraulic.",
    verificationLimits: [],
  });
  const fpOf = (id) => contentFingerprint(BankRepository.getQuestion(id));
  BankRepository.saveExplanation({ questionId: qid(1), lockedAnswer: "A", note, model: "test", createdAt: "2026-09-29T00:00:00Z", contentFp: fpOf(qid(1)) });
  BankRepository.saveExplanation({ questionId: qid(2), lockedAnswer: "C", note, model: "test", createdAt: "2026-09-29T00:00:00Z", contentFp: fpOf(qid(2)) });
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${fullAttempt.id}/review`, { cookie: A.cookie }, { id: fullAttempt.id });
  assert.equal(rv.body.questions[0].explanation.topic, "Lime");
  assert.equal(rv.body.questions[1].explanation, null, "stale: written against C, key is B");
  const detail = await call(paperRoute.GET, `/api/bank/papers/${PAPER}`, { cookie: A.cookie }, { id: PAPER });
  deepScan(detail.body);
  assert.doesNotMatch(JSON.stringify(detail.body), /Hydraulic lime contains clay/);
});

await test("section mode: only that section is scored; timer is its share of 120 minutes", async () => {
  const start = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "section", section: "Reasoning" } });
  const attempt = start.body.attempt;
  assert.equal(attempt.section, "Reasoning");
  assert.equal(attempt.durationSeconds, Math.round((120 * 2) / 5) * 60);
  const outOfScope = await call(submitRoute.POST, `/api/bank/attempts/${attempt.id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [qid(1)]: resp("A") } } }, { id: attempt.id });
  assert.equal(outOfScope.status, 400, "a question from another section is refused");
  const sub = await call(submitRoute.POST, `/api/bank/attempts/${attempt.id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [qid(4)]: resp("A"), [qid(5)]: resp("A") } } }, { id: attempt.id });
  assert.equal(sub.body.result.score, 0.75);
  assert.equal(sub.body.result.maxScore, 2);
  assert.deepEqual(sub.body.result.sections.map((s) => s.name), ["Reasoning"]);
  const noSection = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "section", section: "Nope" } });
  assert.equal(noSection.status, 400);
  const badMode = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "speedrun" } });
  assert.equal(badMode.status, 400);
});

await test("timer: autosave refused after the deadline; a late submit scores what was saved in time", async () => {
  const start = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "full" } });
  const id = start.body.attempt.id;
  await call(attemptRoute.PUT, `/api/bank/attempts/${id}`, { cookie: A.cookie, method: "PUT", body: { responses: { [qid(1)]: resp("A") } } }, { id });
  getDatabase().prepare("UPDATE bank_attempts SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 3 * 3600 * 1000).toISOString(), id);
  const put = await call(attemptRoute.PUT, `/api/bank/attempts/${id}`, { cookie: A.cookie, method: "PUT", body: { responses: { [qid(1)]: resp("A"), [qid(2)]: resp("B") } } }, { id });
  assert.equal(put.status, 409);
  const sub = await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [qid(1)]: resp("A"), [qid(2)]: resp("B") } } }, { id });
  assert.equal(sub.body.result.counts.correct, 1, "late answer to Q2 ignored");
});

await test("practice: /check locks the answer and reveals only that key; full mode cannot check", async () => {
  const full = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "full" } });
  const notPractice = await call(checkRoute.POST, `/api/bank/attempts/${full.body.attempt.id}/check`, { cookie: A.cookie, method: "POST", body: { questionId: qid(1), answer: "A" } }, { id: full.body.attempt.id });
  assert.equal(notPractice.status, 409);

  const start = await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: PAPER, mode: "practice" } });
  const id = start.body.attempt.id;
  assert.equal(start.body.attempt.durationSeconds, null);
  const c1 = await call(checkRoute.POST, `/api/bank/attempts/${id}/check`, { cookie: A.cookie, method: "POST", body: { questionId: qid(2), answer: "A" } }, { id });
  assert.equal(c1.status, 200);
  assert.equal(c1.body.outcome, "wrong");
  assert.equal(c1.body.key.answer, "B");
  assert.equal(c1.body.imageUrl, `/api/bank/assets/sscje-civil-P1-2024-06-05-0900-en/2.png?v=${sha(PNG).slice(0, 12)}`);
  // try to change the checked answer: autosave and a second check both keep the locked one
  await call(attemptRoute.PUT, `/api/bank/attempts/${id}`, { cookie: A.cookie, method: "PUT", body: { responses: { [qid(2)]: resp("B"), [qid(1)]: resp("A") } } }, { id });
  const got = await call(attemptRoute.GET, `/api/bank/attempts/${id}`, { cookie: A.cookie }, { id });
  assert.equal(got.body.responses[qid(2)].answer, "A", "locked");
  assert.equal(got.body.responses[qid(1)].answer, "A", "unchecked questions still autosave");
  assert.deepEqual(got.body.attempt.checkedQuestionIds, [qid(2)]);
  const c2 = await call(checkRoute.POST, `/api/bank/attempts/${id}/check`, { cookie: A.cookie, method: "POST", body: { questionId: qid(2), answer: "B" } }, { id });
  assert.equal(c2.body.outcome, "wrong");
  const badOpt = await call(checkRoute.POST, `/api/bank/attempts/${id}/check`, { cookie: A.cookie, method: "POST", body: { questionId: qid(1), answer: "Q" } }, { id });
  assert.equal(badOpt.status, 400);
  const sub = await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [qid(2)]: resp("B") } } }, { id });
  assert.equal(sub.body.result.counts.wrong, 1, "submit cannot flip a checked answer");
  assert.equal(sub.body.result.counts.correct, 0);
});

// ------------------------------------------------------------------ isolation
await test("isolation: learner B gets 404 for learner A's attempt on every route", async () => {
  const id = fullAttempt.id;
  assert.equal((await call(attemptRoute.GET, `/api/bank/attempts/${id}`, { cookie: B.cookie }, { id })).status, 404);
  assert.equal((await call(attemptRoute.PUT, `/api/bank/attempts/${id}`, { cookie: B.cookie, method: "PUT", body: { responses: {} } }, { id })).status, 404);
  assert.equal((await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: B.cookie, method: "POST", body: { responses: {} } }, { id })).status, 404);
  assert.equal((await call(reviewRoute.GET, `/api/bank/attempts/${id}/review`, { cookie: B.cookie }, { id })).status, 404);
  assert.equal((await call(checkRoute.POST, `/api/bank/attempts/${id}/check`, { cookie: B.cookie, method: "POST", body: { questionId: qid(1), answer: "A" } }, { id })).status, 404);
  const list = await call(papersRoute.GET, "/api/bank/papers", { cookie: B.cookie });
  assert.deepEqual(list.body.papers.find((p) => p.id === PAPER).attempts, [], "B does not see A's attempts");
});

// ------------------------------------------------------------------ assets
await test("assets: served only after commitment; traversal, encoded, absolute, symlink and non-PNG paths blocked", async () => {
  const get = (segments, cookie = A.cookie) => call(assetsRoute.GET, `/api/bank/assets/${segments.join("/")}`, { cookie }, { path: segments });
  const ok = await get(["sscje-civil-P1-2024-06-05-0900-en", "1.png"]);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "private, no-store", "a key-bearing crop is never reused from a browser cache");
  assert.ok(Buffer.isBuffer(ok.body) && ok.body.subarray(1, 4).toString() === "PNG");
  assert.equal((await get(["sscje-civil-P1-2024-06-05-0900-en", "1.png"], B.cookie)).status, 404, "B has not attempted it: the crop shows the key");
  assert.equal((await get(["sscje-civil-P1-2017-03-02-notime-en", "1.png"])).status, 404, "A has not attempted that paper");
  assert.equal((await get(["sscje-civil-P1-2024-06-05-0900-en", "4.png"])).status, 404, "submitted, but the original failed redact's candidate-data check");
  assert.equal((await get(["clean", "sscje-civil-P1-2024-06-05-0900-en", "4.png"], B.cookie)).status, 200, "the clean crop is served to any learner");
  // A crop regenerated in place after the import is not the verified file: never served.
  const orig1 = path.join(CROPS, "sscje-civil-P1-2024-06-05-0900-en", "1.png");
  const saved = fs.readFileSync(orig1);
  fs.writeFileSync(orig1, Buffer.concat([PNG, Buffer.from([0])]));
  assert.equal((await get(["sscje-civil-P1-2024-06-05-0900-en", "1.png"])).status, 404, "changed bytes ⇒ 404 until re-verified");
  fs.writeFileSync(orig1, saved);
  assert.equal((await get(["sscje-civil-P1-2024-06-05-0900-en", "1.png"])).status, 200);
  fs.writeFileSync(path.join(workDir, "data/storage/secret.png"), PNG);
  for (const segs of [
    ["..", "secret.png"],
    ["sscje-civil-P1-2024-06-05-0900-en", "..", "..", "secret.png"],
    ["%2e%2e", "secret.png"],
    ["..%2fsecret.png"],
    ["/etc/passwd"],
    [path.join(workDir, "data/storage/secret.png")],
    ["sscje-civil-P1-2024-06-05-0900-en", "1.txt"],
    [],
  ]) {
    assert.equal((await get(segs)).status, 404, JSON.stringify(segs));
  }
  // a symlink inside the crop root that points outside it
  fs.symlinkSync(path.join(workDir, "data/storage/secret.png"), path.join(CROPS, "sscje-civil-P1-2024-06-05-0900-en", "link.png"));
  getDatabase().prepare("UPDATE bank_questions SET visual_path = ? WHERE id = ?").run("sscje-civil-P1-2024-06-05-0900-en/link.png", qid(5));
  assert.equal((await get(["sscje-civil-P1-2024-06-05-0900-en", "link.png"])).status, 404, "symlink escaping the root");
  getDatabase().prepare("UPDATE bank_questions SET visual_path = ? WHERE id = ?").run("sscje-civil-P1-2024-06-05-0900-en/5.png", qid(5));
});

// ------------------------------------------------------------------ testbook
function testbookFixture(title, { pending = 1 } = {}) {
  const questions = [1, 2, 3, 4].map((n) => ({
    id: `tbq-${n}`,
    globalNumber: n,
    section: n <= 2 ? "Civil" : "Reasoning",
    sectionQuestion: n,
    questionText: `Testbook question ${n}?`,
    questionHtml: "",
    questionAssets: n === 1 ? ["https://cdn.testbook.com/q1.png"] : [],
    options: ["o1", "o2", "o3", "o4"].map((id, i) => ({ id, text: `option ${i + 1}`, html: "", assets: [] })),
    originalResult: "incorrect",
    marksText: "+1 / -0.25",
    syllabusTopic: null,
    topicEvidence: "pending",
    evidenceState: n > 4 - pending ? "portal_solution_pending" : "portal_verified",
    portalSolution: n > 4 - pending ? null : { correctOption: "o2", html: "", text: `Worked solution ${n}`, assets: [], evidenceText: "Correct Option: 2" },
  }));
  return {
    schemaVersion: 1,
    source: { provider: "Testbook", exam: "SSC JE", branch: "Civil Engineering", series: "SSC JE CE", capturedOn: "2026-09-20", sourceUrl: "https://testbook.com/x", attemptLabel: "1", integrityPolicy: "" },
    catalogue: { observedTotalTests: 1, observedProgress: "", categories: [], warning: "" },
    tests: [{ id: "tb-test-77", title, score: 1, maxScore: 300, attemptNumber: 1, questionCount: 4, sections: [], summary: { correct: 0, incorrect: 4, unattempted: 0, partial: 0 }, questions }],
  };
}

await test("testbook import: validation, P2 from title, pending held out, idempotent per learner and test id", async () => {
  const bad = await call(testbookRoute.POST, "/api/bank/import/testbook", { cookie: A.cookie, method: "POST", body: { schemaVersion: 2 } });
  assert.equal(bad.status, 400);
  const broken = testbookFixture("SSC JE CE Paper II Mock 1");
  broken.tests[0].questions[0].portalSolution.correctOption = "o9";
  assert.equal((await call(testbookRoute.POST, "/api/bank/import/testbook", { cookie: A.cookie, method: "POST", body: broken })).status, 400);
  assert.equal((await call(testbookRoute.POST, "/api/bank/import/testbook", { cookie: A.cookie, method: "POST", body: "{not json" })).status, 400);

  const first = await call(testbookRoute.POST, "/api/bank/import/testbook", { cookie: A.cookie, method: "POST", body: testbookFixture("SSC JE CE Paper II Mock 1") });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { paperIds: [TB], questions: 4, keyed: 3, heldOut: 1 });
  const again = await call(testbookRoute.POST, "/api/bank/import/testbook", { cookie: A.cookie, method: "POST", body: testbookFixture("SSC JE CE Paper II Mock 1", { pending: 2 }) });
  assert.deepEqual(again.body, { paperIds: [TB], questions: 4, keyed: 2, heldOut: 2 });
  const paper = BankRepository.getPaper(TB);
  assert.equal(paper.paper, "P2");
  assert.equal(paper.kind, "mock");
  assert.equal(paper.ownerUserId, A.user.id, "a learner's capture is private to them");
  assert.equal(getDatabase().prepare("SELECT COUNT(*) AS n FROM bank_papers WHERE id LIKE 'testbook-%'").get().n, 1);
  assert.equal([...BankRepository.loadEvidenceForPapers([TB], "").values()].flat().length, 0, "no global evidence from a browser capture");
  const ev = [...BankRepository.loadEvidenceForPapers([TB], A.user.id).values()].flat();
  assert.equal(ev.length, 2, "evidence of a question that became pending is removed");
  assert.ok(ev.every((e) => e.authority === "testbook_portal" && e.sourceGroup === "testbook" && e.userId === A.user.id));
  const detail = await call(paperRoute.GET, `/api/bank/papers/${TB}`, { cookie: A.cookie }, { id: TB });
  deepScan(detail.body);
  assert.doesNotMatch(JSON.stringify(detail.body), /Worked solution|originalResult|incorrect/);
  assert.equal(detail.body.questions[0].imageUrl, "https://cdn.testbook.com/q1.png");
  assert.deepEqual(detail.body.paper.keyCounts, { single_source: 2, no_key: 2 });
  assert.equal(importTitleCode("SSC JE CE Full Test 3"), "P1");
});

await test("testbook import: another learner can neither see nor use the capture, nor inherit its keys", async () => {
  const list = await call(papersRoute.GET, "/api/bank/papers?kind=mock", { cookie: B.cookie });
  assert.ok(!list.body.papers.some((p) => p.id === TB), "hidden from the list");
  assert.equal((await call(paperRoute.GET, `/api/bank/papers/${TB}`, { cookie: B.cookie }, { id: TB })).status, 404);
  assert.equal((await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: B.cookie, method: "POST", body: { paperId: TB, mode: "full" } })).status, 404);
  const tbq = `${TB}-tbq-1`;
  assert.equal((await call(resolveRoute.POST, `/api/bank/questions/${tbq}/resolve`, { cookie: B.cookie, method: "POST", body: { answer: "o1" } }, { id: tbq })).status, 404);
  assert.equal(BankRepository.resolveKeyFor(tbq, B.user.id).status, "no_key", "A's portal key never reaches B");
  // B importing the same Testbook test gets a separate private paper; A's copy is untouched.
  const bImport = await call(testbookRoute.POST, "/api/bank/import/testbook", { cookie: B.cookie, method: "POST", body: testbookFixture("SSC JE CE Paper II Mock 1", { pending: 3 }) });
  assert.deepEqual(bImport.body.paperIds, [testbookPaperId(B.user.id, "tb-test-77")]);
  assert.notEqual(bImport.body.paperIds[0], TB);
  assert.equal(BankRepository.getPaper(TB).ownerUserId, A.user.id);
  assert.equal([...BankRepository.loadEvidenceForPapers([TB], A.user.id).values()].flat().length, 2);
});

await test("scoring: Paper-II marking is +3/−1", async () => {
  const id = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: TB, mode: "full" } })).body.attempt.id;
  const base = `${TB}-tbq-`;
  const sub = await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [`${base}1`]: resp("o2"), [`${base}2`]: resp("o1"), [`${base}3`]: resp("o2") } } }, { id });
  assert.equal(sub.body.result.score, 2, "3 − 1; Q3 pending ⇒ unscored");
  assert.equal(sub.body.result.maxScore, 6);
  assert.deepEqual(sub.body.result.marking.correct, 3);
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${id}/review`, { cookie: A.cookie }, { id });
  assert.equal(rv.body.questions[0].sourceSolution, "Worked solution 1");
});

// ------------------------------------------------------------------ disputes
const SH = "shared-mock-1";
const shq = `${SH}-q1`;
BankRepository.transaction(() => {
  BankRepository.upsertPaper({
    id: SH, kind: "mock", paper: "P1", cycleYear: null, examDate: null, shift: null, title: "Shared mock", questionCount: 1,
    durationMinutes: 120, fidelity: "provider_mock", publisher: "Test", sourceUrl: null, sourceFile: null, sourceSha256: null,
    capturedOn: "2026-09-29", rightsNote: "test", metadata: {},
  });
  BankRepository.upsertQuestion({
    id: shq, paperId: SH, position: 1, section: "Civil", stem: "Shared question?", options: ["o1", "o2", "o3", "o4"].map((id) => ({ id, text: id })),
    hasVisual: false, visualPath: null, sourcePage: null, sourceSolution: null, topic: null, topicEvidence: "pending", metadata: { text_quality: "text_layer" },
  });
  BankRepository.upsertGlobalEvidence({ questionId: shq, authority: "publisher_key", sourceGroup: "pub", sourceLabel: "Publisher key", answer: "o2", detail: {} });
});

await test("resolve: refused unless disputed; one learner's resolution never changes another's key", async () => {
  // B answers while the key is single-source, so B's result was scored against it.
  const bId = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: B.cookie, method: "POST", body: { paperId: SH, mode: "full" } })).body.attempt.id;
  const bSub = await call(submitRoute.POST, `/api/bank/attempts/${bId}/submit`, { cookie: B.cookie, method: "POST", body: { responses: { [shq]: resp("o2") } } }, { id: bId });
  assert.equal(bSub.body.result.score, 1);

  // Resolving reveals every source's answer and sets the learner's key: never before they answered.
  const early = await call(resolveRoute.POST, `/api/bank/questions/${shq}/resolve`, { cookie: A.cookie, method: "POST", body: { answer: "o1" } }, { id: shq });
  assert.equal(early.status, 403, "A has not committed to the question yet");
  assert.doesNotMatch(JSON.stringify(early.body), /o2|Publisher/);
  const aPractice = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: SH, mode: "practice" } })).body.attempt.id;
  await call(checkRoute.POST, `/api/bank/attempts/${aPractice}/check`, { cookie: A.cookie, method: "POST", body: { questionId: shq, answer: "o1" } }, { id: aPractice });

  const notDisputed = await call(resolveRoute.POST, `/api/bank/questions/${shq}/resolve`, { cookie: A.cookie, method: "POST", body: { answer: "o1" } }, { id: shq });
  assert.equal(notDisputed.status, 409);
  // A blind AI solve that disagrees with the only source key makes it disputed for everyone.
  BankRepository.transaction(() =>
    getDatabase()
      .prepare(`INSERT INTO bank_answer_evidence (id, question_id, user_id, authority, source_group, source_label, answer, dropped, detail, observed_at)
                VALUES ('ai1', ?, '', 'ai_blind_solve', 'ai', 'AI blind solve', 'o3', 0, ?, '2026-09-29T00:00:00Z')`)
      .run(shq, JSON.stringify({ content_fp: contentFingerprint(BankRepository.getQuestion(shq)) }))
  );
  assert.equal(BankRepository.resolveKeyFor(shq, A.user.id).status, "disputed");
  const badAnswer = await call(resolveRoute.POST, `/api/bank/questions/${shq}/resolve`, { cookie: A.cookie, method: "POST", body: { answer: "zz" } }, { id: shq });
  assert.equal(badAnswer.status, 400);
  const res = await call(resolveRoute.POST, `/api/bank/questions/${shq}/resolve`, { cookie: A.cookie, method: "POST", body: { answer: "o2", note: "Checked the textbook" } }, { id: shq });
  assert.equal(res.status, 200);
  assert.equal(res.body.key.status, "reviewed");
  assert.equal(res.body.key.answer, "o2");
  assert.equal(BankRepository.resolveKeyFor(shq, B.user.id).status, "disputed", "B unaffected");
  const again = await call(resolveRoute.POST, `/api/bank/questions/${shq}/resolve`, { cookie: A.cookie, method: "POST", body: { answer: "o3" } }, { id: shq });
  assert.equal(again.status, 409, "no longer disputed for A");
  const bList = await call(papersRoute.GET, "/api/bank/papers?kind=mock", { cookie: B.cookie });
  assert.equal(bList.body.papers.find((p) => p.id === SH).keyCounts.disputed, 1);
  const aList = await call(papersRoute.GET, "/api/bank/papers?kind=mock", { cookie: A.cookie });
  assert.equal(aList.body.papers.find((p) => p.id === SH).keyCounts.reviewed, 1);
  // B's submitted result was scored with the key of the time; the review shows the change.
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${bId}/review`, { cookie: B.cookie }, { id: bId });
  assert.equal(rv.body.result.score, 1, "submitted result not rewritten");
  assert.equal(rv.body.questions[0].outcome, "correct", "outcome from the submit-time snapshot");
  assert.deepEqual(rv.body.questions[0].keyAtSubmit, { status: "single_source", answer: "o2" });
  assert.equal(rv.body.questions[0].key.status, "disputed");
});

await test("resolve: a dispute between SSC sheets cannot be overridden by a review (resolver rule) ⇒ 409", async () => {
  const res = await call(resolveRoute.POST, `/api/bank/questions/${qid(3)}/resolve`, { cookie: A.cookie, method: "POST", body: { answer: "C" } }, { id: qid(3) });
  assert.equal(res.status, 409);
  assert.equal(BankRepository.loadEvidenceForQuestion(qid(3), A.user.id).filter((e) => e.authority === "human_review").length, 0);
});

// ------------------------------------------------------------------ ai-status
await test("ai-status: reports configuration without leaking the key", async () => {
  const saved = { p: process.env.LLM_PROVIDER, k: process.env.DEEPSEEK_API_KEY };
  process.env.LLM_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "sk-test-SECRET-123";
  const on = await call(aiStatusRoute.GET, "/api/bank/ai-status", { cookie: A.cookie });
  assert.deepEqual(on.body, { configured: true, reason: null });
  delete process.env.DEEPSEEK_API_KEY;
  const off = await call(aiStatusRoute.GET, "/api/bank/ai-status", { cookie: A.cookie });
  assert.equal(off.body.configured, false);
  assert.match(off.body.reason, /DEEPSEEK_API_KEY/);
  assert.doesNotMatch(JSON.stringify([on.body, off.body]), /SECRET/);
  if (saved.p === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = saved.p;
  if (saved.k !== undefined) process.env.DEEPSEEK_API_KEY = saved.k;
});

await test("body size cap: oversized JSON refused with 413", async () => {
  const huge = JSON.stringify({ questionId: "x".repeat(20000), answer: null });
  const res = await call(resolveRoute.POST, `/api/bank/questions/${qid(1)}/resolve`, { cookie: A.cookie, method: "POST", body: huge }, { id: qid(1) });
  assert.equal(res.status, 413);
});

// ------------------------------------------------------------------ content binding
await test("re-import that shifts positions never re-binds AI solves, notes, reviews or attempt answers to other content", async () => {
  const QS = [
    ["Bulking of sand is maximum at a moisture content of about", ["4-6%", "10%", "20%", "30%"], "A"],
    ["Which of the following is a non-renewable energy source?", ["Coal", "Wind", "Solar", "Tidal"], "A"],
    ["Minimum grade of concrete for RCC work is", ["M15", "M20", "M25", "M30"], "B"],
  ];
  const mk = (list) => ({
    date: "2019-01-02",
    time: "10:00-12:00",
    language: "en",
    sections: [{ name: "General Engineering", first_position: 1, count: list.length }],
    questions: list.map(([s, texts, k], i) => q(i + 1, "General Engineering", s, texts, { key: { option_id: k, basis: "answer_text" } })),
  });
  file("shift-2019-01-02", mk(QS.slice(1))); // run 1: the extractor missed question 1
  importPypDirectory();
  const paper = BankRepository.listPapers(A.user.id).find((p) => p.examDate === "2019-01-02");
  const p1 = `${paper.id}-p1`;
  const before = BankRepository.getQuestion(p1);
  assert.match(before.stem, /non-renewable/);
  const fp = contentFingerprint(before);
  BankRepository.upsertGlobalEvidence({ questionId: p1, authority: "ai_blind_solve", sourceGroup: "ai:mock", sourceLabel: "mock blind solve", answer: "A", detail: { content_fp: fp, reasoning: "coal is fossil" } });
  BankRepository.saveExplanation({ questionId: p1, lockedAnswer: "A", note: "{}", model: "test", createdAt: "2026-09-29T00:00:00Z", contentFp: fp });
  assert.equal(BankRepository.resolveKeyFor(p1, B.user.id).status, "ai_checked", "the AI solve counts for the content it solved");
  assert.ok(BankRepository.getExplanation(p1));
  const id = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: paper.id, mode: "full" } })).body.attempt.id;
  const first = await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [p1]: resp("A") } } }, { id });
  assert.equal(first.body.result.priorExposure, 0, "a first attempt is a fresh score");
  const id2 = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: paper.id, mode: "full" } })).body.attempt.id;
  const repeat = await call(submitRoute.POST, `/api/bank/attempts/${id2}/submit`, { cookie: A.cookie, method: "POST", body: { responses: {} } }, { id: id2 });
  assert.equal(repeat.body.result.priorExposure, 2, "every scored key was shown in the first attempt's review");
  const listed = await call(papersRoute.GET, "/api/bank/papers?kind=pyp", { cookie: A.cookie });
  assert.equal(listed.body.papers.find((p) => p.id === paper.id).attempts.find((x) => x.id === id2).priorExposure, 2);
  BankRepository.upsertHumanReview(before, A.user.id, "C", null);
  assert.deepEqual([BankRepository.resolveKeyFor(p1, A.user.id).status, BankRepository.resolveKeyFor(p1, A.user.id).answer], ["reviewed", "C"]);
  // Attempts still OPEN across the re-import: B autosaves "B" (M20) on the RCC question at p2; C checks p1 in practice.
  const p2 = `${paper.id}-p2`;
  const bOpen = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: B.cookie, method: "POST", body: { paperId: paper.id, mode: "full" } })).body.attempt.id;
  await call(attemptRoute.PUT, `/api/bank/attempts/${bOpen}`, { cookie: B.cookie, method: "PUT", body: { responses: { [p2]: resp("B") } } }, { id: bOpen });
  const bPractice = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: B.cookie, method: "POST", body: { paperId: paper.id, mode: "practice" } })).body.attempt.id;
  assert.equal((await call(checkRoute.POST, `/api/bank/attempts/${bPractice}/check`, { cookie: B.cookie, method: "POST", body: { questionId: p1, answer: "A" } }, { id: bPractice })).status, 200);

  // A concept tag written for the energy question at p1 (syllabus tables are not seeded here: FKs off for the fixture).
  getDatabase().exec("PRAGMA foreign_keys = OFF");
  getDatabase()
    .prepare("INSERT OR IGNORE INTO syllabus_nodes (id, cycle_id, kind, name, origin, source_version, review_status) VALUES ('SSC_JE:2026:subject:x', 'c', 'subject', 'X', 'editorial', 'test', 'draft')")
    .run();
  getDatabase()
    .prepare("INSERT INTO question_concepts (question_id, node_id, node_kind, role, origin, review_status, confidence, method) VALUES (?, 'SSC_JE:2026:subject:x', 'subject', 'primary', 'ai_suggested', 'needs_review', 0.8, 'test')")
    .run(p1);
  getDatabase().exec("PRAGMA foreign_keys = ON");

  file("shift-2019-01-02", mk(QS)); // run 2: the missed question is recovered ⇒ every position shifts
  const run2 = importPypDirectory();
  assert.ok(run2.papers.find((x) => x.paperId === paper.id).conceptsForgotten >= 1);
  assert.equal(Number(getDatabase().prepare("SELECT COUNT(*) AS c FROM question_concepts WHERE question_id = ?").get(p1).c), 0, "tags of the old content are dropped");
  assert.ok(run2.papers.find((x) => x.paperId === paper.id).keyStatus.single_source >= 1, "the import report ignores the stale AI row too");
  const after = BankRepository.getQuestion(p1);
  assert.match(after.stem, /Bulking/, "same id, different question now");
  for (const who of [A, B]) {
    const k = BankRepository.resolveKeyFor(p1, who.user.id);
    assert.equal(k.status, "single_source", "the old AI solve and A's old review belong to other content");
    assert.ok(!k.basis.concat(k.dissent).some((e) => e.authority === "ai_blind_solve" || e.authority === "human_review"));
  }
  assert.equal(BankRepository.getExplanation(p1), null, "a note written for the energy question is never shown on the sand question");
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${id}/review`, { cookie: A.cookie }, { id });
  const r1 = rv.body.questions.find((x) => x.id === p1);
  assert.equal(r1.contentChangedSinceSubmit, true, "A answered the earlier version");
  assert.equal(r1.explanation, null);

  // B's open attempt: the answer was given to the RCC question, p2 now holds the energy question ⇒ withheld, flagged.
  const bSub = await call(submitRoute.POST, `/api/bank/attempts/${bOpen}/submit`, { cookie: B.cookie, method: "POST", body: { responses: { [p2]: resp("B") } } }, { id: bOpen });
  assert.equal(bSub.body.result.counts.wrong, 0, "never scored against content B did not see");
  assert.equal(bSub.body.result.score, 0);
  const bRv = await call(reviewRoute.GET, `/api/bank/attempts/${bOpen}/review`, { cookie: B.cookie }, { id: bOpen });
  const b2 = bRv.body.questions.find((x) => x.id === p2);
  assert.equal(b2.outcome, "unscored");
  assert.equal(b2.contentChangedSinceSubmit, true);
  // B's practice lock on p1 was for the energy question: no check, no commitment to the new content.
  const reCheck = await call(checkRoute.POST, `/api/bank/attempts/${bPractice}/check`, { cookie: B.cookie, method: "POST", body: { questionId: p1, answer: "A" } }, { id: bPractice });
  assert.equal(reCheck.status, 409);
  assert.doesNotMatch(JSON.stringify(reCheck.body), /"answer"/);
  assert.equal(learnerCommitted(B.user.id, BankRepository.getQuestion(p1)), false, "committed to the old content only");
  fs.rmSync(path.join(PARSED, "shift-2019-01-02.json"));
  importPypDirectory();
});

await test("importer: an unknown key basis writes no evidence (never defaults to SSC authority) and is reported", () => {
  file("basis-2019-01-03", {
    date: "2019-01-03",
    time: "10:00-12:00",
    language: "en",
    sections: [{ name: "General Engineering", first_position: 1, count: 1 }],
    questions: [q(1, "General Engineering", "Which test measures workability of concrete?", ["Slump", "Vicat", "Le Chatelier", "Soundness"], { key: { option_id: "A", basis: "ocr_guess" } })],
  });
  const report = importPypDirectory();
  const paper = BankRepository.listPapers(A.user.id).find((p) => p.examDate === "2019-01-03");
  const qid1 = `${paper.id}-p1`;
  assert.equal(BankRepository.loadEvidenceForQuestion(qid1, "").length, 0);
  assert.equal(BankRepository.resolveKeyFor(qid1, A.user.id).status, "no_key");
  assert.match(JSON.stringify(report), /unknown key basis \\"ocr_guess\\"/);
  fs.rmSync(path.join(PARSED, "basis-2019-01-03.json"));
  importPypDirectory();
});

// ------------------------------------------------------------------ re-audit residuals
await test("notes: hidden next to a learner's own resolution and next to a key an AI solve rejects", () => {
  const { explanationFor } = viewsModule;
  const note = JSON.stringify({ topic: "Concrete Structures", concept: "c", steps: ["s"], whyCorrect: "w", options: ["A", "B", "C", "D"].map((id) => ({ id, verdict: id === "A" ? "correct" : "wrong", why: "x" })), traps: [], examTip: "t", verificationLimits: [] });
  const row = { questionId: "q", lockedAnswer: "A", note, model: "m", createdAt: "2026-09-29", contentFp: "f" };
  const ai = { authority: "ai_blind_solve", sourceGroup: "ai", sourceLabel: "ai", answer: "B", dropped: false, observedAt: "2026-09-29" };
  assert.ok(explanationFor(row, { status: "official", answer: "A", basis: [], dissent: [] }));
  assert.equal(explanationFor(row, { status: "reviewed", answer: "A", basis: [], dissent: [] }), null);
  assert.equal(explanationFor(row, { status: "official", answer: "A", basis: [], dissent: [ai] }), null);
});

await test("presentable: a clean crop counts only while its bytes are the verified ones; Testbook needs readable options", () => {
  const rel = "sscje-civil-P1-2024-06-05-0900-en/3.png";
  const q3 = { stem: "", options: ["A", "B", "C", "D"].map((id) => ({ id, text: "" })), hasVisual: true, visualPath: rel, metadata: { clean_crop: rel, clean_sha256: sha(PNG), text_quality: "ocr" } };
  assert.equal(presentable(q3), true);
  const cleanFile = path.join(workDir, "data/storage/pyp-crops-clean", rel);
  fs.writeFileSync(cleanFile, Buffer.concat([PNG, Buffer.from([1])]));
  assert.equal(presentable(q3), false, "regenerated in place ⇒ unavailable until re-verified");
  fs.writeFileSync(cleanFile, PNG);
  assert.equal(presentable(q3), true);
  const tb = (stem, texts, image_url = null) => ({ stem, options: texts.map((text, i) => ({ id: `o${i + 1}`, text })), hasVisual: false, visualPath: null, metadata: { testbook_question_id: "x", image_url } });
  assert.equal(presentable(tb("Which lime?", ["a", "b", "c", "d"])), true);
  assert.equal(presentable(tb("Which lime?", ["a", "", "c", "d"])), false, "an option that exists only as an image is not shown in the runner");
  assert.equal(presentable(tb("", ["a", "b", "c", "d"])), false);
  assert.equal(presentable(tb("", ["a", "b", "c", "d"], "https://cdn.testbook.com/q.png")), true);
});

await test("priorExposure counts keys seen in the /learn loop", () => {
  const PX = BankRepository.listPapers(A.user.id).find((p) => p.id === PAPER);
  const ids = BankRepository.listQuestions(PX.id).map((q) => q.id);
  getDatabase().exec("PRAGMA foreign_keys = OFF");
  getDatabase()
    .prepare(`INSERT INTO learning_events (id, user_id, session_id, position, question_id, fingerprint, content_version, group_id, group_name, at, answer, correct, assisted, repeated, seconds, interrupted, mode, due_at, interval_days)
              VALUES ('le1', ?, 's1', 1, ?, 'f', 'v', 'g', 'g', '2026-09-29T00:00:00Z', 'A', 1, 0, 0, 10, 0, 'learn', '2026-09-30', 1)`)
    .run(B.user.id, ids[0]);
  getDatabase().exec("PRAGMA foreign_keys = ON");
  assert.deepEqual(BankRepository.questionsSeenInLearning(B.user.id, ids), [ids[0]]);
  assert.deepEqual(BankRepository.questionsSeenInLearning(A.user.id, ids), [], "another learner's events never count");
});

await test("importer: a clean crop whose OCR check read nothing (ocr_chars 0) is not accepted", () => {
  const manifestPath = path.join(workDir, "data/storage/pyp-crops-clean/_manifest.json");
  const saved = fs.readFileSync(manifestPath, "utf8");
  const m = JSON.parse(saved);
  m["sscje-civil-P1-2024-06-05-0900-en/5.png"].ocr_chars = 0;
  fs.writeFileSync(manifestPath, JSON.stringify(m));
  importPypDirectory();
  assert.equal(BankRepository.getQuestion(qid(5)).metadata.clean_crop, null);
  fs.writeFileSync(manifestPath, saved);
  importPypDirectory();
  assert.equal(BankRepository.getQuestion(qid(5)).metadata.clean_crop, "sscje-civil-P1-2024-06-05-0900-en/5.png");
});

// ------------------------------------------------------------------ presentability
await test("unavailable: a PYP question with incomplete text and no verified image is shown but never scored", async () => {
  const UP = "sscje-civil-p1-2099-01-01-0900";
  BankRepository.transaction(() => {
    BankRepository.upsertPaper({
      id: UP, kind: "pyp", paper: "P1", cycleYear: 2099, examDate: "2099-01-01", shift: null, title: "Presentability paper", questionCount: 5,
      durationMinutes: 120, fidelity: "official_response_sheet", publisher: "Test", sourceUrl: null, sourceFile: null, sourceSha256: null,
      capturedOn: "2026-09-29", rightsNote: "test", metadata: {},
    });
    const base = { paperId: UP, section: "Civil", hasVisual: false, visualPath: null, sourcePage: null, sourceSolution: null, topic: null, topicEvidence: "pending" };
    const four = (texts) => texts.map((text, i) => ({ id: "ABCD"[i], text }));
    BankRepository.upsertQuestion({ ...base, id: `${UP}-q1`, position: 1, stem: "Readable?", options: four(["a", "b", "c", "d"]), metadata: { text_quality: "text_layer" } });
    // stem read, one option lost, no clean crop
    BankRepository.upsertQuestion({ ...base, id: `${UP}-q2`, position: 2, stem: "Half read", options: four(["a", "", "c", "d"]), metadata: { text_quality: "incomplete" } });
    // complete text, but it depends on a figure that has no verified key-free crop
    BankRepository.upsertQuestion({ ...base, id: `${UP}-q3`, position: 3, hasVisual: true, stem: "See the figure", options: four(["a", "b", "c", "d"]), metadata: { text_quality: "text_layer" } });
    // OCR-only text, no image to check it against
    BankRepository.upsertQuestion({ ...base, id: `${UP}-q4`, position: 4, stem: "The unit of stress is", options: four(["N/m2", "N", "J", "W"]), metadata: { text_quality: "ocr" } });
    // labelled text_layer, but an option is empty (label from an older import): the text decides
    BankRepository.upsertQuestion({ ...base, id: `${UP}-q5`, position: 5, stem: "Mislabelled?", options: four(["a", "b", "", "d"]), metadata: { text_quality: "text_layer" } });
    for (const n of [1, 2, 3, 4, 5]) {
      BankRepository.upsertGlobalEvidence({ questionId: `${UP}-q${n}`, authority: "ssc_response_sheet", sourceGroup: "ssc", sourceLabel: "SSC tick", answer: "A", detail: {} });
    }
  });
  const detail = await call(paperRoute.GET, `/api/bank/papers/${UP}`, { cookie: A.cookie }, { id: UP });
  const [d1, d2, d3, d4, d5] = detail.body.questions;
  assert.equal(d1.scored, true);
  assert.equal(d1.unavailable, undefined);
  for (const d of [d2, d3, d4, d5]) {
    assert.equal(d.scored, false, d.id);
    assert.equal(d.unavailable, true, d.id);
  }
  assert.equal(detail.body.paper.scoredCount, 1);
  const id = (await call(attemptsRoute.POST, "/api/bank/attempts", { cookie: A.cookie, method: "POST", body: { paperId: UP, mode: "full" } })).body.attempt.id;
  const sub = await call(submitRoute.POST, `/api/bank/attempts/${id}/submit`, { cookie: A.cookie, method: "POST", body: { responses: { [`${UP}-q1`]: resp("A"), [`${UP}-q2`]: resp("B"), [`${UP}-q3`]: resp("A") } } }, { id });
  assert.equal(sub.body.result.maxScore, 1, "unavailable questions are out of maxScore");
  assert.equal(sub.body.result.score, 1, "a wrong answer on an unreadable question costs nothing");
  assert.deepEqual(sub.body.result.counts, { correct: 1, wrong: 0, unattempted: 0, unscored: 4 });
  const rv = await call(reviewRoute.GET, `/api/bank/attempts/${id}/review`, { cookie: A.cookie }, { id });
  assert.equal(rv.body.questions[1].outcome, "unscored");
  assert.equal(rv.body.questions[1].keyAtSubmit, undefined, "withholding is not a key change");
  assert.equal(rv.body.questions[1].key.answer, "A", "the key is still shown after submit");
});

console.log(`\n${passed} bank tests passed`);
fs.rmSync(workDir, { recursive: true, force: true });
