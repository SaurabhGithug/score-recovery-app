import { Attempt, Question, ScoreBreakdown, Section } from "./types";

const EMPTY_SECTION = () => ({ marks: 0, max: 0, correct: 0, wrong: 0, unattempted: 0 });

/**
 * Deterministic, auditable scoring — no model in the loop.
 * Invariant relied on elsewhere: (maxMarks - totalMarks) === sum of per-item "marks lost"
 * used by the diagnosis engine, so the recovery report always reconciles with the score.
 */
export function scoreAttempt(attempt: Attempt, questions: Question[]): ScoreBreakdown {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const bySection: ScoreBreakdown["bySection"] = {
    quant: EMPTY_SECTION(),
    reasoning: EMPTY_SECTION(),
    english: EMPTY_SECTION(),
    gk: EMPTY_SECTION(),
  };

  let maxMarks = 0;
  for (const q of questions) {
    maxMarks += q.marks;
    bySection[q.section].max += q.marks;
  }

  let totalMarks = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  for (const r of attempt.responses) {
    const q = byId.get(r.questionId);
    if (!q) continue;
    const section: Section = q.section;

    if (r.selectedOptionId == null) {
      unattemptedCount++;
      bySection[section].unattempted++;
      continue;
    }
    if (r.isCorrect) {
      totalMarks += q.marks;
      bySection[section].marks += q.marks;
      correctCount++;
      bySection[section].correct++;
    } else {
      totalMarks -= q.negativeMarks;
      bySection[section].marks -= q.negativeMarks;
      wrongCount++;
      bySection[section].wrong++;
    }
  }

  return {
    totalMarks: round1(totalMarks),
    maxMarks,
    correctCount,
    wrongCount,
    unattemptedCount,
    bySection: Object.fromEntries(
      Object.entries(bySection).map(([k, v]) => [k, { ...v, marks: round1(v.marks) }])
    ) as ScoreBreakdown["bySection"],
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
