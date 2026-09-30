/**
 * Maps bank records to the HTTP shapes in src/lib/bank/api-types.ts.
 *
 * Pre-submit views (toQuestionForAttempt with reveal=false) must never carry a key, evidence,
 * source solution or explanation. Original PYP crops are also withheld pre-submit: they are
 * images of the SSC response sheet, whose tick/cross icons and green option text (or the printed
 * "Correct Answer" line in the older QID layout) show the key. Pre-submit views get the verified
 * key-free "clean" crop instead (services/pyp-redact), when the importer recorded one.
 */
import { isScored, KEY_STATUS_LABEL, type AnswerEvidence, type ResolvedKey } from "../../bank/answer-key";
import type {
  BankAttemptStub,
  BankEvidenceView,
  BankExplanation,
  BankExplanationOption,
  BankKeyView,
  BankLanguage,
  BankOption,
  BankPaperSummary,
  BankQuestionForAttempt,
  BankSection,
  BankTextQuality,
  BankAttempt,
} from "../../bank/api-types";
import type { BankAttemptRecord, BankExplanationRecord, BankPaperRecord, BankQuestionRecord } from "../repositories/bank-repo";
import { presentable } from "./presentable";
import { cleanCropVerified, originalCropVerified } from "./crop-verify";

export const ASSET_ROUTE_PREFIX = "/api/bank/assets/";
export const CLEAN_ASSET_ROUTE_PREFIX = ASSET_ROUTE_PREFIX + "clean/";

function assetPath(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

function evidenceView(row: AnswerEvidence): BankEvidenceView {
  return { authority: row.authority, sourceLabel: row.sourceLabel, answer: row.answer, dropped: row.dropped };
}

export function toKeyView(key: ResolvedKey): BankKeyView {
  const scored = isScored(key.status);
  return {
    status: key.status,
    statusLabel: KEY_STATUS_LABEL[key.status],
    answer: scored ? key.answer : null,
    scored,
    basis: key.basis.map(evidenceView),
    dissent: key.dissent.map(evidenceView),
  };
}

const TEXT_QUALITIES: ReadonlySet<string> = new Set(["text_layer", "bilingual_en", "ocr", "garbled"]);

function textQualityOf(q: BankQuestionRecord): BankTextQuality {
  const raw = q.metadata.text_quality;
  // Unknown or missing quality is never presented as clean text: the UI then leads with the image.
  return typeof raw === "string" && TEXT_QUALITIES.has(raw) ? (raw as BankTextQuality) : "garbled";
}

interface StoredTranslation {
  stem?: unknown;
  options?: unknown;
  textQuality?: unknown;
}

function hindiTranslation(q: BankQuestionRecord): { stem: string; options: BankOption[] } | null {
  const translations = q.metadata.translations as Record<string, StoredTranslation> | undefined;
  const hi = translations?.hi;
  if (!hi || typeof hi.stem !== "string" || !hi.stem || !Array.isArray(hi.options)) return null;
  if (hi.textQuality === "garbled") return null; // Devanagari stored in visual order: not trustworthy text
  const options = (hi.options as unknown[]).filter(
    (o): o is BankOption => typeof o === "object" && o !== null && typeof (o as BankOption).id === "string" && typeof (o as BankOption).text === "string"
  );
  if (options.length !== q.options.length) return null;
  return { stem: hi.stem, options: options.map((o) => ({ id: o.id, text: o.text })) };
}

/**
 * URL of the question's verified key-free crop, or null. Only a clean crop the importer recorded
 * for this very crop path (metadata.clean_crop === visualPath) counts.
 */
export function cleanImageUrlFor(q: BankQuestionRecord): string | null {
  if (!cleanCropVerified(q)) return null;
  // Versioned by the verified bytes: a re-import that puts another question at this path gets a new URL.
  return `${CLEAN_ASSET_ROUTE_PREFIX}${assetPath(q.visualPath!)}?v=${String(q.metadata.clean_sha256).slice(0, 12)}`;
}

/**
 * Image for a question. Provider images always. PYP: the original crop (it shows the key) only
 * when `reveal` (post-submit / checked) and pyp-redact proved it holds one question and no
 * candidate or print data (metadata.original_crop_ok); otherwise the key-free clean crop, or null.
 */
export function imageUrlFor(q: BankQuestionRecord, reveal: boolean): string | null {
  const external = q.metadata.image_url;
  if (typeof external === "string" && external.startsWith("https://")) return external;
  if (!reveal || !originalCropVerified(q)) return cleanImageUrlFor(q);
  return `${ASSET_ROUTE_PREFIX}${assetPath(q.visualPath!)}?v=${String(q.metadata.original_sha256).slice(0, 12)}`;
}

export function toQuestionForAttempt(q: BankQuestionRecord, key: ResolvedKey, reveal = false): BankQuestionForAttempt {
  const out: BankQuestionForAttempt = {
    id: q.id,
    position: q.position,
    section: q.section,
    stem: q.stem,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    hasFigure: q.hasVisual,
    imageUrl: imageUrlFor(q, reveal),
    textQuality: textQualityOf(q),
    scored: isScored(key.status) && presentable(q),
  };
  if (!presentable(q)) out.unavailable = true;
  const clean = cleanImageUrlFor(q);
  if (clean) out.cleanImageUrl = clean;
  const hi = hindiTranslation(q);
  if (hi) out.translations = { hi };
  return out;
}

export function sectionsOf(questions: Pick<BankQuestionRecord, "section" | "position">[]): BankSection[] {
  const out: BankSection[] = [];
  for (const q of [...questions].sort((a, b) => a.position - b.position)) {
    const last = out[out.length - 1];
    if (last && last.name === q.section) last.count += 1;
    else out.push({ name: q.section, firstPosition: q.position, count: 1 });
  }
  return out;
}

export function toAttemptView(a: BankAttemptRecord): BankAttempt {
  return {
    id: a.id,
    paperId: a.paperId,
    mode: a.mode,
    section: a.section,
    startedAt: a.startedAt,
    durationSeconds: a.durationSeconds,
    submittedAt: a.submittedAt,
    checkedQuestionIds: Object.keys(a.checked),
  };
}

export function toAttemptStub(a: BankAttemptRecord): BankAttemptStub {
  return {
    id: a.id,
    mode: a.mode,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    score: a.stored?.result.score ?? null,
    maxScore: a.stored?.result.maxScore ?? null,
    ...(typeof a.stored?.result.priorExposure === "number" ? { priorExposure: a.stored.result.priorExposure } : {}),
  };
}

function languagesOf(paper: BankPaperRecord): BankLanguage[] {
  const raw = paper.metadata.languages;
  if (!Array.isArray(raw)) return ["en"];
  const langs = raw.filter((l): l is BankLanguage => l === "en" || l === "hi");
  return langs.length ? langs : ["en"];
}

export function toPaperSummary(
  paper: BankPaperRecord,
  questions: BankQuestionRecord[],
  keys: Map<string, ResolvedKey>,
  attempts: BankAttemptRecord[]
): BankPaperSummary {
  const keyCounts: BankPaperSummary["keyCounts"] = {};
  let scoredCount = 0;
  for (const q of questions) {
    const key = keys.get(q.id);
    const status = key?.status ?? "no_key";
    keyCounts[status] = (keyCounts[status] ?? 0) + 1;
    if (isScored(status) && presentable(q)) scoredCount += 1;
  }
  return {
    id: paper.id,
    kind: paper.kind,
    exam: "SSC_JE",
    branch: "CIVIL",
    paper: paper.paper,
    cycleYear: paper.cycleYear,
    examDate: paper.examDate,
    shift: paper.shift,
    title: paper.title,
    questionCount: questions.length,
    durationMinutes: paper.durationMinutes,
    publisher: paper.publisher,
    fidelity: paper.fidelity,
    languages: languagesOf(paper),
    keyCounts,
    scoredCount,
    attempts: attempts.map(toAttemptStub),
  };
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
}

/**
 * bank_explanations.note holds JSON with the BankExplanation teaching fields
 * (topic, concept, steps, whyCorrect, options, traps, examTip, verificationLimits).
 * Returns null when there is no note, it is malformed, or it is stale: written against an
 * answer that is no longer the learner's scored key.
 */
export function explanationFor(row: BankExplanationRecord | null | undefined, key: ResolvedKey): BankExplanation | null {
  if (!row) return null;
  if (!isScored(key.status) || key.answer === null || row.lockedAnswer !== key.answer) return null;
  // A learner's own resolution is their choice, not a verified key; and a note never stands next
  // to a key an independent AI solve now rejects (explain.ts writes neither; an older note is hidden).
  if (key.status === "reviewed" || key.dissent.some((e) => e.authority === "ai_blind_solve")) return null;
  let note: Record<string, unknown>;
  try {
    const parsed = JSON.parse(row.note) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    note = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const steps = strings(note.steps);
  const traps = strings(note.traps);
  const limits = strings(note.verificationLimits);
  if (
    typeof note.topic !== "string" ||
    typeof note.concept !== "string" ||
    typeof note.whyCorrect !== "string" ||
    typeof note.examTip !== "string" ||
    !steps ||
    !traps ||
    !limits ||
    !Array.isArray(note.options)
  ) {
    return null;
  }
  const options: BankExplanationOption[] = [];
  for (const o of note.options as unknown[]) {
    if (typeof o !== "object" || o === null) return null;
    const opt = o as Record<string, unknown>;
    if (typeof opt.id !== "string" || typeof opt.why !== "string" || (opt.verdict !== "correct" && opt.verdict !== "wrong")) return null;
    options.push({ id: opt.id, verdict: opt.verdict, why: opt.why });
  }
  return {
    lockedAnswer: row.lockedAnswer,
    topic: note.topic,
    concept: note.concept,
    steps,
    whyCorrect: note.whyCorrect,
    options,
    traps,
    examTip: note.examTip,
    verificationLimits: limits,
    model: row.model,
    createdAt: row.createdAt,
  };
}
