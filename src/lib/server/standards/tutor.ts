/**
 * The standards tutor (IS/ISO/IEC 17025 first): an AI lesson per clause and free questions about
 * the standard, for the account that owns it.
 *
 * Truth rules:
 * - The standard's own text is the authority. The whole standard goes to the model with every
 *   call, so it can quote and cross-link real clause numbers instead of recalling them.
 * - Anything from outside the text (NABL practice, ILAC policy, history, examples) comes from
 *   Google Search grounding where possible and must be marked as not from the standard.
 * - Every answer is labelled AI-generated in the UI, and a second AI checks it against the text
 *   in the background (misquotes, wrong "shall"/"should", invented clauses or NABL documents).
 * - Money: every call goes through followup.ts callGemini, which reserves the worst case against
 *   the server's 24-hour AI limit before calling.
 */
import crypto from "node:crypto";
import { HttpError } from "../bank/http";
import { callGemini, checkers, followUpDeps, parseCheck, runCheck, type AnswerCheck, type FollowUpDeps } from "../followup/followup";
import type { GeminiTurn } from "../followup/gemini";
import { StandardsRepository, type ClauseRow, type LessonRow, type StandardRow } from "./repo";

const MAX_OUTPUT_TOKENS = 8192;
export const MAX_QUESTION_CHARS = 1500;
const MAX_HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 8000;

export type TutorLang = "en" | "hi";

export interface Lesson {
  clauseNo: string;
  text: string;
  model: string;
  grounded: boolean;
  sources: { title: string; uri: string }[];
  searchEntryPointHtml: string | null;
  createdAt: string;
  check: AnswerCheck;
}

export interface TutorAnswer {
  answer: string;
  model: string;
  grounded: boolean;
  sources: { title: string; uri: string }[];
  searchEntryPointHtml: string | null;
  aiGenerated: true;
  check: { id: string | null; status: AnswerCheck["status"] };
}

// ---------------------------------------------------------------- the standard as context

async function load(userId: string, standardId: unknown): Promise<{ standard: StandardRow; clauses: ClauseRow[] }> {
  if (typeof standardId !== "string" || !/^std_[0-9a-f]{16}$/.test(standardId)) throw new HttpError(404, "No such standard.");
  const standard = await StandardsRepository.find(standardId, userId);
  if (!standard) throw new HttpError(404, "No such standard.");
  return { standard, clauses: await StandardsRepository.clauses(standardId) };
}

function heading(c: ClauseRow): string {
  const label = c.clause_no === "NF" ? "National Foreword" : c.clause_no === "intro" ? "Introduction" : /^[A-Z]$/.test(c.clause_no) ? c.title : `${c.clause_no} ${c.title}`;
  return `${label} [page ${c.page}]`;
}

function standardText(standard: StandardRow, clauses: ClauseRow[]): string {
  return [
    `=== FULL TEXT OF ${standard.code}: ${standard.title} (verbatim, page furniture removed) ===`,
    ...clauses.map((c) => `--- ${heading(c)} ---\n${c.body || "(heading only; see its sub-clauses)"}`),
    "=== END OF STANDARD ===",
  ].join("\n\n");
}

function descendants(clauses: ClauseRow[], no: string): ClauseRow[] {
  return clauses.filter((c) => c.clause_no !== no && (c.clause_no.startsWith(`${no}.`) || (/^[A-Z]$/.test(no) && c.clause_no.startsWith(`${no}.`))));
}

function langLine(lang: TutorLang): string {
  return lang === "hi"
    ? "Write in simple Hindi (Devanagari script). Keep technical terms (calibration, traceability, impartiality, proficiency testing, measurement uncertainty, etc.) in English, and quote the standard in its original English."
    : "Write in clear, simple English for a learner who is new to laboratory quality systems.";
}

const RULES = [
  "TRUTH RULES:",
  "- The standard's text given to you is the only authority on what the standard says. Quote it exactly when you quote, with the clause number, and keep its verbs exact: 'shall' is a requirement, 'should' a recommendation, 'may' a permission, 'can' a possibility. Never turn a 'should' or a NOTE into a 'shall'.",
  "- Cite clause numbers only if they exist in the given text. Never invent clause numbers, values, deadlines, frequencies or documents.",
  "- When you go beyond the text (why it exists, how NABL or accreditation bodies apply it, ILAC policies, industry practice, history, examples), say so plainly, e.g. 'In practice…' or 'NABL's guidance (not part of this standard)…', and rely on Google Search for current facts such as NABL document numbers and policies. If you are not sure of an outside fact, say you are not sure rather than guess.",
  "- In India, laboratory accreditation against this standard is granted by NABL (National Accreditation Board for Testing and Calibration Laboratories, a constituent board of the Quality Council of India). BIS adopted this standard as an Indian Standard and also runs and recognises laboratories for product certification. Use this context where it helps; check current specifics with search.",
].join("\n");

const LESSON_SYSTEM = [
  "You are an expert tutor on laboratory quality and accreditation (ISO/IEC 17025, NABL assessment practice) teaching a learner one clause at a time.",
  RULES,
  "Write the lesson in Markdown with exactly these '## ' headings, in this order (skip a heading only if it truly has nothing to say):",
  "## What the clause says — each requirement in plain words, as a numbered list with its sub-clause number in brackets, e.g. '(6.4.7)'. Quote the key phrase of each requirement exactly.",
  "## Why it exists — the purpose: what goes wrong for the customer, the regulator or the lab if this is missing. Give the reasoning, not slogans.",
  "## When it applies — the situations and triggers that bring it into play, who in the lab is responsible, and when it does NOT apply or applies differently (testing vs calibration vs sampling, Option A vs B, etc.).",
  "## How a lab meets it — the concrete procedures, records and evidence a lab keeps. Use one short worked example from a realistic Indian testing or calibration laboratory.",
  "## What an assessor checks — the questions an accreditation assessor asks and the objective evidence they look for.",
  "## Common mistakes and nonconformities — typical findings against this clause and how to avoid them.",
  "## Connected clauses — other clauses of this standard that work with this one, with clause numbers and one line on how they connect.",
  "## Remember — 4 to 6 short points worth memorising, then 3 self-test questions with their answers on the next line, each answer citing the clause.",
  "Be thorough but tight: no filler, no repeated points.",
].join("\n");

const ASK_SYSTEM = [
  "You are an expert tutor on laboratory quality and accreditation (ISO/IEC 17025, NABL assessment practice) answering a learner's questions about the standard given below.",
  RULES,
  "Answer the learner's question directly first, then explain why and when, with clause numbers for every claim about the standard. Use short '## ' headings and lists when the answer is long. If the question is outside this standard, say so briefly and answer only what you can support.",
].join("\n");

const VERIFY_SYSTEM = [
  "You check an AI tutor's text about a laboratory standard (ISO/IEC 17025) against the full text of that standard, given below. Output JSON only.",
  'Return exactly: {"verdict": "consistent" | "issues" | "cannot_verify", "issues": [{"claim": "<the tutor\'s statement, quoted briefly>", "problem": "<what is wrong>", "correction": "<the correct statement, or null>"}], "keyConcern": false}',
  "Check: (1) misquotes or misstatements of what a clause requires, including 'shall' vs 'should' vs NOTE; (2) clause numbers that are wrong or do not exist; (3) requirements attributed to the standard that are not in it; (4) invented or clearly wrong outside facts (NABL or ILAC document numbers, policies, dates). List only real problems, at most 5; do not nitpick wording, style or reasonable practical advice that is marked as practice.",
  'verdict "consistent" means you found no problems. Use "cannot_verify" only when the text depends on something you cannot check.',
].join("\n");

// ---------------------------------------------------------------- lessons

function lessonFp(standard: StandardRow, lang: TutorLang): string {
  return `${standard.content_fp}:${lang}:v1`;
}

/** A check still "pending" after this long was cut off (instance stopped, time limit): report it as failed. */
const STALE_PENDING_MS = 10 * 60 * 1000;

function expireStale(check: AnswerCheck, createdAt: string): AnswerCheck {
  return check.status === "pending" && Date.now() - Date.parse(createdAt) > STALE_PENDING_MS
    ? { status: "failed", error: "The second AI's check did not finish. Regenerate to check again." }
    : check;
}

function toLesson(row: LessonRow): Lesson {
  let check: AnswerCheck = { status: "pending" };
  if (row.check_result) {
    try { check = JSON.parse(row.check_result) as AnswerCheck; } catch { check = { status: "failed", error: "The stored check could not be read." }; }
  }
  let sources: Lesson["sources"] = [];
  try { sources = JSON.parse(row.sources); } catch { /* keep none */ }
  return { clauseNo: row.clause_no, text: row.lesson, model: row.model, grounded: row.grounded === 1, sources, searchEntryPointHtml: row.search_html, createdAt: row.created_at, check: expireStale(check, row.created_at) };
}

/** Lessons already made for this standard, keyed by clause (only those for the current text and language). */
export async function storedLessons(userId: string, standardId: unknown, lang: TutorLang): Promise<Record<string, Lesson>> {
  const { standard } = await load(userId, standardId);
  const out: Record<string, Lesson> = {};
  for (const row of await StandardsRepository.lessons(standard.id)) {
    if (row.content_fp === lessonFp(standard, lang)) out[row.clause_no] = toLesson(row);
  }
  return out;
}

const lessonsInFlight = new Map<string, Promise<Lesson>>();
const checkJobs = new Set<Promise<void>>();

/** The lesson for one clause: cached, or made now (one generation at a time per clause). */
export async function clauseLesson(
  userId: string,
  input: { standardId: unknown; clauseNo: unknown; regenerate?: unknown; lang?: unknown },
  deps: FollowUpDeps = followUpDeps()
): Promise<Lesson> {
  const { standard, clauses } = await load(userId, input.standardId);
  const clause = clauses.find((c) => c.clause_no === input.clauseNo);
  if (!clause) throw new HttpError(404, "No such clause in this standard.");
  const lang: TutorLang = input.lang === "hi" ? "hi" : "en";
  const fp = lessonFp(standard, lang);

  const cached = await StandardsRepository.lesson(standard.id, clause.clause_no);
  if (cached && cached.content_fp === fp && input.regenerate !== true) return toLesson(cached);

  const key = `${standard.id}:${clause.clause_no}`;
  const running = lessonsInFlight.get(key);
  if (running) return running;
  const job = makeLesson(deps, userId, standard, clauses, clause, lang, fp).finally(() => lessonsInFlight.delete(key));
  lessonsInFlight.set(key, job);
  return job;
}

async function makeLesson(deps: FollowUpDeps, userId: string, standard: StandardRow, clauses: ClauseRow[], clause: ClauseRow, lang: TutorLang, fp: string): Promise<Lesson> {
  if (!deps.googleKey) throw new HttpError(503, "Lessons use Google Gemini, which is not set up on this server (GOOGLE_GENERATIVE_AI_API_KEY is missing).");
  const children = descendants(clauses, clause.clause_no);
  const focus = [
    `TEACH THIS CLAUSE: ${heading(clause)}`,
    clause.body ? `Its text:\n${clause.body}` : "",
    children.length
      ? `It is a heading over these sub-clauses; teach it as an overview of them (what the group as a whole is for, then each sub-clause briefly):\n${children.map((c) => `- ${c.clause_no} ${c.title}`).join("\n")}`
      : "",
    clause.clause_no === "NF" ? "This is the BIS National Foreword: explain what it tells an Indian reader about the standard's adoption, changes from the 2005 edition and how to read it." : "",
    /^3\.\d+$/.test(clause.clause_no) ? "This is a defined term: explain the definition, why the standard defines it, where in the standard the term matters (clause numbers), and how it differs from terms people confuse it with." : "",
    langLine(lang),
  ].filter(Boolean).join("\n\n");

  const turns: GeminiTurn[] = [{ role: "user", text: `${standardText(standard, clauses)}\n\n${focus}` }];
  const result = await callGemini(deps, userId, { model: deps.geminiModel, system: LESSON_SYSTEM, turns, grounded: true, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingLevel: "MEDIUM" }, true);
  const text = result.text.trim();
  if (!text) throw new HttpError(502, "Google returned an empty lesson. Try again.");

  const createdAt = new Date().toISOString();
  await StandardsRepository.saveLesson(standard.id, {
    clause_no: clause.clause_no,
    content_fp: fp,
    lesson: text,
    model: deps.geminiModel,
    grounded: result.grounded ? 1 : 0,
    sources: JSON.stringify(result.sources),
    search_html: result.grounded ? result.searchEntryPointHtml : null,
    created_at: createdAt,
  });

  // The second AI checks the lesson in the background; the verdict is stored with the lesson.
  let check: AnswerCheck = { status: "unavailable" };
  if (checkers(deps, "google").length) {
    check = { status: "pending" };
    const job = verify(deps, userId, standard, clauses, `LESSON ON ${heading(clause)}`, text).then((verdict) =>
      StandardsRepository.saveLessonCheck(standard.id, clause.clause_no, createdAt, verdict)
    );
    track(job);
  } else {
    await StandardsRepository.saveLessonCheck(standard.id, clause.clause_no, createdAt, check);
  }

  return { clauseNo: clause.clause_no, text, model: deps.geminiModel, grounded: result.grounded, sources: result.sources, searchEntryPointHtml: result.grounded ? result.searchEntryPointHtml : null, createdAt, check };
}

function track(job: Promise<void>) {
  const settled = job.catch((err) => console.error("[standards check]", err));
  checkJobs.add(settled);
  void settled.finally(() => checkJobs.delete(settled));
}

async function verify(deps: FollowUpDeps, userId: string, standard: StandardRow, clauses: ClauseRow[], what: string, text: string): Promise<AnswerCheck> {
  try {
    const checked = await runCheck(deps, "google", userId, VERIFY_SYSTEM, async () => ({
      user: `${standardText(standard, clauses)}\n\n${what}\n\nTUTOR'S TEXT TO CHECK:\n${text}`,
      images: [],
    }));
    return { status: "done", ...parseCheck(checked.json), keyConcern: false, checkedBy: checked.model, independence: checked.independence };
  } catch (err) {
    if (!(err instanceof HttpError)) console.error("[standards check]", err);
    return { status: "failed", error: err instanceof HttpError ? err.message : "The second AI could not check this." };
  }
}

// ---------------------------------------------------------------- free questions

const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

function parseHistory(value: unknown): GeminiTurn[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "History must be a list.");
  const turns = value.slice(-MAX_HISTORY_TURNS).map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    if ((t.role !== "user" && t.role !== "model") || typeof t.text !== "string" || !t.text.trim()) throw new HttpError(400, "Each history turn needs a role and text.");
    return { role: t.role, text: t.text.slice(0, MAX_TURN_CHARS) } as GeminiTurn;
  });
  if (turns.length % 2 !== 0 || turns.some((t, i) => t.role !== (i % 2 === 0 ? "user" : "model"))) {
    throw new HttpError(400, "History must alternate learner and AI turns, starting with the learner.");
  }
  return turns;
}

export async function askStandard(
  userId: string,
  input: { standardId: unknown; message: unknown; history?: unknown; clauseNo?: unknown; lang?: unknown },
  deps: FollowUpDeps = followUpDeps()
): Promise<TutorAnswer> {
  if (typeof input.message !== "string" || !input.message.trim()) throw new HttpError(400, "Type a question first.");
  const message = input.message.trim();
  if (message.length > MAX_QUESTION_CHARS) throw new HttpError(400, `Keep the question under ${MAX_QUESTION_CHARS} characters.`);
  const history = parseHistory(input.history);
  const { standard, clauses } = await load(userId, input.standardId);
  if (!deps.googleKey) throw new HttpError(503, "Answers use Google Gemini, which is not set up on this server (GOOGLE_GENERATIVE_AI_API_KEY is missing).");
  const viewing = typeof input.clauseNo === "string" ? clauses.find((c) => c.clause_no === input.clauseNo) : undefined;
  const lang: TutorLang = input.lang === "hi" ? "hi" : "en";

  // The standard rides on the first learner turn; the browser never supplies it.
  const preface = `${standardText(standard, clauses)}\n\n${viewing ? `The learner is currently reading: ${heading(viewing)}.\n\n` : ""}${langLine(lang)}\n\nLEARNER'S QUESTION: `;
  const asked = [...history, { role: "user" as const, text: message }];
  const turns: GeminiTurn[] = asked.map((t, i) => (i === 0 ? { role: "user", text: preface + t.text } : t));

  const result = await callGemini(deps, userId, { model: deps.geminiModel, system: ASK_SYSTEM, turns, grounded: true, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingLevel: "MEDIUM" }, true);
  const answer = result.text.trim();
  if (!answer) throw new HttpError(502, "Google returned an empty answer. Try again.");

  let checkId: string | null = null;
  if (checkers(deps, "google").length) {
    checkId = `schk_${crypto.randomBytes(12).toString("hex")}`;
    await StandardsRepository.saveAnswerCheck(checkId, userId, { status: "pending" });
    const id = checkId;
    track(verify(deps, userId, standard, clauses, `LEARNER'S QUESTION: ${message}`, answer).then((r) => StandardsRepository.saveAnswerCheck(id, userId, r)));
  }

  return {
    answer,
    model: deps.geminiModel,
    grounded: result.grounded,
    sources: result.sources,
    searchEntryPointHtml: result.grounded ? result.searchEntryPointHtml : null,
    aiGenerated: true,
    check: { id: checkId, status: checkId ? "pending" : "unavailable" },
  };
}

/** The second AI's check of an answer this learner asked for; 404 for anyone else or once expired. */
export async function askCheck(userId: string, id: unknown): Promise<AnswerCheck> {
  if (typeof id !== "string" || !/^schk_[0-9a-f]{24}$/.test(id)) throw new HttpError(404, "No such check.");
  const row = await StandardsRepository.answerCheck(id, userId);
  if (!row || Date.now() - Date.parse(row.created_at) > CHECK_TTL_MS) throw new HttpError(404, "No such check (checks are kept for a day).");
  try {
    return expireStale(JSON.parse(row.result) as AnswerCheck, row.created_at);
  } catch {
    return { status: "failed", error: "The stored check could not be read." };
  }
}

/**
 * Waits for every running check. Routes pass this to next/server after(), so on Vercel the
 * instance stays alive until the check is stored; scripts and tests await it directly.
 */
export async function waitForStandardChecks(): Promise<void> {
  await Promise.allSettled([...checkJobs]);
}
