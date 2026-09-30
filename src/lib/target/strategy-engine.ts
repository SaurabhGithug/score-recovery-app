export interface QuestionScenario {
  name: string;
  description: string;
  totalAttempts: number;
  correct: number;
  wrong: number;
  unattempted: number;
  accuracyPercent: number;
  calculatedScore: number;
  riskProfile: "high" | "balanced" | "conservative";
}

export interface PersonalCandidateStrategy {
  averageAttempts: number;
  currentAccuracyPercent: number;
  expectedScore: number;
  averageWrong: number;
  averageUnattempted: number;
  targetScore: number;
  scoreGap: number;
  recommendedLeverage: {
    title: string;
    description: string;
    potentialScoreIncrease: number;
  };
}

/**
 * Calculates possible question strategies to hit a target score.
 * Formula: score = (correct * markingCorrect) - (wrong * markingNegative)
 * Total attempts = correct + wrong
 */
export function generateQuestionScenarios(
  targetScore: number,
  totalQuestions: number = 200,
  markingCorrect: number = 1.0,
  markingNegative: number = 0.25
): QuestionScenario[] {
  // Scenario A: High volume attempts (aggressive)
  // Let attempts = targetScore + 35
  const attemptsA = Math.min(totalQuestions, Math.round(targetScore + 35));
  // Solve: c * 1.0 - (attemptsA - c) * 0.25 = targetScore
  // c * 1.25 = targetScore + 0.25 * attemptsA
  const correctA = Math.ceil((targetScore + markingNegative * attemptsA) / (markingCorrect + markingNegative));
  const wrongA = attemptsA - correctA;

  // Scenario B: Balanced attempts
  const attemptsB = Math.min(totalQuestions, Math.round(targetScore + 25));
  const correctB = Math.ceil((targetScore + markingNegative * attemptsB) / (markingCorrect + markingNegative));
  const wrongB = attemptsB - correctB;

  // Scenario C: High precision / disciplined attempts
  const attemptsC = Math.min(totalQuestions, Math.round(targetScore + 15));
  const correctC = Math.ceil((targetScore + markingNegative * attemptsC) / (markingCorrect + markingNegative));
  const wrongC = attemptsC - correctC;

  return [
    {
      name: "High Accuracy / Low Risk",
      description: "Focus on strong topics only. Eliminate risky guesses to minimize negative deduction.",
      totalAttempts: attemptsC,
      correct: correctC,
      wrong: wrongC,
      unattempted: totalQuestions - attemptsC,
      accuracyPercent: Math.round((correctC / attemptsC) * 100),
      calculatedScore: Math.round((correctC * markingCorrect - wrongC * markingNegative) * 10) / 10,
      riskProfile: "conservative",
    },
    {
      name: "Balanced Speed & Precision",
      description: "Steady pacing across reasoning and discipline sections with selective skipping of traps.",
      totalAttempts: attemptsB,
      correct: correctB,
      wrong: wrongB,
      unattempted: totalQuestions - attemptsB,
      accuracyPercent: Math.round((correctB / attemptsB) * 100),
      calculatedScore: Math.round((correctB * markingCorrect - wrongB * markingNegative) * 10) / 10,
      riskProfile: "balanced",
    },
    {
      name: "High Coverage / Fast Pace",
      description: "Wide attempt coverage across all 200 questions. Requires disciplined time management.",
      totalAttempts: attemptsA,
      correct: correctA,
      wrong: wrongA,
      unattempted: totalQuestions - attemptsA,
      accuracyPercent: Math.round((correctA / attemptsA) * 100),
      calculatedScore: Math.round((correctA * markingCorrect - wrongA * markingNegative) * 10) / 10,
      riskProfile: "high",
    },
  ];
}

/**
 * Analyzes candidate's actual mock behavior and identifies highest-leverage improvement path.
 */
export function analyzeCandidateStrategy(
  mockAttempts: { totalAttempts: number; correctCount: number; wrongCount: number; score: number }[],
  targetScore: number,
  totalQuestions: number = 200
): PersonalCandidateStrategy | null {
  if (mockAttempts.length === 0) return null;

  const count = mockAttempts.length;
  const avgAttempts = Math.round(mockAttempts.reduce((s, m) => s + m.totalAttempts, 0) / count);
  const avgCorrect = Math.round(mockAttempts.reduce((s, m) => s + m.correctCount, 0) / count);
  const avgWrong = Math.round(mockAttempts.reduce((s, m) => s + m.wrongCount, 0) / count);
  const avgScore = Math.round((mockAttempts.reduce((s, m) => s + m.score, 0) / count) * 10) / 10;
  const accuracy = avgAttempts > 0 ? Math.round((avgCorrect / avgAttempts) * 100) : 0;
  const gap = Math.max(0, Math.round((targetScore - avgScore) * 10) / 10);

  let title = "Improve Accuracy in Core Concepts";
  let description = "Your attempt count is sufficient, but wrong-answer penalties are eroding your score.";
  let potentialGain = Math.round(avgWrong * 0.7);

  if (accuracy < 80) {
    title = `Boost Accuracy from ${accuracy}% to 88%`;
    description = `Cutting careless errors and risky guesses recovers +${potentialGain} marks without needing to attempt more questions.`;
  } else if (avgAttempts < targetScore + 10) {
    title = "Expand Question Coverage in Technical Section";
    description = "Your accuracy is already excellent. Unlocking speed in standard formula applications will let you attempt 15+ more questions comfortably.";
    potentialGain = 12;
  }

  return {
    averageAttempts: avgAttempts,
    currentAccuracyPercent: accuracy,
    expectedScore: avgScore,
    averageWrong: avgWrong,
    averageUnattempted: totalQuestions - avgAttempts,
    targetScore,
    scoreGap: gap,
    recommendedLeverage: {
      title,
      description,
      potentialScoreIncrease: potentialGain,
    },
  };
}
