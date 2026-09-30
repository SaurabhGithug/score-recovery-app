// Run with: npx tsx scripts/test-syllabus.mjs
// Syllabus hierarchy (learner spec §3): seed, provenance, relations, question tagging, import
// validation, tree counts and routes. Uses a throwaway SQLite database in a temp directory —
// never touches data/score_recovery.db.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "syllabus-test-"));
process.chdir(workDir); // getDatabase() resolves data/ from cwd on first use

const { getDatabase } = await import("../src/lib/server/db.ts");
const { UserRepository } = await import("../src/lib/server/repositories/user-repo.ts");
const { SessionRepository } = await import("../src/lib/server/repositories/session-repo.ts");
const { SyllabusRepository, SyllabusValidationError } = await import("../src/lib/server/repositories/syllabus-repo.ts");
const { contentFingerprint } = await import("../src/lib/server/bank/content-fp.ts");
const { buildSyllabusSeed, PART_IDS, CYCLE_2026, P1_CIVIL_SUBJECTS_2026, P2_TOPIC_SPLITS } = await import("../src/lib/syllabus/seed-builder.ts");
const { validateSeed, validateNodes, checkSplitCoverage, findCycle, validateFormula, validatePrimaryRule } = await import("../src/lib/syllabus/validate.ts");
const { SSC_JE_CIVIL_SYLLABUS_TOPICS, SSC_JE_CIVIL_SYLLABUS_SOURCE } = await import("../src/lib/ssc-je-civil-syllabus.ts");
const treeRoute = await import("../src/app/api/syllabus/tree/route.ts");
const nodeRoute = await import("../src/app/api/syllabus/nodes/[id]/route.ts");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}
const db = getDatabase();
const rawSource = JSON.parse(fs.readFileSync(path.join(repoRoot, "src/lib/syllabus-source-ssc-je-2026.json"), "utf8"));
const sourceStrings = [...rawSource.syllabus.flatMap((r) => [r.verbatim, r.part, r.heading]), ...rawSource.scheme.map((r) => r.part_or_section), rawSource.differences].filter(Boolean);

function session(name) {
  const { user } = UserRepository.register(name, "correct horse battery");
  const { token } = SessionRepository.create(user.id);
  return { user, cookie: `score_recovery_session=${encodeURIComponent(token)}` };
}
const A = session("Learner A");
const B = session("Learner B");
async function call(handler, url, cookie, params) {
  const headers = cookie ? { cookie } : {};
  const res = await handler(new Request(`http://localhost${url}`, { headers }), { params: Promise.resolve(params ?? {}) });
  return { status: res.status, body: await res.json() };
}

// ------------------------------------------------------------------ bank fixtures
function paper(id, { paperCode = "P1", kind = "pyp", year = 2023, count, owner = "" }) {
  db.prepare(
    `INSERT INTO bank_papers (id, kind, exam, branch, paper, cycle_year, title, question_count, fidelity, publisher, captured_on, rights_note, owner_user_id)
     VALUES (?, ?, 'SSC_JE', 'CIVIL', ?, ?, ?, ?, 'official_paper', 'test', '2026-09-29', 'test', ?)`
  ).run(id, kind, paperCode, year, id, count, owner);
}
function question(paperId, position, section) {
  const id = `${paperId}-q${position}`;
  db.prepare(`INSERT INTO bank_questions (id, paper_id, position, section, stem, options) VALUES (?, ?, ?, ?, ?, '[]')`).run(id, paperId, position, section, `stem ${position}`);
  db.prepare(
    `INSERT INTO bank_answer_evidence (id, question_id, authority, source_group, source_label, answer, observed_at) VALUES (?, ?, 'ssc_official', 'ssc', 'SSC key', 'C', '2026-09-29')`
  ).run(`ev-${id}`, id);
  return id;
}
// Labelled Paper-I (3 sections), a Paper-II, an unlabelled 200-question Paper-I, an odd section,
// and a learner-private paper that only B may see.
paper("p1-2023", { count: 6 });
const GIR_Q = question("p1-2023", 1, "General Intelligence and Reasoning");
question("p1-2023", 2, "General Intelligence & Reasoning");
const GA_Q = question("p1-2023", 3, "General Awareness");
const CIV_Q = question("p1-2023", 4, "General Engineering Civil and Structural");
const CIV_Q2 = question("p1-2023", 5, "Part A General Engineering Civil & Structural");
question("p1-2023", 6, "Mystery Section");
paper("p2-2024", { paperCode: "P2", year: 2024, count: 1 });
const P2_Q = question("p2-2024", 1, "General Engineering Civil And Structural");
paper("p1-2017", { year: 2017, count: 200 });
for (let i = 1; i <= 200; i++) question("p1-2017", i, "Unlabelled section");
paper("private-b", { kind: "pyp", count: 1, owner: B.user.id });
question("private-b", 1, "General Awareness");

// ------------------------------------------------------------------ seed
const seed = buildSyllabusSeed();
const sub = (name) => `${CYCLE_2026}:subject:${name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

await test("seed validates, applies, and is idempotent", () => {
  assert.deepEqual(validateSeed(seed), []);
  const first = SyllabusRepository.applySeed(seed);
  assert.equal(first.nodesInserted, seed.nodes.length);
  const again = SyllabusRepository.applySeed(buildSyllabusSeed());
  assert.equal(again.nodesInserted, 0);
  assert.equal(again.nodesUpdated, 0);
  assert.equal(again.nodesUnchanged, seed.nodes.length);
  assert.deepEqual(again.orphanNodeIds, []);
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM syllabus_nodes").get().c), seed.nodes.length);
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM exam_scheme_rows").get().c), rawSource.scheme.length);
});

await test("counts by kind: 4 parts, 13 subjects, one chapter per Paper-II heading, no concepts", () => {
  const n = (kind, cycle = CYCLE_2026) => seed.nodes.filter((x) => x.kind === kind && x.cycleId === cycle).length;
  assert.equal(n("part"), 4);
  assert.equal(n("subject"), 13);
  assert.equal(n("chapter"), rawSource.syllabus.filter((r) => r.paper === "Paper-II").length);
  assert.equal(n("concept"), 0);
  assert.ok(n("topic") > 100);
});

await test("every official node carries verbatim source text and a citation", () => {
  const official = SyllabusRepository.listNodes(CYCLE_2026).concat(SyllabusRepository.listNodes("SSC_JE:2025")).filter((x) => x.origin === "official");
  assert.ok(official.length > 0);
  for (const node of official) {
    assert.ok(node.officialText && sourceStrings.some((s) => s.includes(node.officialText)), `${node.id} text not in source`);
    assert.ok(node.citation && node.citation.length > 10, `${node.id} lacks citation`);
  }
  // Paper-II topics quote their own heading's text, not just any source string.
  for (const node of official.filter((x) => x.kind === "topic" && x.parentId?.includes(":chapter:"))) {
    const chapter = official.find((c) => c.id === node.parentId);
    assert.ok(chapter.officialText.includes(node.officialText), `${node.id} not inside its heading`);
  }
  assert.equal(`${P1_CIVIL_SUBJECTS_2026.join(", ")}.`, rawSource.syllabus.find((r) => r.part === "Part-A (Civil Engineering)").verbatim);
});

await test("topic splits are lossless, and a lossy split is caught", () => {
  for (const row of rawSource.syllabus.filter((r) => r.paper === "Paper-II")) assert.deepEqual(checkSplitCoverage(row.verbatim, P2_TOPIC_SPLITS[row.heading]), [], row.heading);
  const em = rawSource.syllabus.find((r) => r.heading === "Engineering Mechanics").verbatim;
  assert.match(checkSplitCoverage(em, ["System of forces", "free-body diagrams"]).join(), /drops printed words/);
  assert.match(checkSplitCoverage(em, ["Moment of Inertia", "System of forces"]).join(), /not found/);
});

await test("editorial groupings are flagged; same-name groupings are official", () => {
  const nodes = SyllabusRepository.listNodes(CYCLE_2026);
  const hydraulics = nodes.find((x) => x.kind === "chapter" && x.name === "Hydraulics");
  assert.equal(hydraulics.parentId, sub("Fluid Mechanics and Hydraulics"));
  assert.equal(hydraulics.parentLinkOrigin, "editorial");
  assert.equal(hydraulics.parentLinkReviewStatus, "needs_review");
  const surveying = nodes.find((x) => x.kind === "chapter" && x.name === "Surveying");
  assert.equal(surveying.parentLinkOrigin, "official");
  const soil = nodes.find((x) => x.kind === "chapter" && x.name === "Soil Mechanics");
  assert.equal(soil.parentId, sub("Soil Mechanics (Geotechnical Engineering)"));
  assert.equal(soil.parentLinkOrigin, "editorial");
  for (const x of nodes.filter((x) => x.kind === "chapter")) assert.equal(x.parentLinkOrigin === "official", x.name === nodes.find((p) => p.id === x.parentId).name, x.name);
  // an editorial node claiming official text is refused by the validator and by the DB
  const bad = { ...nodes.find((x) => x.kind === "topic"), id: "x:editorial", origin: "editorial", reviewStatus: "draft" };
  assert.match(validateNodes([...nodes, bad]).join(), /editorial node must not carry official text/);
  assert.match(validateNodes([...nodes, { ...bad, officialText: null, reviewStatus: "verified" }]).join(), /cannot be seeded as verified/);
  assert.throws(() =>
    db.prepare(`INSERT INTO syllabus_nodes (id, cycle_id, parent_id, kind, name, official_text, origin, source_version, review_status, parent_link_origin) VALUES ('x1', ?, ?, 'concept', 'c', 'claimed', 'editorial', 'v', 'draft', 'editorial')`).run(CYCLE_2026, PART_IDS.p1Civil)
  );
  assert.throws(() =>
    db.prepare(`INSERT INTO syllabus_nodes (id, cycle_id, parent_id, kind, name, official_text, origin, source_version, review_status, parent_link_origin) VALUES ('x2', ?, ?, 'concept', 'c', 'text', 'official', 'v', 'verified', 'official')`).run(CYCLE_2026, PART_IDS.p1Civil)
  );
  // an official text that is not in the source is refused
  assert.match(validateNodes([{ ...nodes[0], id: "x:fake", officialText: "Advanced Quantum Surveying" }]).join(), /not found verbatim/);
});

await test("GI&R and GA stay Paper-I only and separate from Civil content", () => {
  const nodes = SyllabusRepository.listNodes(CYCLE_2026);
  const under = (root) => {
    const ids = new Set([root]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of nodes) {
        if (x.parentId && ids.has(x.parentId) && !ids.has(x.id)) {
          ids.add(x.id);
          grew = true;
        }
      }
    }
    return nodes.filter((x) => ids.has(x.id));
  };
  for (const root of [PART_IDS.gir, PART_IDS.ga]) for (const x of under(root)) assert.deepEqual(x.papers, ["P1"], x.id);
  assert.ok(under(PART_IDS.gir).some((x) => x.name === "arithmetical number series"));
  assert.ok(under(PART_IDS.ga).some((x) => x.name === "General Polity"));
  assert.ok(!under(PART_IDS.p1Civil).some((x) => x.name === "General Polity"));
});

await test("the explanation allow-list equals the 2026 official part/subject names", () => {
  const nodes = SyllabusRepository.listNodes(CYCLE_2026);
  const expected = [nodes.find((x) => x.id === PART_IDS.gir).name, nodes.find((x) => x.id === PART_IDS.ga).name, ...nodes.filter((x) => x.kind === "subject").sort((a, b) => a.position - b.position).map((x) => x.name)];
  assert.deepEqual([...SSC_JE_CIVIL_SYLLABUS_TOPICS], expected);
  assert.match(SSC_JE_CIVIL_SYLLABUS_SOURCE.title, /HQ-C-3019\/1\/2026-C-3/);
  assert.equal(SSC_JE_CIVIL_SYLLABUS_SOURCE.sha256, rawSource.notices[0].sha256);
});

// ------------------------------------------------------------------ relations
const T = (heading, text) => SyllabusRepository.listNodes(CYCLE_2026).find((x) => x.kind === "topic" && x.name === text && x.parentId.endsWith(heading)).id;

await test("prerequisite_of rejects a cycle; relations validate endpoints and evidence", () => {
  const a = T("soil-mechanics", "Three-phase system and phase relationships");
  const b = T("soil-mechanics", "index properties");
  const c = T("soil-mechanics", "Compaction of soils");
  assert.equal(SyllabusRepository.addRelation({ relation: "prerequisite_of", fromType: "node", fromId: a, toType: "node", toId: b, origin: "editorial" }).created, true);
  assert.equal(SyllabusRepository.addRelation({ relation: "prerequisite_of", fromType: "node", fromId: a, toType: "node", toId: b, origin: "editorial" }).created, false);
  SyllabusRepository.addRelation({ relation: "prerequisite_of", fromType: "node", fromId: b, toType: "node", toId: c, origin: "editorial" });
  assert.throws(() => SyllabusRepository.addRelation({ relation: "prerequisite_of", fromType: "node", fromId: c, toType: "node", toId: a, origin: "editorial" }), /cycle/);
  assert.throws(() => SyllabusRepository.addRelation({ relation: "prerequisite_of", fromType: "node", fromId: a, toType: "node", toId: a, origin: "editorial" }), SyllabusValidationError);
  assert.throws(() => SyllabusRepository.addRelation({ relation: "uses_formula", fromType: "node", fromId: a, toType: "node", toId: b, origin: "editorial" }), /cannot end at a node/);
  assert.throws(() => SyllabusRepository.addRelation({ relation: "commonly_confused_with", fromType: "node", fromId: a, toType: "node", toId: c, origin: "editorial" }), /evidence/);
  assert.throws(() => SyllabusRepository.addRelation({ relation: "prerequisite_of", fromType: "node", fromId: a, toType: "node", toId: "nope", origin: "editorial" }), /does not exist/);
  assert.deepEqual(findCycle([{ from: "x", to: "y" }, { from: "y", to: "z" }]), null);
  assert.deepEqual(findCycle([{ from: "x", to: "y" }, { from: "y", to: "x" }]), ["x", "y", "x"]);
});

// ------------------------------------------------------------------ paper-level tagging
await test("paper-level tagging maps printed sections to parts, is idempotent, and prunes stale rows", () => {
  const s1 = SyllabusRepository.tagPaperLevel();
  assert.equal(s1.questionsSeen, 208);
  assert.equal(s1.bySource, 7); // 2 GI&R + 2 GA (incl. private) + 2 Civil P1 + 1 P2
  assert.equal(s1.byEditorialPosition, 200);
  assert.deepEqual(s1.untaggedSections, { "Mystery Section": 1 });
  const tag = (qid) => db.prepare("SELECT * FROM question_concepts WHERE question_id = ?").all(qid);
  assert.equal(tag(GIR_Q)[0].node_id, PART_IDS.gir);
  assert.equal(tag(GA_Q)[0].node_id, PART_IDS.ga);
  assert.equal(tag(CIV_Q)[0].node_id, PART_IDS.p1Civil);
  assert.equal(tag(P2_Q)[0].node_id, PART_IDS.p2Civil);
  assert.equal(tag(CIV_Q)[0].origin, "source");
  assert.equal(tag(CIV_Q)[0].review_status, "verified");
  const unl = (pos) => tag(`p1-2017-q${pos}`)[0];
  assert.equal(unl(1).node_id, PART_IDS.gir);
  assert.equal(unl(51).node_id, PART_IDS.ga);
  assert.equal(unl(101).node_id, PART_IDS.p1Civil);
  assert.equal(unl(101).origin, "editorial");
  assert.equal(unl(101).review_status, "needs_review");
  const s2 = SyllabusRepository.tagPaperLevel();
  assert.equal(s2.removedStale, 0);
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM question_concepts").get().c), 207);
  db.prepare("UPDATE bank_questions SET section = 'General Awareness' WHERE id = ?").run(CIV_Q2);
  const s3 = SyllabusRepository.tagPaperLevel();
  assert.equal(s3.removedStale, 1);
  assert.equal(tag(CIV_Q2).length, 1);
  assert.equal(tag(CIV_Q2)[0].node_id, PART_IDS.ga);
  db.prepare("UPDATE bank_questions SET section = 'Part A General Engineering Civil & Structural' WHERE id = ?").run(CIV_Q2);
  SyllabusRepository.tagPaperLevel();
  assert.equal(tag(CIV_Q2)[0].node_id, PART_IDS.p1Civil);
});

await test("DB enforces one primary per question per level and node_kind consistency", () => {
  assert.throws(() =>
    db.prepare(`INSERT INTO question_concepts (question_id, node_id, node_kind, role, origin, method, review_status) VALUES (?, ?, 'part', 'primary', 'editorial', 'x', 'draft')`).run(CIV_Q, PART_IDS.ga)
  );
  assert.throws(() =>
    db.prepare(`INSERT INTO question_concepts (question_id, node_id, node_kind, role, origin, method, review_status) VALUES (?, ?, 'topic', 'secondary', 'editorial', 'x', 'draft')`).run(CIV_Q, sub("Surveying"))
  );
  const parentOf = (id) => SyllabusRepository.getNode(id)?.parentId ?? null;
  const problems = validatePrimaryRule(
    [
      { questionId: "q", nodeId: sub("Surveying"), role: "primary", nodeKind: "subject" },
      { questionId: "q", nodeId: T("soil-mechanics", "flow nets"), role: "primary", nodeKind: "topic" },
    ],
    parentOf
  );
  assert.match(problems.join(), /not inside primary subject/);
});

// ------------------------------------------------------------------ suggestion import
const row = (over = {}) => ({ questionId: CIV_Q, nodeId: sub("Surveying"), role: "primary", origin: "ai_suggested", confidence: 0.8, method: "test tagger v1", ...over });
const imp = (rows, opts = {}) => SyllabusRepository.importQuestionConcepts(rows, { cycleId: CYCLE_2026, ...opts });

await test("import rejects bad rows and writes nothing", () => {
  const before = Number(db.prepare("SELECT COUNT(*) AS c FROM question_concepts").get().c);
  const cases = [
    [[row({ questionId: "nope" })], /unknown questionId/],
    [[row({ nodeId: "SSC_JE:2026:subject:nope" })], /unknown nodeId/],
    [[row({ nodeId: PART_IDS.p1Civil })], /part-level/],
    [[row({ origin: "source" })], /cannot be imported/],
    [[row({ origin: "official" })], /unknown origin/],
    [[row({ confidence: 1.5 })], /confidence/],
    [[row({ extra: 1 })], /unknown field/],
    [[row({ questionId: GA_Q })], /outside the question's part/],
    [[row({ nodeId: PART_IDS.gir + ":topic:analogies" })], /outside the question's part/],
    [[row(), row({ nodeId: sub("Solid Mechanics") })], /more than one primary subject/],
    [[row(), row()], /duplicate/],
    [[row(), row({ nodeId: T("soil-mechanics", "flow nets") })], /not inside primary subject/],
    [[row(), row({ nodeId: "SSC_JE:2025:subject:surveying", role: "secondary" })], /not in cycle/],
    [{ not: "an array" }, /JSON array/],
  ];
  for (const [rows, re] of cases) {
    const r = imp(rows);
    assert.equal(r.ok, false, JSON.stringify(rows));
    assert.match(r.problems.join("\n"), re);
  }
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM question_concepts").get().c), before);
});

await test("import accepts valid rows (incl. Paper-II → shared Civil tree), is idempotent, and guards replacements", () => {
  const good = [
    row(),
    row({ nodeId: T("surveying", "Plane table surveying"), role: "primary" }),
    row({ nodeId: sub("Solid Mechanics"), role: "secondary", confidence: 0.3 }),
    row({ questionId: P2_Q, nodeId: sub("Concrete Structures") }),
    row({ questionId: GA_Q, nodeId: PART_IDS.ga + ":topic:history", origin: "keyword", confidence: null, method: "kw v1" }),
  ];
  assert.deepEqual(imp(good, { dryRun: true }), { ok: true, problems: [], written: 0, replaced: 0 });
  const r1 = imp(good);
  assert.equal(r1.ok, true, r1.problems.join("\n"));
  const count = () => Number(db.prepare("SELECT COUNT(*) AS c FROM question_concepts").get().c);
  const n1 = count();
  assert.equal(imp(good).ok, true);
  assert.equal(count(), n1);
  const stored = db.prepare("SELECT * FROM question_concepts WHERE question_id = ? AND node_id = ?").get(CIV_Q, sub("Surveying"));
  assert.equal(stored.review_status, "needs_review");
  assert.equal(stored.node_kind, "subject");
  // a different primary subject conflicts with the stored suggestion unless --replace
  const change = [row({ nodeId: sub("Steel Structures") })];
  assert.match(imp(change).problems.join(), /more than one primary subject/);
  const r2 = imp(change, { replaceSuggestions: true });
  assert.equal(r2.ok, true, r2.problems.join("\n"));
  assert.equal(r2.replaced, 3);
  assert.equal(db.prepare("SELECT node_id FROM question_concepts WHERE question_id = ? AND node_kind = 'subject' AND role = 'primary'").get(CIV_Q).node_id, sub("Steel Structures"));
  // the printed-section part tag is never replaced by an import
  assert.equal(db.prepare("SELECT node_id FROM question_concepts WHERE question_id = ? AND node_kind = 'part'").get(CIV_Q).node_id, PART_IDS.p1Civil);
});

await test("import CLI rejects a bad file and imports a good one", () => {
  const tsx = path.join(repoRoot, "node_modules/.bin/tsx");
  const script = path.join(repoRoot, "scripts/import-question-concepts.mjs");
  const env = { ...process.env, SYLLABUS_DB_ROOT: workDir };
  const bad = path.join(workDir, "bad.json");
  fs.writeFileSync(bad, JSON.stringify([row({ origin: "source" })]));
  const r1 = spawnSync(tsx, [script, bad], { env, encoding: "utf8" });
  assert.equal(r1.status, 1, r1.stderr);
  assert.match(r1.stderr, /nothing written/);
  const good = path.join(workDir, "good.json");
  fs.writeFileSync(good, JSON.stringify([row({ questionId: CIV_Q2, nodeId: sub("Surveying") })]));
  const r2 = spawnSync(tsx, [script, good], { env, encoding: "utf8" });
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /Imported 1 row/);
});

// ------------------------------------------------------------------ tree + routes
await test("tree counts roll up, respect private papers, and need a session", async () => {
  assert.equal((await call(treeRoute.GET, "/api/syllabus/tree?cycle=2026")).status, 401);
  assert.equal((await call(treeRoute.GET, "/api/syllabus/tree?cycle=20x6", A.cookie)).status, 400);
  assert.equal((await call(treeRoute.GET, "/api/syllabus/tree?cycle=1999", A.cookie)).status, 404);
  const { status, body } = await call(treeRoute.GET, "/api/syllabus/tree?cycle=2026", A.cookie);
  assert.equal(status, 200);
  const find = (nodes, id) => {
    for (const x of nodes) {
      if (x.id === id) return x;
      const f = find(x.children, id);
      if (f) return f;
    }
    return null;
  };
  const civil = find(body.roots, PART_IDS.p1Civil);
  // P1 civil: CIV_Q + CIV_Q2 (source) + 100 positional directly; the shared Civil tree also
  // counts the Paper-II part's question.
  assert.equal(civil.directQuestionCount, 102);
  assert.equal(civil.questionCount, 103);
  const surveying = find(body.roots, sub("Surveying"));
  assert.equal(surveying.directQuestionCount, 1); // CIV_Q2; CIV_Q moved to Steel Structures
  assert.equal(find(body.roots, sub("Steel Structures")).questionCount, 1);
  assert.equal(find(body.roots, sub("Concrete Structures")).questionCount, 1); // the Paper-II question
  assert.equal(find(body.roots, PART_IDS.p2Civil).questionCount, 1);
  const gaA = find(body.roots, PART_IDS.ga).questionCount;
  const gaB = find((await call(treeRoute.GET, "/api/syllabus/tree?cycle=2026", B.cookie)).body.roots, PART_IDS.ga).questionCount;
  assert.equal(gaB, gaA + 1); // B's private paper counts only for B
  assert.equal(body.totals.pypQuestions, 207);
  assert.equal(body.papers.length, 2);
  assert.equal(body.papers[1].scheme[0].marks, "300");
  assert.match(body.mappingNote, /older syllabi/);
  const y2025 = await call(treeRoute.GET, "/api/syllabus/tree?cycle=2025", A.cookie);
  assert.equal(y2025.status, 200);
  assert.equal(y2025.body.cycle.status, "superseded");
});

function keysDeep(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  }
  return out;
}

await test("node detail: ancestors, official text, counts by paper/year — never answer keys", async () => {
  assert.equal((await call(nodeRoute.GET, "/x", null, { id: PART_IDS.p1Civil })).status, 401);
  assert.equal((await call(nodeRoute.GET, "/x", A.cookie, { id: "nope" })).status, 404);
  assert.equal((await call(nodeRoute.GET, "/x", A.cookie, { id: "%E0%A4%A" })).status, 404);
  const topic = T("surveying", "Plane table surveying");
  const { status, body } = await call(nodeRoute.GET, "/x", A.cookie, { id: encodeURIComponent(topic) });
  assert.equal(status, 200);
  assert.deepEqual(body.ancestors.map((a) => a.kind), ["part", "subject", "chapter"]);
  assert.equal(body.node.officialText, "Plane table surveying");
  assert.equal(body.node.printedLabel, "Distance and angle measurement");
  const civ = (await call(nodeRoute.GET, "/x", A.cookie, { id: PART_IDS.p1Civil })).body;
  assert.equal(civ.questionCounts.total, 103); // 102 Paper-I + the Paper-II question (shared Civil tree)
  assert.deepEqual(civ.questionCounts.byPaperYear.map((r) => r.paper).sort(), ["P1", "P1", "P2"]);
  const soil = (await call(nodeRoute.GET, "/x", A.cookie, { id: T("soil-mechanics", "index properties") })).body;
  assert.ok(soil.relations.some((r) => r.relation === "prerequisite_of" && r.direction === "in"));
  assert.ok(soil.relations.some((r) => r.relation === "prerequisite_of" && r.direction === "out"));
  for (const b of [body, civ, soil]) {
    const keys = keysDeep(b);
    for (const k of ["answer", "key", "correctAnswer", "lockedAnswer", "sourceSolution", "stem", "options", "evidence_answer"]) assert.ok(!keys.has(k), `response has ${k}`);
    assert.ok(!JSON.stringify(b).includes("SSC key"));
  }
});

// ------------------------------------------------------------------ formulas & theory
await test("formulas: gaps recorded, never filled; unsourced or unit-less 'verified' refused", () => {
  const base = { id: "f.test", name: "Test relation", expression: "a = b / c", latex: "a = \\frac{b}{c}", symbols: [{ symbol: "a", meaning: "alpha", unit: "m" }, { symbol: "b", meaning: "beta" }, { symbol: "c", meaning: "gamma", unit: "s" }], sourceTitle: "Fixture book", sourceLocator: "p. 1, §1", sourceEdition: "1st ed." };
  const v = validateFormula(base);
  assert.deepEqual(v.problems, []);
  assert.ok(v.gaps.includes("unit of b not stated in source"));
  assert.equal(v.record.symbols[1].unit, null);
  assert.match(validateFormula({ ...base, sourceLocator: "" }).problems.join(), /sourceLocator required/);
  assert.match(validateFormula({ ...base, verificationStatus: "verified" }).problems.join(), /unit is missing/);
  assert.match(validateFormula({ ...base, equivalentForms: [{ expression: "b = a c", latex: "b = ac", verifiedAgainst: "" }] }).problems.join(), /no verification reference/);
  const topic = T("surveying", "Plane table surveying");
  const { gaps } = SyllabusRepository.upsertFormula({ ...base, links: [{ relation: "uses_formula", direction: "in", otherType: "node", otherId: topic }] });
  assert.ok(gaps.length >= 1);
  assert.equal(SyllabusRepository.nodeDetail(topic, A.user.id).formulas[0].symbols[1].unit, null);
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM formula_links WHERE formula_id = 'f.test'").get().c), 1);
  // clean up the fixture so the dev-facing claim "zero formulas seeded" stays literal in tests
  db.prepare("DELETE FROM syllabus_relations WHERE to_id = 'f.test'").run();
  db.prepare("DELETE FROM formulas WHERE id = 'f.test'").run();
});

await test("theory: source extracts are immutable and separate from teaching notes", () => {
  const nodeId = sub("Surveying");
  SyllabusRepository.addTheoryNote({ id: "t.src", nodeId, kind: "source_extract", layer: "detail", body: "Quoted text.", derivedFrom: [], diagrams: [], sourceTitle: "Fixture", sourceLocator: "p. 2", sourceEdition: "1st", verificationStatus: "verified" });
  assert.throws(() => db.prepare("UPDATE theory_notes SET body = 'edited' WHERE id = 't.src'").run(), /immutable/);
  db.prepare("UPDATE theory_notes SET verification_status = 'rejected' WHERE id = 't.src'").run();
  assert.throws(() => SyllabusRepository.addTheoryNote({ id: "t.bad", nodeId, kind: "source_extract", layer: "concise", body: "x", derivedFrom: [], diagrams: [], sourceTitle: null, sourceLocator: null, sourceEdition: null, verificationStatus: "unverified" }), /source title/);
  assert.throws(() => SyllabusRepository.addTheoryNote({ id: "t.tn", nodeId, kind: "teaching_note", layer: "concise", body: "x", derivedFrom: [], diagrams: [], sourceTitle: null, sourceLocator: null, sourceEdition: null, verificationStatus: "verified" }), /must name the source extract/);
  SyllabusRepository.addTheoryNote({ id: "t.tn", nodeId, kind: "teaching_note", layer: "concise", body: "Short.", derivedFrom: ["t.src"], diagrams: [], sourceTitle: null, sourceLocator: null, sourceEdition: null, verificationStatus: "verified" });
  const notes = SyllabusRepository.nodeDetail(nodeId, A.user.id).theoryNotes;
  assert.deepEqual(notes.map((n) => n.layer), ["concise", "detail"]);
});

await test("worked examples built on a bank question are hidden until that learner has answered it", () => {
  const nodeId = sub("Surveying");
  const ex = (id, bankQuestionId) => ({
    id, nodeId, title: `Example ${id}`, problem: "A chain of 20 m is found 0.1 m too long…", steps: ["Correction = …"], answer: "C",
    bankQuestionId, sourceTitle: "Fixture", sourceLocator: "p. 3", verificationStatus: "unverified",
  });
  SyllabusRepository.addWorkedExample(ex("w.free", null));
  SyllabusRepository.addWorkedExample(ex("w.bank", CIV_Q));
  const ids = (who) => SyllabusRepository.nodeDetail(nodeId, who.user.id).workedExamples.map((w) => w.id).sort();
  assert.deepEqual(ids(A), ["w.free"], "A has not answered CIV_Q: its solution stays hidden");
  // A checked CIV_Q in practice, as the content it holds now (attempts record the fingerprint they showed).
  const civ = db.prepare("SELECT stem, options FROM bank_questions WHERE id = ?").get(CIV_Q);
  const fp = contentFingerprint({ stem: civ.stem, options: JSON.parse(civ.options) });
  db.prepare(
    `INSERT INTO bank_attempts (id, user_id, paper_id, mode, started_at, responses, checked, content_fps) VALUES ('bat_w', ?, 'p1-2023', 'practice', '2026-09-29', '{}', ?, ?)`
  ).run(A.user.id, JSON.stringify({ [CIV_Q]: "C" }), JSON.stringify({ [CIV_Q]: fp }));
  assert.deepEqual(ids(A), ["w.bank", "w.free"], "after A checked it in practice");
  assert.deepEqual(ids(B), ["w.free"], "B has not answered it");
  // The question is corrected by a re-import: A answered the old text, and the example was written for it.
  db.prepare("UPDATE bank_questions SET stem = 'corrected stem' WHERE id = ?").run(CIV_Q);
  assert.deepEqual(ids(A), ["w.free"], "an example for other content is never shown");
  db.prepare("UPDATE bank_questions SET stem = ? WHERE id = ?").run(civ.stem, CIV_Q);
  db.prepare("DELETE FROM worked_examples WHERE id IN ('w.free', 'w.bank')").run();
  db.prepare("DELETE FROM bank_attempts WHERE id = 'bat_w'").run();
});

console.log(`\n${passed} syllabus tests passed`);
fs.rmSync(workDir, { recursive: true, force: true });
