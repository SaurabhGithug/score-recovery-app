/**
 * Context & Document Intelligence Integration Scenarios Test Suite
 *
 * Verifies:
 * 1. User profile isolation (Saurabh vs Rahul)
 * 2. Preparation Context layer (hierarchy User -> Context -> Documents/Attempts)
 * 3. Conditional Branch taxonomy (SSC CGL = no branch; SSC JE = branch required)
 * 4. Context activation & switching
 * 5. Document-Context compatibility detection (Civil vs Electrical mismatch)
 * 6. Scoped query isolation (No cross-context or cross-user bleed)
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const DB_PATH = path.resolve(process.cwd(), "data/score_recovery.db");

if (!fs.existsSync(DB_PATH)) {
  console.error("Database file not found at:", DB_PATH);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

console.log("=== RUNNING PREPARATION CONTEXT INTEGRATION TEST SUITE ===\n");

// ---------------------------------------------------------------------------
// Scenario 1: User Profile Isolation
// ---------------------------------------------------------------------------
console.log("Scenario 1: User Profile Creation & Isolation");
const now = new Date().toISOString();

const userAId = "test_user_saurabh_" + Date.now();
const userBId = "test_user_rahul_" + Date.now();

db.prepare("INSERT INTO users (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
  userAId,
  "Saurabh Sharma",
  "saurabh sharma",
  now,
  now
);

db.prepare("INSERT INTO users (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
  userBId,
  "Rahul Verma",
  "rahul verma",
  now,
  now
);

const users = db.prepare("SELECT * FROM users WHERE id IN (?, ?)").all(userAId, userBId);
assert(users.length === 2, "Both test users successfully registered in SQLite");

// ---------------------------------------------------------------------------
// Scenario 2: Context Creation & Branch Conditionality
// ---------------------------------------------------------------------------
console.log("\nScenario 2: Preparation Context Hierarchy & Branch Rules");

// User A: SSC JE (Requires Branch: Civil)
const ctxA1Id = "ctx_ssc_je_civil_" + Date.now();
db.prepare(`
  INSERT INTO preparation_contexts (
    id, user_id, name, type, exam_category, exam_id, exam_name, branch, is_active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`).run(
  ctxA1Id,
  userAId,
  "SSC JE Civil",
  "COMPETITIVE_EXAM",
  "ssc",
  "ssc-je",
  "SSC Junior Engineer (JE)",
  "civil",
  now,
  now
);

// User A: Second Context: GATE Mechanical
const ctxA2Id = "ctx_gate_mech_" + Date.now();
db.prepare(`
  INSERT INTO preparation_contexts (
    id, user_id, name, type, exam_category, exam_id, exam_name, branch, is_active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
`).run(
  ctxA2Id,
  userAId,
  "GATE Mechanical",
  "COMPETITIVE_EXAM",
  "gate",
  "gate",
  "GATE",
  "mechanical",
  now,
  now
);

// User B: SSC CGL (General Competitive Exam - NO branch required)
const ctxB1Id = "ctx_ssc_cgl_" + Date.now();
db.prepare(`
  INSERT INTO preparation_contexts (
    id, user_id, name, type, exam_category, exam_id, exam_name, branch, is_active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
`).run(
  ctxB1Id,
  userBId,
  "SSC CGL General",
  "COMPETITIVE_EXAM",
  "ssc",
  "ssc-cgl",
  "SSC Combined Graduate Level (CGL)",
  now,
  now
);

// User B: College Track (Academic)
const ctxB2Id = "ctx_college_cse_" + Date.now();
db.prepare(`
  INSERT INTO preparation_contexts (
    id, user_id, name, type, department, degree, year, semester, is_active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
`).run(
  ctxB2Id,
  userBId,
  "Computer Science B.Tech",
  "ACADEMIC",
  "Computer Science",
  "B.Tech",
  3,
  6,
  now,
  now
);

const userAContexts = db.prepare("SELECT * FROM preparation_contexts WHERE user_id = ?").all(userAId);
assert(userAContexts.length === 2, "User A has exactly 2 preparation contexts");
assert(
  userAContexts.find((c) => c.id === ctxA1Id)?.branch === "civil",
  "SSC JE context has branch 'civil'"
);

const userBContexts = db.prepare("SELECT * FROM preparation_contexts WHERE user_id = ?").all(userBId);
assert(userBContexts.length === 2, "User B has exactly 2 preparation contexts");
assert(
  userBContexts.find((c) => c.id === ctxB1Id)?.branch === null,
  "SSC CGL context has NO branch (null) as required for non-technical exams"
);
assert(
  userBContexts.find((c) => c.id === ctxB2Id)?.type === "ACADEMIC",
  "User B college context correctly classified as ACADEMIC"
);

// ---------------------------------------------------------------------------
// Scenario 3: Context Activation & Switching
// ---------------------------------------------------------------------------
console.log("\nScenario 3: Single-Active Context Invariant & Switching");

// Verify only 1 is active for User A
const activeBefore = db.prepare("SELECT * FROM preparation_contexts WHERE user_id = ? AND is_active = 1").all(userAId);
assert(activeBefore.length === 1 && activeBefore[0].id === ctxA1Id, "User A starts with SSC JE Civil active");

// Switch User A to GATE Mechanical
db.prepare("UPDATE preparation_contexts SET is_active = 0, updated_at = ? WHERE user_id = ?").run(now, userAId);
db.prepare("UPDATE preparation_contexts SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?").run(
  now,
  ctxA2Id,
  userAId
);

const activeAfter = db.prepare("SELECT * FROM preparation_contexts WHERE user_id = ? AND is_active = 1").all(userAId);
assert(activeAfter.length === 1 && activeAfter[0].id === ctxA2Id, "User A successfully switched to GATE Mechanical");

// Switch back to SSC JE Civil for document tests
db.prepare("UPDATE preparation_contexts SET is_active = 0, updated_at = ? WHERE user_id = ?").run(now, userAId);
db.prepare("UPDATE preparation_contexts SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?").run(
  now,
  ctxA1Id,
  userAId
);

// ---------------------------------------------------------------------------
// Scenario 4: Document Intelligence Compatibility Detection
// ---------------------------------------------------------------------------
console.log("\nScenario 4: Document Intelligence Pipeline & Branch Mismatch Detection");

// Create temporary mock PDF text files for testing
const tmpDir = path.resolve(process.cwd(), "data/storage/tmp_test");
fs.mkdirSync(tmpDir, { recursive: true });

// Mock Electrical text
const elecTxtPath = path.join(tmpDir, "electrical_notes.txt");
fs.writeFileSync(
  elecTxtPath,
  `
CHAPTER 4: TRANSFORMERS AND INDUCTION MOTORS
An electrical transformer operates on the principle of mutual induction.
Q1. The core of a transformer is laminated to reduce:
(A) Copper loss
(B) Eddy current loss
(C) Hysteresis loss
(D) Friction loss
Answer: (B)
Explanation: Laminations reduce circulating eddy currents.
`
);

// Run python document intelligence pipeline directly to test branch compatibility inference
const outJsonPath = path.join(tmpDir, "elec_output.json");
const cropsDir = path.resolve(process.cwd(), "data/storage/crops");
const pipelinePy = path.resolve(process.cwd(), "services/document-intelligence/run_pipeline.py");

const pyRes = spawnSync("python3", [
  pipelinePy,
  "--input", elecTxtPath,
  "--doc-id", "doc_test_elec",
  "--user-id", userAId,
  "--crops-dir", cropsDir,
  "--output", outJsonPath,
  "--target-branch", "civil",
  "--context-name", "SSC JE Civil"
]);

if (pyRes.status !== 0) {
  console.error("Pipeline STDERR:", pyRes.stderr?.toString());
}
assert(pyRes.status === 0, "Pipeline CLI executed successfully");

const pipelineOutput = JSON.parse(fs.readFileSync(outJsonPath, "utf-8"));
assert(pipelineOutput.inferredBranch === "electrical", "Pipeline correctly inferred branch as 'electrical'");
assert(pipelineOutput.branchCompatibility.isCompatible === false, "Detected branch incompatibility with Civil active context");
assert(
  pipelineOutput.branchCompatibility.warningMessage.includes("Electrical") &&
  pipelineOutput.branchCompatibility.warningMessage.includes("SSC JE Civil"),
  "Warning message accurately highlights Electrical material vs SSC JE Civil goal"
);

// ---------------------------------------------------------------------------
// Scenario 5: Context-Scoped Query Isolation
// ---------------------------------------------------------------------------
console.log("\nScenario 5: Multi-User and Multi-Context Query Isolation");

// Insert document for User A in SSC JE Civil
const docA1 = "doc_saurabh_civil_" + Date.now();
db.prepare(`
  INSERT INTO study_documents (
    id, user_id, preparation_context_id, original_name, mime_type, storage_path, file_size_bytes,
    document_type, extraction_status, page_count, questions_count, ready_questions_count, review_questions_count,
    metadata, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'application/pdf', NULL, 1024, 'PDF', 'READY', 5, 20, 18, 2, ?, ?, ?)
`).run(
  docA1,
  userAId,
  ctxA1Id,
  "Concrete_Technology_Notes.pdf",
  JSON.stringify({ branchCompatibility: { isCompatible: true, inferredBranch: "civil" } }),
  now,
  now
);

// Insert document for User A in GATE Mech
const docA2 = "doc_saurabh_mech_" + Date.now();
db.prepare(`
  INSERT INTO study_documents (
    id, user_id, preparation_context_id, original_name, mime_type, storage_path, file_size_bytes,
    document_type, extraction_status, page_count, questions_count, ready_questions_count, review_questions_count,
    metadata, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'application/pdf', NULL, 2048, 'PDF', 'READY', 10, 35, 30, 5, ?, ?, ?)
`).run(
  docA2,
  userAId,
  ctxA2Id,
  "Thermodynamics_Formulas.pdf",
  JSON.stringify({ branchCompatibility: { isCompatible: true, inferredBranch: "mechanical" } }),
  now,
  now
);

// Insert document for User B in SSC CGL
const docB1 = "doc_rahul_cgl_" + Date.now();
db.prepare(`
  INSERT INTO study_documents (
    id, user_id, preparation_context_id, original_name, mime_type, storage_path, file_size_bytes,
    document_type, extraction_status, page_count, questions_count, ready_questions_count, review_questions_count,
    metadata, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'application/pdf', NULL, 4096, 'PDF', 'READY', 15, 50, 45, 5, '{}', ?, ?)
`).run(
  docB1,
  userBId,
  ctxB1Id,
  "SSC_CGL_Quant_PYQ.pdf",
  now,
  now
);

// Test queries
const saurabhCivilDocs = db.prepare(
  "SELECT * FROM study_documents WHERE user_id = ? AND preparation_context_id = ?"
).all(userAId, ctxA1Id);
assert(saurabhCivilDocs.length === 1 && saurabhCivilDocs[0].id === docA1, "Saurabh has exactly 1 doc under SSC JE Civil");

const saurabhMechDocs = db.prepare(
  "SELECT * FROM study_documents WHERE user_id = ? AND preparation_context_id = ?"
).all(userAId, ctxA2Id);
assert(saurabhMechDocs.length === 1 && saurabhMechDocs[0].id === docA2, "Saurabh has exactly 1 doc under GATE Mechanical");

const rahulDocs = db.prepare(
  "SELECT * FROM study_documents WHERE user_id = ?"
).all(userBId);
assert(rahulDocs.length === 1 && rahulDocs[0].id === docB1, "Rahul only sees his own documents, 0 bleed from Saurabh");

// Cleanup test records
db.prepare("DELETE FROM study_documents WHERE id IN (?, ?, ?)").run(docA1, docA2, docB1);
db.prepare("DELETE FROM preparation_contexts WHERE user_id IN (?, ?)").run(userAId, userBId);
db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userAId, userBId);
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log("\n========================================================");
console.log("🎉 ALL PREPARATION CONTEXT SCENARIOS PASSED WITH 100% SUCCESS!");
console.log("========================================================\n");
