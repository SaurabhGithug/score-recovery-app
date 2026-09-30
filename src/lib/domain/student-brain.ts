import {
  AttemptRecord,
  MisconceptionEvidence,
  ReviewSchedule,
  StudentConceptState,
  StudentExamProfile,
} from "./schema";

/**
 * Student Brain
 *
 * Maintains multi-dimensional evidence of learner capability per concept.
 *
 * Core Rule:
 * Never reduce the student immediately to a single scalar percentage.
 * A candidate may have 85% raw accuracy on simple recall, yet have fragile calibration,
 * slow solving speed under time pressure, or high forgetting risk.
 */
export class StudentBrain {
  private profiles: Map<string, StudentExamProfile> = new Map(); // studentId -> StudentExamProfile
  private conceptStates: Map<string, StudentConceptState> = new Map(); // `${studentId}:${conceptId}` -> state
  private misconceptions: MisconceptionEvidence[] = [];
  private reviewSchedules: Map<string, ReviewSchedule> = new Map(); // `${studentId}:${conceptId}` -> schedule
  private attempts: AttemptRecord[] = [];

  // --- Profiles ---

  public setStudentProfile(profile: StudentExamProfile): void {
    this.profiles.set(profile.studentId, profile);
  }

  public getStudentProfile(studentId: string): StudentExamProfile | undefined {
    return this.profiles.get(studentId);
  }

  // --- Concept States ---

  public getConceptState(studentId: string, conceptId: string): StudentConceptState {
    const key = `${studentId}:${conceptId}`;
    let state = this.conceptStates.get(key);
    if (!state) {
      state = {
        id: `scs-${key}`,
        studentId,
        conceptId,
        accuracyRatio: 0.0,
        difficultyAdjustedMastery: 0.0,
        solvingSpeedIndex: 1.0,
        retentionScore: 1.0,
        confidenceCalibrationScore: 0.5,
        transferAbilityScore: 0.5,
        hintDependenceIndex: 0.0,
        consistencyScore: 0.5,
        attemptsTotal: 0,
        attemptsCorrect: 0,
        updatedAt: new Date().toISOString(),
      };
      this.conceptStates.set(key, state);
    }
    return state;
  }

  public listConceptStatesForStudent(studentId: string): StudentConceptState[] {
    return Array.from(this.conceptStates.values()).filter((s) => s.studentId === studentId);
  }

  // --- Record Attempt & Update Multi-Dimensional State ---

  public recordAttempt(
    attempt: AttemptRecord,
    conceptId: string,
    targetTimeSeconds: number,
    itemDifficulty: number = 1.5,
    misconceptionKey?: string
  ): StudentConceptState {
    this.attempts.push(attempt);
    const state = this.getConceptState(attempt.studentId, conceptId);

    const isCorrect = attempt.isCorrect === true;
    const prevTotal = state.attemptsTotal;
    const prevCorrect = state.attemptsCorrect;
    const newTotal = prevTotal + 1;
    const newCorrect = prevCorrect + (isCorrect ? 1 : 0);

    // 1. Accuracy Ratio
    const accuracyRatio = newCorrect / newTotal;

    // 2. Difficulty-Adjusted Mastery
    // Weights successes by difficulty level (1.0 - 3.0)
    const difficultyWeight = Math.min(Math.max(itemDifficulty / 2.0, 0.5), 1.5);
    const marginalMastery = isCorrect ? Math.min(1.0, 0.7 * difficultyWeight + 0.3) : 0.1;
    const alpha = 1 / Math.min(newTotal, 5); // adaptive moving average
    const difficultyAdjustedMastery = state.difficultyAdjustedMastery * (1 - alpha) + marginalMastery * alpha;

    // 3. Solving Speed Index (actual / expected; < 1.0 is fast, > 1.0 is slow)
    const currentSpeedRatio = targetTimeSeconds > 0 ? attempt.timeSpentSeconds / targetTimeSeconds : 1.0;
    const solvingSpeedIndex =
      prevTotal === 0 ? currentSpeedRatio : state.solvingSpeedIndex * 0.7 + currentSpeedRatio * 0.3;

    // 4. Confidence Calibration Score
    // Compares self-reported confidence with actual correctness:
    // High confidence + Correct = Well Calibrated (+1.0)
    // Low confidence + Wrong = Well Calibrated (+0.8)
    // High confidence + Wrong = Miscalibrated / Overconfident (0.0)
    // Low confidence + Correct = Underconfident (0.4)
    let calibrationDelta = 0.5;
    if (attempt.confidenceSelfReport === "high") {
      calibrationDelta = isCorrect ? 1.0 : 0.0;
    } else if (attempt.confidenceSelfReport === "low") {
      calibrationDelta = isCorrect ? 0.4 : 0.8;
    } else if (attempt.confidenceSelfReport === "medium") {
      calibrationDelta = isCorrect ? 0.8 : 0.4;
    }
    const confidenceCalibrationScore =
      prevTotal === 0 ? calibrationDelta : state.confidenceCalibrationScore * 0.7 + calibrationDelta * 0.3;

    // 5. Consistency
    // Fewer answer changes and single-visit completion indicate stable mastery
    const instability = (attempt.answerChangeCount > 1 ? 0.3 : 0.0) + (attempt.visitCount > 2 ? 0.2 : 0.0);
    const itemConsistency = Math.max(0.1, 1.0 - instability);
    const consistencyScore =
      prevTotal === 0 ? itemConsistency : state.consistencyScore * 0.8 + itemConsistency * 0.2;

    // 6. Retention & Spaced Schedule
    const now = new Date();
    const intervalDays = isCorrect ? Math.min(14, Math.max(2, Math.round(newTotal * 2.5))) : 1;
    const nextDue = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

    state.accuracyRatio = Number(accuracyRatio.toFixed(3));
    state.difficultyAdjustedMastery = Number(difficultyAdjustedMastery.toFixed(3));
    state.solvingSpeedIndex = Number(solvingSpeedIndex.toFixed(2));
    state.confidenceCalibrationScore = Number(confidenceCalibrationScore.toFixed(3));
    state.consistencyScore = Number(consistencyScore.toFixed(3));
    state.attemptsTotal = newTotal;
    state.attemptsCorrect = newCorrect;
    state.lastPracticedAt = now.toISOString();
    state.updatedAt = now.toISOString();

    // Update review schedule
    this.reviewSchedules.set(`${attempt.studentId}:${conceptId}`, {
      id: `rev-${attempt.studentId}-${conceptId}`,
      studentId: attempt.studentId,
      conceptId,
      nextReviewDue: nextDue,
      repetitionIntervalDays: intervalDays,
      forgettingRiskRating: isCorrect ? 0.2 : 0.85,
      isCompleted: false,
      createdAt: now.toISOString(),
    });

    // 7. Misconception Evidence Tracking
    if (!isCorrect && misconceptionKey) {
      const existing = this.misconceptions.find(
        (m) =>
          m.studentId === attempt.studentId &&
          m.conceptId === conceptId &&
          m.misconceptionKey === misconceptionKey &&
          !m.resolved
      );

      if (existing) {
        existing.frequency += 1;
      } else {
        this.misconceptions.push({
          id: `misc-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          studentId: attempt.studentId,
          conceptId,
          attemptId: attempt.id,
          misconceptionKey,
          observedCause: attempt.answerChangeCount > 1 ? "hesitant_distractor_switch" : "direct_trap_selection",
          frequency: 1,
          resolved: false,
          createdAt: now.toISOString(),
        });
      }
    } else if (isCorrect && misconceptionKey) {
      // Mark matching unresolved misconception as resolved
      const unresolved = this.misconceptions.find(
        (m) =>
          m.studentId === attempt.studentId &&
          m.conceptId === conceptId &&
          m.misconceptionKey === misconceptionKey &&
          !m.resolved
      );
      if (unresolved) {
        unresolved.resolved = true;
        unresolved.resolvedAt = now.toISOString();
      }
    }

    return state;
  }

  // --- Queries ---

  public getMisconceptionsForStudent(studentId: string): MisconceptionEvidence[] {
    return this.misconceptions.filter((m) => m.studentId === studentId);
  }

  public getActiveReviewSchedule(studentId: string): ReviewSchedule[] {
    return Array.from(this.reviewSchedules.values())
      .filter((r) => r.studentId === studentId && !r.isCompleted)
      .sort((a, b) => new Date(a.nextReviewDue).getTime() - new Date(b.nextReviewDue).getTime());
  }
}

export const studentBrain = new StudentBrain();
