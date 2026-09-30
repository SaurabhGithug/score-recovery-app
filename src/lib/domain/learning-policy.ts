import { ExamConceptProfile, LearningActionRecommendation } from "./schema";
import { universalKnowledgeBrain } from "./universal-brain";
import { studentBrain } from "./student-brain";

export interface PolicyContext {
  targetExamId: string;
  cycleId?: string;
  branchId?: string;
  studentId: string;
  availableMinutes?: number;
  mode?: "speed_drill" | "targeted_repair" | "retention_review" | "full_diagnostic";
}

/**
 * Learning Policy Brain
 *
 * Chooses the next learning action based on an explainable, deterministic rule-based policy:
 * Priority = (Official Blueprint Weight * 1.5)
 *          + (Student Weakness Gap * 2.0)
 *          + (Forgetting Risk * 1.2)
 *          + (Recurring Misconception Bonus * 1.0)
 *          - (Recent Over-practice Penalty * 0.8)
 *
 * Strictly rule-based and transparent: never claims uncalibrated IRT or BKT.
 */
export class LearningPolicyBrain {
  public selectNextActions(context: PolicyContext, limit: number = 3): LearningActionRecommendation[] {
    const { targetExamId, branchId, studentId, availableMinutes = 30 } = context;

    // 1. Fetch official exam concept profiles for target exam
    const examConcepts = universalKnowledgeBrain.listConceptsForExam(targetExamId);
    if (examConcepts.length === 0) {
      // If no explicit exam-concept profiles are mapped yet, fallback to all universal concepts
      const allUniversal = universalKnowledgeBrain.listConcepts();
      examConcepts.push(
        ...allUniversal.map((concept) => ({
          concept,
          profile: {
            id: `ecp-fallback-${concept.id}`,
            examId: targetExamId,
            conceptId: concept.id,
            topicWeight: 1.0,
            typicalDifficulty: 1.5,
            typicalSolvingTimeSeconds: 60,
          } as ExamConceptProfile,
        }))
      );
    }

    const misconceptions = studentBrain.getMisconceptionsForStudent(studentId);
    const schedules = studentBrain.getActiveReviewSchedule(studentId);

    const candidates: LearningActionRecommendation[] = [];

    for (const { concept, profile } of examConcepts) {
      const state = studentBrain.getConceptState(studentId, concept.id);
      const activeMisc = misconceptions.filter((m) => m.conceptId === concept.id && !m.resolved);
      const schedule = schedules.find((s) => s.conceptId === concept.id);

      // Student weakness: 1.0 - mastery (0 = fully mastered, 1 = total gap)
      const weaknessLevel = state.attemptsTotal > 0 ? Math.max(0, 1.0 - state.difficultyAdjustedMastery) : 0.8;

      // Forgetting risk: higher if due date has passed or high forgetting rating
      const forgettingRisk = schedule ? schedule.forgettingRiskRating : 0.5;

      // Misconception penalty/bonus
      const miscCount = activeMisc.reduce((sum, m) => sum + m.frequency, 0);

      // Priority formula
      const priorityScore =
        profile.topicWeight * 1.5 +
        weaknessLevel * 2.5 +
        forgettingRisk * 1.2 +
        Math.min(miscCount * 0.5, 1.5);

      // Action determination
      let actionType: LearningActionRecommendation["actionType"] = "retest_unseen";
      if (miscCount > 0) {
        actionType = "misconception_remedy";
      } else if (forgettingRisk > 0.7) {
        actionType = "retention_review";
      } else if (state.solvingSpeedIndex > 1.4) {
        actionType = "speed_drill";
      }

      const estimatedMinutes = Math.min(availableMinutes, actionType === "speed_drill" ? 5 : 8);
      const expectedMarksGain = Number((weaknessLevel * profile.topicWeight * 1.2).toFixed(1));

      const subject = universalKnowledgeBrain.getSubject(concept.subjectId);
      const subjectName = subject?.name ?? { en: "General Section", hi: "सामान्य खंड" };

      // Explainable summary
      const summaryEn = `Weight: ${profile.topicWeight}x · Weakness gap: ${Math.round(
        weaknessLevel * 100
      )}% · ${miscCount > 0 ? `${miscCount} persistent trap(s)` : "Scheduled for review"}`;

      const summaryHi = `महत्व: ${profile.topicWeight}x · कमजोरी: ${Math.round(
        weaknessLevel * 100
      )}% · ${miscCount > 0 ? `${miscCount} सक्रिय त्रुटियाँ` : "समीक्षा हेतु नियत"}`;

      candidates.push({
        id: `rec-${concept.id}-${Date.now()}`,
        targetExamId,
        branchId,
        conceptId: concept.id,
        conceptName: concept.name,
        subjectName,
        priorityScore: Number(priorityScore.toFixed(2)),
        actionType,
        recommendedQuestionIds: [],
        estimatedMinutes,
        expectedMarksGain: Math.max(0.5, expectedMarksGain),
        rationale: {
          officialBlueprintWeight: profile.topicWeight,
          studentWeaknessLevel: Number(weaknessLevel.toFixed(2)),
          forgettingRisk: Number(forgettingRisk.toFixed(2)),
          recurringMisconceptionCount: miscCount,
          summary: { en: summaryEn, hi: summaryHi },
        },
      });
    }

    // Sort descending by explainable priority score
    candidates.sort((a, b) => b.priorityScore - a.priorityScore);
    return candidates.slice(0, limit);
  }
}

export const learningPolicyBrain = new LearningPolicyBrain();
