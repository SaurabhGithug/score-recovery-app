/**
 * Imports a QuestionExportFile (written by scripts/generate-standard-questions.mjs) into a
 * database, re-validating every question against the CURRENT text of the standard there. The file
 * is never trusted: a tampered, stale or unverified entry is skipped with its reason, and a unit
 * with no valid entries keeps whatever questions it already has.
 */
import { getDatabase } from "../../db";
import { HttpError } from "../../bank/http";
import { QuizRepository, clauseFingerprint, type NewQuestion } from "../quiz-repo";
import { OPTION_IDS, type CheckIndependence, type OptionId, type QuestionLevel, type QuizOption } from "../../../standards/quiz-types";
import { checkAgainstText, checkShape, dedupe, questionId, type DraftQuestion } from "./gates";
import { loadStandard } from "./generate";
import { knownClauseNumbers } from "./units";

export interface ImportReport {
  standardId: string;
  code: string;
  entries: number;
  imported: number;
  skipped: { index: number; clauseNo: string; reason: string; detail: string; stem: string }[];
  skippedByReason: Record<string, number>;
  units: Record<string, { imported: number; skipped: number; replaced: boolean }>;
  warnings: string[];
}

const INDEPENDENCE: CheckIndependence[] = ["other_provider", "same_vendor", "same_model"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function importQuestionFile(
  userId: string,
  file: unknown,
  options: { target: "sqlite" | "postgres"; includeReview?: boolean }
): Promise<ImportReport> {
  const f = (file ?? {}) as Record<string, unknown>;
  if (f.version !== 1) throw new HttpError(400, "Not a version 1 question export file.");
  if (!Array.isArray(f.questions)) throw new HttpError(400, "The file has no questions list.");
  const code = str(f.standardCode);
  if (!code) throw new HttpError(400, "The file names no standard (standardCode).");
  const { standard, clauses } = await loadStandard(userId, code);
  const byNo = new Map(clauses.map((c) => [c.clause_no, c]));
  const known = knownClauseNumbers(clauses);

  const report: ImportReport = { standardId: standard.id, code, entries: f.questions.length, imported: 0, skipped: [], skippedByReason: {}, units: {}, warnings: [] };
  if (str(f.contentFp) && f.contentFp !== standard.content_fp) {
    report.warnings.push("The file was written from a different import of this standard's text; each question is checked against its clause's current text.");
  }
  const unitOf = (no: string) => (report.units[no] ??= { imported: 0, skipped: 0, replaced: false });
  const skip = (index: number, clauseNo: string, reason: string, detail: string, stem: string) => {
    report.skipped.push({ index, clauseNo, reason, detail: detail.slice(0, 300), stem: stem.slice(0, 160) });
    report.skippedByReason[reason] = (report.skippedByReason[reason] ?? 0) + 1;
    if (clauseNo) unitOf(clauseNo).skipped++;
  };

  const valid = new Map<string, (NewQuestion & { index: number })[]>();
  f.questions.forEach((raw, index) => {
    const q = (raw ?? {}) as Record<string, unknown>;
    const clauseNo = str(q.clauseNo);
    const stem = str(q.stem);
    const unit = byNo.get(clauseNo);
    if (!unit) return skip(index, clauseNo, "unknown_clause", `no unit "${clauseNo}" in ${code}`, stem);
    if (q.clauseFp !== clauseFingerprint(unit)) return skip(index, clauseNo, "stale", "written from a different text of this clause", stem);

    const status = q.status;
    if (status !== "verified" && !(status === "needs_review" && options.includeReview)) {
      return skip(index, clauseNo, "status", `status "${String(status)}"${status === "needs_review" ? " (pass --include-review to import it, never shown in tests)" : ""}`, stem);
    }
    const independence = q.checkIndependence as CheckIndependence | null;
    if (independence !== null && !INDEPENDENCE.includes(independence)) return skip(index, clauseNo, "shape", "unknown checkIndependence", stem);
    if (status === "verified" && (independence !== "other_provider" || !str(q.checkedBy))) {
      return skip(index, clauseNo, "not_verified", "marked verified without an other-provider check", stem);
    }
    if (!str(q.generatedBy)) return skip(index, clauseNo, "shape", "no generatedBy", stem);

    const rawOptions = Array.isArray(q.options) ? (q.options as unknown[]) : [];
    if (rawOptions.length !== 4) return skip(index, clauseNo, "shape", `${rawOptions.length} options (needs exactly 4)`, stem);
    const opts: QuizOption[] = rawOptions.map((o) => {
      const r = (o ?? {}) as Record<string, unknown>;
      return { id: str(r.id) as OptionId, text: str(r.text) };
    });
    const answer = str(q.answer) as OptionId;
    if (!opts.some((o) => o.id === answer)) return skip(index, clauseNo, "shape", `answer "${answer}" is not one of the options`, stem);
    const notesRaw = q.optionNotes && typeof q.optionNotes === "object" && !Array.isArray(q.optionNotes) ? (q.optionNotes as Record<string, unknown>) : null;
    if (!notesRaw) return skip(index, clauseNo, "shape", "no optionNotes", stem);
    const optionNotes: Partial<Record<OptionId, string>> = {};
    for (const [k, v] of Object.entries(notesRaw)) {
      if (!(OPTION_IDS as string[]).includes(k) || typeof v !== "string") return skip(index, clauseNo, "shape", `bad option note "${k}"`, stem);
      optionNotes[k as OptionId] = v.trim();
    }
    const difficulty = Number(q.difficulty);
    const draft: DraftQuestion = {
      stem,
      options: opts,
      answer,
      explanation: str(q.explanation),
      optionNotes,
      proofQuote: str(q.proofQuote),
      proofClauseNo: str(q.proofClauseNo),
      difficulty: (difficulty === 1 || difficulty === 2 || difficulty === 3 ? difficulty : 0) as 1 | 2 | 3,
      level: str(q.level) as QuestionLevel,
    };
    const shaped = checkShape(draft);
    if (!shaped.ok) return skip(index, clauseNo, shaped.rejection.reason, shaped.rejection.detail, stem);
    const grounded = checkAgainstText(shaped.draft, unit, known);
    if (!grounded.ok) return skip(index, clauseNo, grounded.rejection.reason, grounded.rejection.detail, stem);
    const d = grounded.draft;
    // Stored as given (a valid file already holds the body's own text); never as a "fixed" quote.
    if (d.proofQuote !== draft.proofQuote) return skip(index, clauseNo, "quote_not_verbatim", "quote differs from the clause text in case, quotes or dashes", stem);
    const createdAt = str(q.createdAt) && !Number.isNaN(Date.parse(str(q.createdAt))) ? str(q.createdAt) : new Date().toISOString();
    const list = valid.get(clauseNo) ?? [];
    list.push({
      index,
      id: questionId(standard.id, clauseNo, d.stem, d.options.find((o) => o.id === d.answer)!.text),
      clauseNo,
      clauseFp: clauseFingerprint(unit),
      stem: d.stem,
      options: d.options,
      answer: d.answer,
      explanation: d.explanation,
      optionNotes: d.optionNotes,
      proofQuote: d.proofQuote,
      proofClauseNo: d.proofClauseNo,
      difficulty: d.difficulty,
      level: d.level,
      status: status as "verified" | "needs_review",
      generatedBy: str(q.generatedBy),
      checkedBy: str(q.checkedBy) || null,
      checkIndependence: independence,
      createdAt,
    });
    valid.set(clauseNo, list);
  });

  for (const [clauseNo, list] of valid) {
    const unique = dedupe(list);
    for (const r of unique.rejections) {
      const dup = list.find((q) => q.stem.slice(0, 200) === r.stem);
      skip(dup?.index ?? -1, clauseNo, r.reason, r.detail, r.stem);
    }
    if (!unique.kept.length) continue;
    if (getDatabase().dialect !== options.target) throw new Error(`Refusing to write: expected a ${options.target} database, connected to ${getDatabase().dialect}.`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    await QuizRepository.replaceClauseQuestions(standard.id, clauseNo, unique.kept.map(({ index, ...q }) => q));
    unitOf(clauseNo).imported = unique.kept.length;
    unitOf(clauseNo).replaced = true;
    report.imported += unique.kept.length;
  }
  return report;
}
