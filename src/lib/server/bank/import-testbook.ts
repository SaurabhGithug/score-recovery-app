/**
 * Imports Testbook SSC JE Civil mock tests (TestbookImport JSON, validated by
 * parseTestbookImport in src/lib/testbook.ts) into the question bank as kind "mock".
 * Idempotent per (learner, Testbook test id): re-importing updates that learner's paper in place.
 *
 * The capture comes from the learner's browser, so nothing in it is trusted beyond that learner:
 * the paper is private to them (owner_user_id), and its keys are evidence scoped to them. A
 * learner cannot put a "portal-verified" key into anyone else's bank. (It is also Testbook's
 * paid content from their own account, which must not be shared.)
 *
 * Keys: only portal_verified questions get evidence (authority testbook_portal, source group
 * testbook) with the portal's own solution text as source_solution. Pending questions get no
 * evidence and so stay unscored (no_key). The learner's own attempt data (originalResult, score)
 * is not copied.
 */
import type { BankPaperCode, BankTestbookImportResult } from "../../bank/api-types";
import { parseTestbookImport, type TestbookImport } from "../../testbook";
import { HttpError } from "./http";
import { BankRepository, type GlobalEvidenceUpsert, type QuestionUpsert } from "../repositories/bank-repo";

const RIGHTS_NOTE = "Testbook mock test captured from the learner's own Testbook account — personal study only; do not redistribute.";

function slug(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
}

export function paperCodeFromTitle(title: string): BankPaperCode {
  return /\bpaper[\s-]*(2|ii)\b/i.test(title) ? "P2" : "P1";
}

export function testbookPaperId(userId: string, testId: string): string {
  return `testbook-${slug(userId)}-${slug(testId)}`;
}

/** Bank id of one captured Testbook question (the ids importTestbook assigns). */
export function testbookQuestionId(userId: string, testId: string, questionId: string): string {
  return `${testbookPaperId(userId, testId)}-${slug(questionId)}`;
}

function validate(value: unknown): TestbookImport {
  let data: TestbookImport;
  try {
    data = parseTestbookImport(value);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Unsupported Testbook import format.");
  }
  for (const test of data.tests) {
    if (typeof test.id !== "string" || !test.id || typeof test.title !== "string") {
      throw new HttpError(400, "Every test needs a string id and title.");
    }
    for (const q of test.questions) {
      const ok =
        typeof q.id === "string" &&
        typeof q.globalNumber === "number" &&
        typeof q.section === "string" &&
        typeof q.questionText === "string" &&
        q.options.every((o) => typeof o.id === "string" && o.id.length <= 64 && typeof o.text === "string" && Array.isArray(o.assets)) &&
        new Set(q.options.map((o) => o.id)).size === q.options.length;
      if (!ok) throw new HttpError(400, `${test.title}, question ${String(q.globalNumber)} is malformed.`);
    }
  }
  return data;
}

export function importTestbook(value: unknown, userId: string): BankTestbookImportResult {
  if (!userId) throw new HttpError(401, "Sign in to import a Testbook capture.");
  const data = validate(value);
  const result: BankTestbookImportResult = { paperIds: [], questions: 0, keyed: 0, heldOut: 0 };
  const capturedOn = /^\d{4}-\d{2}-\d{2}/.test(data.source.capturedOn) ? data.source.capturedOn.slice(0, 10) : new Date().toISOString().slice(0, 10);

  for (const test of data.tests) {
    const paperId = testbookPaperId(userId, test.id);
    const ordered = [...test.questions].sort((a, b) => a.globalNumber - b.globalNumber);
    const usedIds = new Set<string>();
    const questions: QuestionUpsert[] = [];
    const evidence: GlobalEvidenceUpsert[] = [];

    ordered.forEach((q, index) => {
      let id = testbookQuestionId(userId, test.id, q.id);
      if (usedIds.has(id)) id = `${paperId}-n${index + 1}`;
      usedIds.add(id);
      const verified = q.evidenceState === "portal_verified" && q.portalSolution !== null;
      questions.push({
        id,
        paperId,
        position: index + 1,
        section: q.section || "General",
        stem: q.questionText,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        hasVisual: q.questionAssets.length > 0 || q.options.some((o) => o.assets.length > 0),
        visualPath: null,
        sourcePage: null,
        sourceSolution: verified ? q.portalSolution!.text : null,
        topic: q.syllabusTopic,
        topicEvidence: q.topicEvidence,
        metadata: {
          testbook_question_id: q.id,
          global_number: q.globalNumber,
          section_question: q.sectionQuestion,
          marks_text: q.marksText,
          text_quality: "text_layer",
          image_url: q.questionAssets[0] ?? null,
          question_assets: q.questionAssets,
          option_assets: Object.fromEntries(q.options.map((o) => [o.id, o.assets])),
          evidence_state: q.evidenceState,
        },
      });
      if (verified) {
        result.keyed += 1;
        evidence.push({
          questionId: id,
          authority: "testbook_portal",
          sourceGroup: "testbook",
          sourceLabel: `Testbook portal solution — ${test.title}, Q${q.globalNumber}`,
          answer: q.portalSolution!.correctOption,
          detail: { testId: test.id, questionId: q.id, evidenceText: q.portalSolution!.evidenceText, sourceUrl: data.source.sourceUrl },
        });
      } else {
        result.heldOut += 1;
      }
    });

    BankRepository.transaction(() => {
      BankRepository.upsertPaper({
        id: paperId,
        kind: "mock",
        paper: paperCodeFromTitle(test.title),
        cycleYear: null,
        examDate: null,
        shift: null,
        title: test.title,
        questionCount: questions.length,
        durationMinutes: 120,
        fidelity: "provider_mock",
        publisher: "Testbook",
        sourceUrl: data.source.sourceUrl || null,
        sourceFile: null,
        sourceSha256: null,
        capturedOn,
        rightsNote: RIGHTS_NOTE,
        ownerUserId: userId,
        metadata: {
          importer: "testbook",
          testbook_test_id: test.id,
          series: data.source.series,
          languages: ["en"],
          sections: test.sections,
          max_score: test.maxScore,
        },
      });
      // upsertPaper never re-owns an existing paper; refuse rather than write into someone else's.
      if (BankRepository.getPaper(paperId)?.ownerUserId !== userId) {
        throw new HttpError(409, "This capture's paper id belongs to another owner.");
      }
      BankRepository.parkPositions(paperId);
      for (const q of questions) BankRepository.upsertQuestion(q);
      BankRepository.deleteQuestionsNotIn(paperId, questions.map((q) => q.id));
      const wanted = new Set(evidence.map((e) => `${e.questionId}\u0000${e.sourceLabel}`));
      for (const row of BankRepository.listScopedEvidenceForPaper(paperId, userId)) {
        if (row.authority === "testbook_portal" && !wanted.has(`${row.questionId}\u0000${row.sourceLabel}`)) {
          BankRepository.deleteEvidence(row.id);
        }
      }
      for (const e of evidence) BankRepository.upsertScopedEvidence(e, userId);
    });

    result.paperIds.push(paperId);
    result.questions += questions.length;
  }
  return result;
}
