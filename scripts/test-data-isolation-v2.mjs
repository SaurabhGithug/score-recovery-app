import assert from "node:assert/strict";
import { getDatabase } from "../src/lib/server/db.ts";
import { UserRepository } from "../src/lib/server/repositories/user-repo.ts";
import { PreparationContextRepository } from "../src/lib/server/repositories/preparation-context-repo.ts";
import { ExamProfileRepository } from "../src/lib/server/repositories/exam-profile-repo.ts";
import { calculatePersonalTarget, getOfficialMinimumQualifyingMarks } from "../src/lib/target/target-calculator.ts";
import { generateQuestionScenarios } from "../src/lib/target/strategy-engine.ts";
import { assessEvidenceLevel } from "../src/lib/target/evidence-levels.ts";

console.log("================================================================================");
console.log("RUNNING SUITE: Multi-User Isolation & Target Calculation Verification (V2)");
console.log("================================================================================\n");

// TEST 1: User Profile Isolation
console.log("1. Testing User Creation & Separation...");
const runId = Date.now();
const userA = UserRepository.findOrCreateByName(`Saurabh_${runId}`);
const userB = UserRepository.findOrCreateByName(`Rahul_${runId}`);

assert.notEqual(userA.id, userB.id, "Users must have distinct IDs");
console.log(`✓ User A (${userA.name}: ${userA.id}) & User B (${userB.name}: ${userB.id}) created distinct.`);

// TEST 2: Preparation Context Isolation
console.log("\n2. Testing Preparation Context Scoping...");
const contextA = PreparationContextRepository.createContext({
  userId: userA.id,
  name: "SSC JE Civil",
  type: "COMPETITIVE_EXAM",
  examCategory: "SSC",
  examId: "ssc-je",
  examName: "SSC Junior Engineer 2026",
  department: "Civil Engineering",
  branch: "civil",
});

const contextB = PreparationContextRepository.createContext({
  userId: userB.id,
  name: "SSC JE Electrical",
  type: "COMPETITIVE_EXAM",
  examCategory: "SSC",
  examId: "ssc-je",
  examName: "SSC Junior Engineer 2026",
  department: "Electrical Engineering",
  branch: "electrical",
});

const userAContexts = PreparationContextRepository.listByUserId(userA.id);
const userBContexts = PreparationContextRepository.listByUserId(userB.id);

assert.equal(userAContexts.length, 1, "User A must have exactly 1 context");
assert.equal(userAContexts[0].id, contextA.id);
assert.equal(userBContexts.length, 1, "User B must have exactly 1 context");
assert.equal(userBContexts[0].id, contextB.id);
assert.equal(PreparationContextRepository.findById(contextA.id, userB.id), null, "User B cannot view User A context");
console.log("✓ PreparationContext strictly isolated between users.");

// TEST 3: Exam Profile Isolation & Personalization
console.log("\n3. Testing ExamProfile Personalization & Separation...");
ExamProfileRepository.upsert({
  userId: userA.id,
  preparationContextId: contextA.id,
  category: "UR",
  dateOfBirth: "1998-05-15",
  pwbdStatus: false,
  targetPosts: ["CPWD", "MES"],
});

ExamProfileRepository.upsert({
  userId: userB.id,
  preparationContextId: contextB.id,
  category: "SC",
  dateOfBirth: "2001-11-20",
  pwbdStatus: true,
  pwbdType: "OH",
  targetPosts: ["CWC"],
});

const profileA = ExamProfileRepository.findByContextId(contextA.id, userA.id);
const profileB = ExamProfileRepository.findByContextId(contextB.id, userB.id);

assert.equal(profileA?.category, "UR");
assert.equal(profileA?.pwbd_status, 0);
assert.equal(profileB?.category, "SC");
assert.equal(profileB?.pwbd_status, 1);
assert.equal(profileB?.pwbd_type, "OH");

// Ensure cross-user lookup returns null
assert.equal(ExamProfileRepository.findByContextId(contextA.id, userB.id), null);
console.log("✓ Candidate Exam Profiles correctly persisted with strict foreign key & user isolation.");

// TEST 4: Target Calculation Comparison & Rationale Integrity
console.log("\n4. Testing Target Calculation Differentiator...");
const targetA = calculatePersonalTarget({
  examDefinitionId: "ssc-je",
  branch: "civil",
  category: "UR",
});

const targetB = calculatePersonalTarget({
  examDefinitionId: "ssc-je",
  branch: "electrical",
  category: "SC",
});

console.log(`User A (Civil UR): Target=${targetA.planningTargetScore}, OfficialMin=${targetA.officialMinimumScore}`);
console.log(`User B (Electrical SC): Target=${targetB.planningTargetScore}, OfficialMin=${targetB.officialMinimumScore}`);

// In SSC JE Paper-I:
// Official Min for UR: 60/200 (30%)
// Official Min for SC: 40/200 (20%)
assert.equal(targetA.officialMinimumScore, 60);
assert.equal(targetB.officialMinimumScore, 40);

// Civil UR target is based on 2025 cutoff (127.23) + 7.77 buffer => 135
assert.equal(targetA.planningTargetScore, 135);
// Electrical SC target is based on 2025 cutoff (~125.75) + ~8 buffer => 134
assert(targetB.planningTargetScore >= 130, "Electrical SC target should be around 134");

// Verify that official min is NEVER equal to target
assert.notEqual(targetA.officialMinimumScore, targetA.planningTargetScore);
assert.notEqual(targetB.officialMinimumScore, targetB.planningTargetScore);
console.log("✓ Official Minimum (60/40) is strictly distinct from Preparation Target (135/134).");

// TEST 5: Question Strategy Engine Scenarios
console.log("\n5. Testing Question Strategy Scenario Calculations...");
const scenarios = generateQuestionScenarios(135, 200, 1.0, 0.25);
assert.equal(scenarios.length, 3, "Must produce 3 distinct attempt scenarios");

scenarios.forEach((sc) => {
  const netScore = sc.correct * 1.0 - sc.wrong * 0.25;
  console.log(`- ${sc.name}: ${sc.totalAttempts} attempts, ${sc.correct} correct, ${sc.wrong} wrong -> net: ${netScore.toFixed(2)} (Target: 135)`);
  assert(netScore >= 135, `Scenario ${sc.name} score ${netScore} must meet or exceed 135 target`);
  assert.equal(sc.totalAttempts, sc.correct + sc.wrong, "Attempts must equal correct + wrong");
});
console.log("✓ All 3 Question Scenarios correctly satisfy net score equation with negative marking.");

// TEST 6: Honest Evidence Levels
console.log("\n6. Testing Honest Evidence Levels...");
assert.equal(assessEvidenceLevel(0).level, "no_data");
assert.equal(assessEvidenceLevel(1).level, "early_signal");
assert.equal(assessEvidenceLevel(2).level, "early_signal");
assert.equal(assessEvidenceLevel(3).level, "emerging_pattern");
assert.equal(assessEvidenceLevel(4).level, "emerging_pattern");
assert.equal(assessEvidenceLevel(5).level, "emerging_pattern");
assert.equal(assessEvidenceLevel(6).level, "reliable_pattern");
assert.equal(assessEvidenceLevel(10).level, "reliable_pattern");
console.log("✓ Evidence levels accurately reflect statistical confidence without false precision.");

console.log("\n================================================================================");
console.log("ALL V2 TESTS PASSED PERFECTLY!");
console.log("================================================================================");
