import {
  getOfficialMinimumQualifyingMarks,
  calculatePersonalTarget,
} from "../src/lib/target/target-calculator.ts";
import {
  generateQuestionScenarios,
  analyzeCandidateStrategy,
} from "../src/lib/target/strategy-engine.ts";
import {
  getEvidenceState,
  calculateCurrentScore,
} from "../src/lib/target/evidence-levels.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

console.log("=== RUNNING TARGET CALCULATION & STRATEGY TEST SUITE ===\n");

// 1. Official Minimum Qualifying Marks
console.log("Test 1: Official Minimum Qualifying Benchmarks");
assert(getOfficialMinimumQualifyingMarks("ssc-je", "UR", 200) === 60, "UR official minimum is 60 / 200 (30%)");
assert(getOfficialMinimumQualifyingMarks("ssc-je", "OBC", 200) === 50, "OBC official minimum is 50 / 200 (25%)");
assert(getOfficialMinimumQualifyingMarks("ssc-je", "EWS", 200) === 50, "EWS official minimum is 50 / 200 (25%)");
assert(getOfficialMinimumQualifyingMarks("ssc-je", "SC", 200) === 40, "SC official minimum is 40 / 200 (20%)");
assert(getOfficialMinimumQualifyingMarks("ssc-je", "ST", 200) === 40, "ST official minimum is 40 / 200 (20%)");

// 2. Personal Preparation Target Calculation
console.log("\nTest 2: Personal Preparation Target with Historical Cutoffs");
const civilUrTarget = calculatePersonalTarget({
  examDefinitionId: "ssc-je",
  branch: "civil",
  category: "UR",
});

assert(civilUrTarget.hasComparableHistory === true, "Civil UR has comparable historical cutoffs");
assert(civilUrTarget.officialMinimumScore === 60, "Official minimum is 60");
assert(civilUrTarget.historicalYears.length >= 3, "Contains verified historical cutoffs for at least 3 years");
assert(civilUrTarget.planningTargetScore === 135, "Civil UR planning target is 135 (127.23 recent cutoff + safety buffer)");
assert(civilUrTarget.safetyMargin > 0, "Positive safety margin calculated");
assert(
  civilUrTarget.explanation.disclaimer.includes("NOT a prediction of the 2026 cutoff"),
  "Disclaimer explicitly states this is a preparation target and not a predicted cutoff"
);

// Test Category Scaling
const civilScTarget = calculatePersonalTarget({
  examDefinitionId: "ssc-je",
  branch: "civil",
  category: "SC",
});
assert(civilScTarget.officialMinimumScore === 40, "SC official minimum is 40");
assert(civilScTarget.planningTargetScore === 118, "SC planning target is 118 (110.12 recent cutoff + safety buffer)");

// Test Electrical Stream
const elecUrTarget = calculatePersonalTarget({
  examDefinitionId: "ssc-je",
  branch: "electrical",
  category: "UR",
});
assert(elecUrTarget.planningTargetScore === 150, "Electrical UR planning target is 150 (142.15 recent cutoff + safety buffer)");

// Test Stream without history
const unknownTarget = calculatePersonalTarget({
  examDefinitionId: "ssc-je",
  branch: "astrophysics",
  category: "UR",
});
assert(unknownTarget.hasComparableHistory === false, "Returns false for stream without comparable history");
assert(unknownTarget.explanation.summary.includes("Limited comparable history"), "Accurately flags limited comparable history");

// 3. Question Strategy Scenarios
console.log("\nTest 3: Question Strategy Scenario Generator");
const scenarios = generateQuestionScenarios(135, 200, 1.0, 0.25);
assert(scenarios.length === 3, "Generates exactly 3 diverse strategy scenarios");

for (const s of scenarios) {
  assert(Math.abs(s.calculatedScore - 135) <= 1.0, `${s.name} calculated score (${s.calculatedScore}) hits target 135`);
  assert(s.totalAttempts === s.correct + s.wrong, `${s.name} total attempts matches correct + wrong`);
}

// 4. Candidate Strategy Diagnosis
console.log("\nTest 4: Candidate Behavior Analysis");
const mockHistory = [
  { totalAttempts: 154, correctCount: 120, wrongCount: 34, score: 111.5 },
  { totalAttempts: 150, correctCount: 118, wrongCount: 32, score: 110.0 },
];
const strategy = analyzeCandidateStrategy(mockHistory, 135, 200);
assert(strategy !== null, "Candidate strategy generated");
assert(strategy.expectedScore > 110 && strategy.expectedScore < 112, "Current expected score is ~111");
assert(Math.round(strategy.scoreGap) === 24, "Score gap is 24 marks");
assert(strategy.recommendedLeverage.title.includes("Accuracy"), "Identifies accuracy improvement as top leverage point");

// 5. Evidence Levels
console.log("\nTest 5: Evidence Level Tiers");
assert(getEvidenceState(0).level === "no_data", "0 tests = no_data");
assert(getEvidenceState(1).level === "early_signal", "1 test = early_signal");
assert(getEvidenceState(2).level === "early_signal", "2 tests = early_signal");
assert(getEvidenceState(3).level === "emerging_pattern", "3 tests = emerging_pattern");
assert(getEvidenceState(6).level === "reliable_pattern", "6 tests = reliable_pattern");

const scoreSummary = calculateCurrentScore([103, 107, 108, 111]);
assert(scoreSummary.currentScore === 107.3, "Average calculated across recent tests");
assert(scoreSummary.evidenceState.level === "emerging_pattern", "4 tests = emerging_pattern");

console.log("\n========================================================");
console.log("🎉 ALL TARGET & STRATEGY TESTS PASSED WITH 100% SUCCESS!");
console.log("========================================================\n");
