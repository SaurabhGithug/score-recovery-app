import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getDatabase } from "../src/lib/server/db.ts";
import { UserRepository } from "../src/lib/server/repositories/user-repo.ts";
import { DocumentRepository } from "../src/lib/server/repositories/document-repo.ts";
import { QuestionRepository } from "../src/lib/server/repositories/question-repo.ts";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING USER STUDY LIBRARY & INTELLIGENCE TESTS");
  console.log("=================================================\n");

  const db = getDatabase();

  // Test 1: User Profile & Normalized Name Deduplication
  console.log("Test 1: User Profile Creation & Name Normalization");
  const saurabh1 = UserRepository.findOrCreateByName("Saurabh");
  const saurabh2 = UserRepository.findOrCreateByName(" saurabh ");
  assert.strictEqual(saurabh1.id, saurabh2.id, "Normalized names should map to the same stable user ID");
  assert.strictEqual(saurabh1.name.toLowerCase(), "saurabh");
  console.log("✓ User Saurabh created with ID:", saurabh1.id);

  // Test 2: Second User Creation & Isolation
  console.log("\nTest 2: Second User Creation & Data Isolation");
  const rahul = UserRepository.findOrCreateByName("Rahul");
  assert.notStrictEqual(saurabh1.id, rahul.id, "Rahul must have a distinct user ID from Saurabh");
  console.log("✓ User Rahul created with ID:", rahul.id);

  // Ensure test environment is clean for idempotent runs
  db.prepare("DELETE FROM study_documents WHERE user_id IN (?, ?)").run(saurabh1.id, rahul.id);
  db.prepare("DELETE FROM imported_questions WHERE user_id IN (?, ?)").run(saurabh1.id, rahul.id);

  // Test 3: Document Upload Scoped to Saurabh
  console.log("\nTest 3: Document Upload Under Saurabh");
  const saurabhDoc = DocumentRepository.create({
    userId: saurabh1.id,
    originalName: "ISRO_JPA_Mock_01.pdf",
    mimeType: "application/pdf",
    storagePath: "/path/to/mock1.pdf",
    fileSizeBytes: 1024 * 500,
    documentType: "QUESTION_PAPER",
  });
  assert.strictEqual(saurabhDoc.user_id, saurabh1.id);
  console.log("✓ Created study document for Saurabh:", saurabhDoc.id);

  // Test 4: Verify Rahul Cannot See Saurabh's Documents
  console.log("\nTest 4: Strict User Library Isolation Check");
  const rahulDocsBefore = DocumentRepository.listByUserId(rahul.id);
  assert.strictEqual(rahulDocsBefore.length, 0, "Rahul's library must NOT see Saurabh's documents");

  const saurabhDocQueriedByRahul = DocumentRepository.findById(saurabhDoc.id, rahul.id);
  assert.strictEqual(saurabhDocQueriedByRahul, null, "Rahul querying Saurabh's document directly must return null");
  console.log("✓ Confirmed Rahul cannot see Saurabh's library");

  // Test 5: Upload Rahul's Document
  console.log("\nTest 5: Upload Document for Rahul");
  const rahulDoc = DocumentRepository.create({
    userId: rahul.id,
    originalName: "Rahul_Notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    storagePath: "/path/to/notes.docx",
    fileSizeBytes: 2048,
    documentType: "NOTES",
  });
  const rahulDocsAfter = DocumentRepository.listByUserId(rahul.id);
  assert.strictEqual(rahulDocsAfter.length, 1);
  assert.strictEqual(rahulDocsAfter[0].id, rahulDoc.id);

  // Check Saurabh's library remains unchanged
  const saurabhDocsCheck = DocumentRepository.listByUserId(saurabh1.id);
  assert.strictEqual(saurabhDocsCheck.some((d) => d.id === rahulDoc.id), false, "Saurabh must not see Rahul's document");
  console.log("✓ Rahul's library has 1 document, completely isolated from Saurabh");

  // Test 6: Question Insertion & Scoping
  console.log("\nTest 6: Imported Questions Insertion & Verification Status");
  QuestionRepository.createMany([
    {
      documentId: saurabhDoc.id,
      userId: saurabh1.id,
      questionNumber: 1,
      questionText: "What is the capital of India?",
      options: [
        { id: "A", text: "Mumbai" },
        { id: "B", text: "New Delhi" },
        { id: "C", text: "Kolkata" },
        { id: "D", text: "Chennai" },
      ],
      correctAnswer: "B",
      sourcePage: 1,
      verificationStatus: "AUTO_ACCEPTED",
    },
    {
      documentId: saurabhDoc.id,
      userId: saurabh1.id,
      questionNumber: 2,
      questionText: "If x = 10 and y = 20, what is...",
      options: [
        { id: "A", text: "30" },
        { id: "B", text: "30" },
      ],
      correctAnswer: null,
      sourcePage: 1,
      verificationStatus: "NEEDS_REVIEW",
      reviewReason: "Identical options; premature truncation",
    },
  ]);

  QuestionRepository.refreshDocumentCounts(saurabhDoc.id, saurabh1.id);
  const updatedSaurabhDoc = DocumentRepository.findById(saurabhDoc.id, saurabh1.id);
  assert.strictEqual(updatedSaurabhDoc.questions_count, 2);
  assert.strictEqual(updatedSaurabhDoc.ready_questions_count, 1);
  assert.strictEqual(updatedSaurabhDoc.review_questions_count, 1);
  console.log("✓ Document counts updated: 2 total, 1 ready, 1 need review");

  // Test 7: Verify Question Isolation
  const rahulQuestions = QuestionRepository.listByDocumentId(saurabhDoc.id, rahul.id);
  assert.strictEqual(rahulQuestions.length, 0, "Rahul must not see Saurabh's imported questions");
  console.log("✓ Question isolation verified across users");

  // Test 8: Real Pipeline Test on Real PDF Paper
  console.log("\nTest 8: Real Document Intelligence Pipeline on ISRO JPA PDF");
  const samplePdf = path.resolve("docs/isro-jpa-2026-mocks-final/mock-paper-01-questions-only.pdf");
  assert.ok(fs.existsSync(samplePdf), "Sample PDF must exist");

  const tempOutput = "/tmp/real_pipeline_test.json";
  const cropsDir = path.resolve("data/storage/crops");

  execSync(
    `python3 services/document-intelligence/run_pipeline.py --input "${samplePdf}" --doc-id "test_real_doc" --user-id "${saurabh1.id}" --crops-dir "${cropsDir}" --output "${tempOutput}"`,
    { stdio: "inherit" }
  );

  assert.ok(fs.existsSync(tempOutput), "Pipeline must generate output JSON");
  const pipelineResult = JSON.parse(fs.readFileSync(tempOutput, "utf-8"));
  assert.strictEqual(pipelineResult.pageCount, 21, "Must extract 21 pages");
  assert.strictEqual(pipelineResult.questionsCount, 200, "Must extract 200 questions");
  assert.ok(pipelineResult.questions.length === 200, "Must contain 200 question records");
  assert.ok(pipelineResult.questions[0].sourceImageCrop.endsWith(".png"), "Must have source crop for provenance");
  console.log("✓ Real pipeline extracted 200 questions across 21 pages with provenance!");

  console.log("\n=================================================");
  console.log("ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ✓");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
