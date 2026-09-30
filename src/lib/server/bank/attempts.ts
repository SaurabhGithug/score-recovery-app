/**
 * Question-bank use cases behind the /api/bank routes: listing papers, attempts, autosave,
 * submit, practice check, review and dispute resolution. Every function takes the signed-in
 * learner's id and only ever reads or writes that learner's attempts and review rows.
 */
import { resolveAnswerKey, type AnswerEvidence } from "../../bank/answer-key";
import type {
  BankAttemptMode,
  BankCheckResult,
  BankKeyView,
  BankPaperCode,
  BankPaperDetail,
  BankPaperKind,
  BankPaperSummary,
  BankResponse,
  BankResponses,
  BankReview,
  BankReviewQuestion,
  BankAttempt,
  BankAttemptResult,
} from "../../bank/api-types";
import { BankRepository, currentEvidence, type BankAttemptRecord, type BankQuestionRecord } from "../repositories/bank-repo";
import { learnerCommitted } from "./commitment";
import { contentFingerprint } from "./content-fp";
import { HttpError, isRecord, validId } from "./http";
import { attemptDurationSeconds, outcomeFor, questionsInScope, scoreAttempt, snapshotOf } from "./scoring";
import { presentable } from "./presentable";
import { explanationFor, imageUrlFor, sectionsOf, toAttemptView, toKeyView, toPaperSummary, toQuestionForAttempt } from "./views";

/** Autosaves are accepted until the timer ends plus this grace (network lag, clock skew). */
export const DEADLINE_GRACE_SECONDS = 120;
const MAX_SECONDS_PER_QUESTION = 7 * 24 * 3600;
const MAX_COUNTER = 100_000;
const MAX_NOTE_CHARS = 1000;

const MODES: ReadonlySet<string> = new Set(["full", "section", "practice"]);

// ------------------------------------------------------------------ papers
export function listPapers(userId: string, filter: { kind?: BankPaperKind; paper?: BankPaperCode }): BankPaperSummary[] {
  const papers = BankRepository.listPapers(userId, filter);
  const ids = papers.map((p) => p.id);
  const questions = BankRepository.listQuestionsForPapers(ids);
  const keys = BankRepository.resolveKeysForQuestions(questions, userId);
  const attempts = BankRepository.listAttemptsForUser(userId, ids);
  const byPaper = new Map<string, BankQuestionRecord[]>();
  for (const q of questions) {
    const list = byPaper.get(q.paperId);
    if (list) list.push(q);
    else byPaper.set(q.paperId, [q]);
  }
  return papers.map((p) =>
    toPaperSummary(p, byPaper.get(p.id) ?? [], keys, attempts.filter((a) => a.paperId === p.id))
  );
}

export function paperDetail(paperId: string, userId: string): BankPaperDetail {
  const paper = BankRepository.getPaperFor(paperId, userId);
  if (!paper) throw new HttpError(404, "Paper not found.");
  const questions = BankRepository.listQuestions(paperId);
  const keys = BankRepository.resolveKeysForQuestions(questions, userId);
  const attempts = BankRepository.listAttemptsForUser(userId, [paperId]);
  return {
    paper: toPaperSummary(paper, questions, keys, attempts),
    sections: sectionsOf(questions),
    questions: questions.map((q) => toQuestionForAttempt(q, keys.get(q.id)!, false)),
  };
}

// ------------------------------------------------------------------ attempts
export function startAttempt(userId: string, body: unknown): BankAttempt {
  if (!isRecord(body)) throw new HttpError(400, "Expected { paperId, mode, section? }.");
  const { paperId, mode, section } = body;
  if (!validId(paperId)) throw new HttpError(400, "paperId is required.");
  if (typeof mode !== "string" || !MODES.has(mode)) throw new HttpError(400, 'mode must be "full", "section" or "practice".');
  const paper = BankRepository.getPaperFor(paperId, userId);
  if (!paper) throw new HttpError(404, "Paper not found.");
  const questions = BankRepository.listQuestions(paperId);
  if (!questions.length) throw new HttpError(409, "This paper has no questions yet.");
  let sectionName: string | null = null;
  if (mode === "section") {
    if (typeof section !== "string" || !section) throw new HttpError(400, "section is required in section mode.");
    if (!questions.some((q) => q.section === section)) throw new HttpError(400, "This paper has no such section.");
    sectionName = section;
  } else if (section !== undefined && section !== null) {
    throw new HttpError(400, "section is only allowed in section mode.");
  }
  const m = mode as BankAttemptMode;
  const inScope = questionsInScope(questions, m, sectionName);
  const attempt = BankRepository.createAttempt({
    userId,
    paperId,
    mode: m,
    section: sectionName,
    durationSeconds: attemptDurationSeconds(m, paper.durationMinutes, inScope.length, questions.length),
    contentFps: Object.fromEntries(inScope.map((q) => [q.id, contentFingerprint(q)])),
  });
  return toAttemptView(attempt);
}

function ownAttempt(attemptId: string, userId: string): BankAttemptRecord {
  // 404, not 403, for someone else's attempt: never confirm that it exists.
  const attempt = validId(attemptId) ? BankRepository.getAttemptForUser(attemptId, userId) : null;
  if (!attempt) throw new HttpError(404, "Attempt not found.");
  return attempt;
}

export function getAttempt(attemptId: string, userId: string): { attempt: BankAttempt; responses: BankResponses; result: BankAttemptResult | null } {
  const attempt = ownAttempt(attemptId, userId);
  return { attempt: toAttemptView(attempt), responses: attempt.responses, result: attempt.stored?.result ?? null };
}

function scopeOf(attempt: BankAttemptRecord): BankQuestionRecord[] {
  return questionsInScope(BankRepository.listQuestions(attempt.paperId), attempt.mode, attempt.section);
}

/**
 * Has the question's content changed since the attempt started (a re-import corrected it, or the
 * id now holds another question)? The learner's answer was given to the earlier content, so it is
 * never scored or checked against the new one. Attempts without recorded fingerprints (made before
 * they existed) count as changed: fail closed.
 */
function changedSinceStart(attempt: BankAttemptRecord, q: BankQuestionRecord): boolean {
  const seen = attempt.contentFps[q.id];
  return !seen || seen !== contentFingerprint(q);
}

function isInteger(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/** Validates `{ responses }` against the attempt's questions. Unknown questions or options are refused. */
export function parseResponses(body: unknown, scope: BankQuestionRecord[]): BankResponses {
  if (!isRecord(body) || !isRecord(body.responses)) throw new HttpError(400, "Expected { responses: { [questionId]: BankResponse } }.");
  const byId = new Map(scope.map((q) => [q.id, q]));
  const out: BankResponses = {};
  for (const [questionId, raw] of Object.entries(body.responses)) {
    const q = byId.get(questionId);
    if (!q) throw new HttpError(400, `Question ${questionId.slice(0, 80)} is not part of this attempt.`);
    if (!isRecord(raw)) throw new HttpError(400, `Response for ${questionId} must be an object.`);
    const { answer, seconds, visits, changes, marked } = raw;
    if (answer !== null && (typeof answer !== "string" || !q.options.some((o) => o.id === answer))) {
      throw new HttpError(400, `Answer for ${questionId} must be one of its option ids or null.`);
    }
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS_PER_QUESTION) {
      throw new HttpError(400, `seconds for ${questionId} must be a non-negative number.`);
    }
    if (!isInteger(visits, MAX_COUNTER) || !isInteger(changes, MAX_COUNTER)) {
      throw new HttpError(400, `visits and changes for ${questionId} must be non-negative integers.`);
    }
    if (typeof marked !== "boolean") throw new HttpError(400, `marked for ${questionId} must be a boolean.`);
    out[questionId] = { answer: answer as string | null, seconds, visits, changes, marked };
  }
  return out;
}

/** A practice check locks a question's answer: later autosaves and the submit cannot change it. */
function applyLocks(responses: BankResponses, attempt: BankAttemptRecord): BankResponses {
  const out: BankResponses = { ...responses };
  for (const [questionId, answer] of Object.entries(attempt.checked)) {
    const prev = out[questionId] ?? attempt.responses[questionId];
    out[questionId] = { ...(prev ?? { seconds: 0, visits: 1, changes: 0, marked: false }), answer } as BankResponse;
  }
  return out;
}

function pastDeadline(attempt: BankAttemptRecord, now = Date.now()): boolean {
  if (attempt.durationSeconds === null) return false;
  const deadline = Date.parse(attempt.startedAt) + (attempt.durationSeconds + DEADLINE_GRACE_SECONDS) * 1000;
  return now > deadline;
}

export function autosave(attemptId: string, userId: string, body: unknown): void {
  const attempt = ownAttempt(attemptId, userId);
  if (attempt.submittedAt) throw new HttpError(409, "This attempt has already been submitted.");
  if (pastDeadline(attempt)) throw new HttpError(409, "Time is up for this attempt: submit it to see your result.");
  const responses = applyLocks(parseResponses(body, scopeOf(attempt)), attempt);
  if (!BankRepository.saveResponses(attempt.id, userId, responses)) {
    throw new HttpError(409, "This attempt has already been submitted.");
  }
}

export function submit(attemptId: string, userId: string, body: unknown): BankAttemptResult {
  const attempt = ownAttempt(attemptId, userId);
  if (attempt.submittedAt) throw new HttpError(409, "This attempt has already been submitted.");
  const paper = BankRepository.getPaper(attempt.paperId);
  if (!paper) throw new HttpError(404, "Paper not found.");
  const scope = scopeOf(attempt);
  const parsed = parseResponses(body, scope);
  // Past the timer (plus grace), score what was autosaved in time, not what arrives now.
  const responses = applyLocks(pastDeadline(attempt) ? attempt.responses : parsed, attempt);
  const keys = BankRepository.resolveKeysForQuestions(scope, userId);
  const scored = scoreAttempt({
    attemptId: attempt.id,
    paperId: attempt.paperId,
    paper: paper.paper,
    questions: scope,
    keys,
    responses,
    submittedAt: new Date().toISOString(),
    seenFps: attempt.contentFps,
  });
  scored.result.priorExposure = keysSeenBefore(attempt, scope, userId, scored.keySnapshot);
  if (!BankRepository.submitAttempt(attempt.id, userId, responses, scored)) {
    throw new HttpError(409, "This attempt has already been submitted.");
  }
  return scored.result;
}

/**
 * Scored questions of `attempt` whose key this learner had already seen before submitting it: checked
 * in any other practice attempt, covered by another attempt they had submitted (its review shows
 * every key), or resolved by them in a dispute.
 */
function keysSeenBefore(
  attempt: BankAttemptRecord,
  scope: BankQuestionRecord[],
  userId: string,
  snapshot: Record<string, { answer: string | null }>
): number {
  const seen = new Set<string>();
  const inPaper = BankRepository.listQuestions(attempt.paperId);
  for (const other of BankRepository.listAttemptsForUser(userId, [attempt.paperId])) {
    if (other.id === attempt.id) continue;
    for (const id of Object.keys(other.checked)) seen.add(id);
    if (other.submittedAt) for (const q of questionsInScope(inPaper, other.mode, other.section)) seen.add(q.id);
  }
  const evidence = BankRepository.loadEvidenceForPapers([attempt.paperId], userId);
  const byId = new Map(inPaper.map((q) => [q.id, q]));
  for (const [questionId, rows] of evidence) {
    const q = byId.get(questionId);
    if (q && currentEvidence(q, rows).some((e) => e.authority === "human_review" && e.userId === userId)) seen.add(questionId);
  }
  // The adaptive-learning loop (/learn) reveals a question's key when the learner checks it there.
  for (const id of BankRepository.questionsSeenInLearning(userId, scope.map((q) => q.id))) seen.add(id);
  return scope.filter((q) => snapshot[q.id]?.answer != null && seen.has(q.id)).length;
}

export function check(attemptId: string, userId: string, body: unknown): BankCheckResult {
  const attempt = ownAttempt(attemptId, userId);
  if (attempt.mode !== "practice") throw new HttpError(409, "Answers can only be checked in practice mode.");
  if (attempt.submittedAt) throw new HttpError(409, "This attempt has already been submitted: open the review.");
  if (!isRecord(body) || !validId(body.questionId)) throw new HttpError(400, "Expected { questionId, answer }.");
  const question = scopeOf(attempt).find((q) => q.id === body.questionId);
  if (!question) throw new HttpError(400, "That question is not part of this attempt.");
  if (changedSinceStart(attempt, question)) {
    throw new HttpError(409, "This question was corrected after you started this attempt, so it cannot be checked here. Start a new practice attempt to see the corrected version.");
  }

  let answer: string | null;
  if (Object.prototype.hasOwnProperty.call(attempt.checked, question.id)) {
    answer = attempt.checked[question.id]; // already committed: the locked answer stands
  } else {
    const raw = body.answer;
    if (raw !== null && (typeof raw !== "string" || !question.options.some((o) => o.id === raw))) {
      throw new HttpError(400, "answer must be one of the question's option ids or null.");
    }
    answer = raw as string | null;
    const checked = { ...attempt.checked, [question.id]: answer };
    const prev = attempt.responses[question.id];
    const responses: BankResponses = {
      ...attempt.responses,
      [question.id]: { ...(prev ?? { seconds: 0, visits: 1, changes: 0, marked: false }), answer },
    };
    if (!BankRepository.saveChecked(attempt.id, userId, responses, checked)) {
      throw new HttpError(409, "This attempt has already been submitted.");
    }
  }

  const key = BankRepository.resolveKeyFor(question.id, userId)!;
  return {
    questionId: question.id,
    outcome: outcomeFor(snapshotOf(key, presentable(question)), { answer, seconds: 0, visits: 0, changes: 0, marked: false }),
    key: toKeyView(key),
    sourceSolution: question.sourceSolution,
    explanation: explanationFor(BankRepository.getExplanation(question.id), key),
    imageUrl: imageUrlFor(question, true),
  };
}

export function review(attemptId: string, userId: string): BankReview {
  const attempt = ownAttempt(attemptId, userId);
  if (!attempt.submittedAt || !attempt.stored) throw new HttpError(409, "The review opens after you submit the attempt.");
  const scope = scopeOf(attempt);
  const keys = BankRepository.resolveKeysForQuestions(scope, userId);
  const explanations = BankRepository.getExplanationsForPaper(attempt.paperId);
  const snapshot = attempt.stored.keySnapshot ?? {};
  const questions: BankReviewQuestion[] = scope.map((q) => {
    const key = keys.get(q.id)!;
    const current = snapshotOf(key, presentable(q));
    const atSubmit = snapshot[q.id] ?? current;
    // Recorded since content fingerprints were added: the text may have been corrected since.
    const contentChanged = typeof atSubmit.fp === "string" && atSubmit.fp !== contentFingerprint(q);
    const response = attempt.responses[q.id] ?? null;
    const out: BankReviewQuestion = {
      ...toQuestionForAttempt(q, key, true),
      response,
      outcome: outcomeFor(atSubmit, response),
      key: toKeyView(key),
      sourceSolution: q.sourceSolution,
      explanation: explanationFor(explanations.get(q.id), key),
    };
    if (atSubmit.status !== current.status || atSubmit.answer !== current.answer) out.keyAtSubmit = { status: atSubmit.status, answer: atSubmit.answer };
    if (contentChanged) out.contentChangedSinceSubmit = true;
    return out;
  });
  return { attempt: toAttemptView(attempt), result: attempt.stored.result, questions };
}

// ------------------------------------------------------------------ disputes
export function resolveDispute(questionId: string, userId: string, body: unknown): { key: BankKeyView } {
  const question = validId(questionId) ? BankRepository.getQuestionFor(questionId, userId) : null;
  if (!question) throw new HttpError(404, "Question not found.");
  // Resolving shows every source's answer and makes the learner's pick their key: only after
  // they have answered the question themselves.
  if (!learnerCommitted(userId, question)) {
    throw new HttpError(403, "A disputed question can be resolved once you have submitted it or checked it in practice.");
  }
  if (!isRecord(body) || !("answer" in body)) throw new HttpError(400, "Expected { answer: optionId | null, note? }.");
  const { answer, note } = body;
  if (answer !== null && (typeof answer !== "string" || !question.options.some((o) => o.id === answer))) {
    throw new HttpError(400, "answer must be one of the question's option ids, or null to treat it as dropped.");
  }
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > MAX_NOTE_CHARS)) {
    throw new HttpError(400, `note must be text of at most ${MAX_NOTE_CHARS} characters.`);
  }
  const evidence = currentEvidence(question, BankRepository.loadEvidenceForQuestion(question.id, userId));
  const optionIds = question.options.map((o) => o.id);
  const current = resolveAnswerKey(evidence, optionIds);
  if (current.status !== "disputed") {
    throw new HttpError(409, "Only a disputed question can be resolved, and this one is not disputed for you.");
  }
  // Would a review change anything? The resolver lets SSC evidence outrank a review, so a dispute
  // between SSC sources cannot be settled here: refuse rather than store a no-op.
  const trial: AnswerEvidence = {
    authority: "human_review",
    sourceGroup: `learner:${userId}`,
    sourceLabel: "Your review",
    answer: answer as string | null,
    dropped: answer === null,
    observedAt: new Date().toISOString(),
  };
  const withReview = resolveAnswerKey([...evidence.filter((e) => !(e.authority === "human_review")), trial], optionIds);
  if (withReview.status === "disputed") {
    throw new HttpError(409, "The SSC sources for this question disagree with each other; a review cannot override SSC evidence.");
  }
  BankRepository.upsertHumanReview(question, userId, answer as string | null, typeof note === "string" ? note : null);
  return { key: toKeyView(BankRepository.resolveKeyFor(question.id, userId)!) };
}
