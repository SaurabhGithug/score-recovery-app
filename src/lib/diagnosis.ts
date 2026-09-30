import {
  Attempt,
  DiagnosedItem,
  ErrorCause,
  ErrorLedgerEntry,
  NextAction,
  Question,
  RecoveryReport,
  ResponseEvent,
  Section,
} from "./types";
import { scoreAttempt } from "./scoring";

// ---------------------------------------------------------------------------
// This is a transparent, versioned RULES ENGINE — not a trained model.
//
// A five-lens adversarial review of this product's thesis (causal inference,
// learning science, ML systems, business strategy, ethics/regulatory) was
// unanimous on one point: a student's post-mock self-report of *why* they
// got a question wrong is a biased, anchored, partly circular signal, and a
// pilot of this scale cannot generate enough labeled examples per
// cause x concept cell to train a supervised classifier that would beat a
// well-built rules engine anyway. So v1 diagnosis is entirely deterministic:
// every DiagnosedItem traces back to an explicit if/then rule over objective
// behavioural signals (time spent, revisits, answer changes) that were
// actually captured during the attempt — never to an inferred "model belief".
//
// The student is still asked to confirm/correct the proposed cause (that's
// valuable UX and, later, a genuine validation signal) but that confirmation
// is NOT what drives marksRecoverableEstimate — the number a learner sees
// must be reproducible from the attempt data alone, by design.
// ---------------------------------------------------------------------------

const RUSHED_RATIO = 0.5; // answered in under 50% of the question's expected time
const STUCK_RATIO = 1.8; // took over 180% of the question's expected time

/** Causes considered "closes fast" — the kind of error a short repair drill can plausibly fix
 *  within ~2 weeks. "concept_gap" is deliberately excluded: it needs real learning first, so it's
 *  still shown and still actionable, just not counted toward the fast-recoverable headline number. */
const FAST_RECOVERABLE: ErrorCause[] = [
  "calculation_error",
  "misreading",
  "risky_guess",
  "time_pressure",
  "recurring_gap",
];

function diagnoseOne(
  q: Question,
  r: ResponseEvent,
  priorWrongOnConcept: number
): { cause: ErrorCause | null; recoverable: boolean } {
  const unattempted = r.selectedOptionId == null;
  const wrong = !unattempted && r.isCorrect === false;

  if (unattempted) {
    return { cause: "time_pressure", recoverable: true };
  }

  if (!wrong) {
    // Correct — but flag fragility so it doesn't silently fail under exam pressure next time.
    const fragile =
      r.confidence === "low" ||
      r.answerChangeCount >= 2 ||
      r.timeSpentSeconds > q.expectedTimeSeconds * STUCK_RATIO;
    return { cause: fragile ? "fragile_correct" : null, recoverable: false };
  }

  // Wrong. Rule order matters — most specific / most actionable signal first.
  if (priorWrongOnConcept >= 1) {
    return { cause: "recurring_gap", recoverable: true };
  }
  if (r.timeSpentSeconds < q.expectedTimeSeconds * RUSHED_RATIO && r.answerChangeCount === 0) {
    return { cause: "risky_guess", recoverable: true };
  }
  if (r.answerChangeCount >= 2) {
    // Flip-flopping usually means the question was re-read/re-interpreted repeatedly,
    // not a single clean calculation slip.
    return { cause: "misreading", recoverable: true };
  }
  if (r.timeSpentSeconds > q.expectedTimeSeconds * STUCK_RATIO) {
    // Spent a long time and still got it wrong — process broke down partway through,
    // more consistent with a calculation/execution error than a total concept gap.
    return { cause: "calculation_error", recoverable: true };
  }
  // Normal time, one settled answer, wrong: most consistent with not yet knowing the concept.
  return { cause: "concept_gap", recoverable: false };
}

export function diagnoseAttempt(
  attempt: Attempt,
  questions: Question[],
  ledger: ErrorLedgerEntry[]
): DiagnosedItem[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const priorWrongByConcept = new Map(
    ledger.map((e) => [`${e.section}:${e.concept}`, e.occurrences - e.resolvedCount])
  );

  return attempt.responses
    .map((r): DiagnosedItem | null => {
      const q = byId.get(r.questionId);
      if (!q) return null;
      const wrong = r.selectedOptionId != null && r.isCorrect === false;
      const unattempted = r.selectedOptionId == null;
      const priorWrong = priorWrongByConcept.get(`${q.section}:${q.concept}`) ?? 0;
      const { cause, recoverable } = diagnoseOne(q, r, priorWrong);

      const marksLost = wrong ? round1(q.marks + q.negativeMarks) : unattempted ? q.marks : 0;

      return {
        questionId: q.id,
        section: q.section,
        concept: q.concept,
        marksLost,
        cause,
        recoverable,
        recoverySource: "rule",
      };
    })
    .filter((d): d is DiagnosedItem => d !== null);
}

export function buildRecoveryReport(
  attempt: Attempt,
  questions: Question[],
  ledger: ErrorLedgerEntry[],
  /** Full question catalog (including delayed-retest variants) to draw repair drills from.
   *  Defaults to `questions` for callers that don't have a broader pool, but that means no
   *  drill questions will be found unless `questions` itself already includes retest items —
   *  the exam flow should always pass the full catalog here. */
  retestPool: Question[] = questions
): RecoveryReport {
  const score = scoreAttempt(attempt, questions);
  const diagnosis = diagnoseAttempt(attempt, questions, ledger);
  const byId = new Map(questions.map((q) => [q.id, q]));

  const marksLostTotal = round1(score.maxMarks - score.totalMarks);
  const recoverable = diagnosis.filter((d) => d.recoverable && d.marksLost > 0);
  const marksRecoverableEstimate = round1(recoverable.reduce((s, d) => s + d.marksLost, 0));

  const recoverableByCause: Partial<Record<ErrorCause, number>> = {};
  for (const d of recoverable) {
    if (!d.cause) continue;
    recoverableByCause[d.cause] = round1((recoverableByCause[d.cause] ?? 0) + d.marksLost);
  }

  const nextActions = buildNextActions(diagnosis, retestPool, byId);

  return {
    attemptId: attempt.id,
    score,
    diagnosis,
    marksLostTotal,
    marksRecoverableEstimate,
    recoverableByCause,
    nextActions,
  };
}

const ACTION_COPY: Record<ErrorCause, { title: (c: string) => { en: string; hi: string }; desc: { en: string; hi: string }; minutes: number }> = {
  concept_gap: {
    title: (c) => ({ en: `Relearn: ${c}`, hi: `पुनः सीखें: ${c}` }),
    desc: {
      en: "Short explanation and a worked example, then two guided questions before you try it unassisted.",
      hi: "संक्षिप्त व्याख्या और एक हल किया गया उदाहरण, फिर बिना सहायता के प्रयास करने से पहले दो सहायक प्रश्न।",
    },
    minutes: 12,
  },
  calculation_error: {
    title: (c) => ({ en: `Timed drill: ${c}`, hi: `समयबद्ध अभ्यास: ${c}` }),
    desc: {
      en: "Fast, small-number practice to rebuild calculation speed and accuracy on this concept.",
      hi: "इस अवधारणा पर गणना की गति और सटीकता फिर से बनाने के लिए तेज़, छोटे अभ्यास प्रश्न।",
    },
    minutes: 8,
  },
  misreading: {
    title: (c) => ({ en: `Careful-reading practice: ${c}`, hi: `सावधानीपूर्वक पठन अभ्यास: ${c}` }),
    desc: {
      en: "Practice questions with a deliberate 'underline what is asked' step before answering.",
      hi: "उत्तर देने से पहले 'क्या पूछा गया है उसे रेखांकित करें' चरण के साथ अभ्यास प्रश्न।",
    },
    minutes: 8,
  },
  risky_guess: {
    title: (c) => ({ en: `Negative-mark decision drill: ${c}`, hi: `नकारात्मक अंकन निर्णय अभ्यास: ${c}` }),
    desc: {
      en: "Practice deciding when to attempt vs. skip under negative marking, using this concept.",
      hi: "इस अवधारणा का उपयोग करते हुए नकारात्मक अंकन के तहत प्रयास करें या छोड़ें, यह तय करने का अभ्यास।",
    },
    minutes: 6,
  },
  time_pressure: {
    title: (c) => ({ en: `Untimed accuracy pass: ${c}`, hi: `बिना समय-सीमा सटीकता अभ्यास: ${c}` }),
    desc: {
      en: "Answer without a clock first to fix the method, then reintroduce timing gradually.",
      hi: "पहले तरीका सही करने के लिए बिना घड़ी के उत्तर दें, फिर धीरे-धीरे समय-सीमा वापस लाएं।",
    },
    minutes: 10,
  },
  recurring_gap: {
    title: (c) => ({ en: `Break the repeat mistake: ${c}`, hi: `बार-बार होने वाली गलती को तोड़ें: ${c}` }),
    desc: {
      en: "You've lost marks here more than once. A focused review plus a delayed unseen retest.",
      hi: "आपने यहाँ एक से अधिक बार अंक गंवाए हैं। केंद्रित समीक्षा एवं विलंबित अनदेखा पुनर्परीक्षण।",
    },
    minutes: 12,
  },
  fragile_correct: {
    title: (c) => ({ en: `Stabilise: ${c}`, hi: `स्थिर करें: ${c}` }),
    desc: {
      en: "You got this right, but slowly or after changing your answer — worth reinforcing before exam day.",
      hi: "आपने यह सही किया, पर धीमे या उत्तर बदलने के बाद — परीक्षा से पहले इसे मजबूत करना उचित है।",
    },
    minutes: 6,
  },
};

function buildNextActions(
  diagnosis: DiagnosedItem[],
  questions: Question[],
  byId: Map<string, Question>
): NextAction[] {
  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    { section: Section; concept: string; cause: ErrorCause; marksLost: number; questionIds: string[] }
  >();

  for (const d of diagnosis) {
    if (!d.recoverable || !d.cause || d.marksLost <= 0) continue;
    const key = `${d.section}:${d.concept}:${d.cause}`;
    const g = groups.get(key) ?? { section: d.section, concept: d.concept, cause: d.cause, marksLost: 0, questionIds: [] };
    g.marksLost = round1(g.marksLost + d.marksLost);
    g.questionIds.push(d.questionId);
    groups.set(key, g);
  }

  const ranked = [...groups.values()].sort((a, b) => b.marksLost - a.marksLost).slice(0, 3);

  return ranked.map((g, i) => {
    const copy = ACTION_COPY[g.cause];
    const conceptLabel = byId.get(g.questionIds[0])?.conceptLabel.en ?? g.concept;
    const drillQuestionIds = questions
      .filter((q) => q.section === g.section && q.concept === g.concept && q.retestOf)
      .map((q) => q.id);
    return {
      id: `action-${i + 1}-${g.section}-${slug(g.concept)}`,
      title: copy.title(conceptLabel),
      description: copy.desc,
      cause: g.cause,
      concept: g.concept,
      section: g.section,
      estimatedMinutes: copy.minutes,
      drillQuestionIds,
    };
  });
}

export function updateLedgerWithDiagnosis(
  ledger: ErrorLedgerEntry[],
  diagnosis: DiagnosedItem[],
  attemptId: string,
  timestamp: string
): ErrorLedgerEntry[] {
  const byKey = new Map(ledger.map((e) => [`${e.section}:${e.concept}`, { ...e, history: [...e.history] }]));

  for (const d of diagnosis) {
    if (!d.cause || d.marksLost <= 0) continue; // only wrong/unattempted items feed the ledger
    const key = `${d.section}:${d.concept}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.cause = d.cause;
      existing.lastSeenAttemptId = attemptId;
      existing.history.push({ attemptId, timestamp, result: "wrong" });
      byKey.set(key, existing);
    } else {
      byKey.set(key, {
        concept: d.concept,
        section: d.section,
        cause: d.cause,
        occurrences: 1,
        lastSeenAttemptId: attemptId,
        resolvedCount: 0,
        history: [{ attemptId, timestamp, result: "wrong" }],
      });
    }
  }

  return [...byKey.values()];
}

/** Called after a repair-drill retest: marks a concept resolved if the unseen variant was answered correctly. */
export function recordRetestResult(
  ledger: ErrorLedgerEntry[],
  section: Section,
  concept: string,
  attemptId: string,
  timestamp: string,
  resolved: boolean
): ErrorLedgerEntry[] {
  return ledger.map((e) => {
    if (e.section !== section || e.concept !== concept) return e;
    return {
      ...e,
      resolvedCount: resolved ? e.resolvedCount + 1 : e.resolvedCount,
      history: [...e.history, { attemptId, timestamp, result: resolved ? "resolved" : "wrong" }],
    };
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
