import { createHash } from "node:crypto";
import { getDatabase } from "../db";
import { syllabusContext } from "./syllabus-context";
import type { QuestionStudyContext } from "@/lib/syllabus/study-types";
import type { MadeEasyQuestionWithTest } from "@/lib/madeeasy";

export function recoveryFingerprint(q: MadeEasyQuestionWithTest): string {
  return createHash("sha256").update(JSON.stringify([q.question, q.options, q.correctOption, q.explanation, q.questionHtml, q.optionsHtml])).digest("hex");
}

/** Persisted, content-bound suggestions; they never become verified syllabus tags. */
export async function questionContext(input: { kind: "bank" | "made_easy"; id: string; fingerprint: string; text: string; subjectHint?: string }): Promise<QuestionStudyContext> {
  const db = getDatabase();
  const fingerprint = `subject-scoped-v2:${input.fingerprint}`;
  const cached = await db.prepare("SELECT context, updated_at FROM question_study_contexts WHERE kind = ? AND question_id = ? AND content_fp = ?")
    .get<{ context: string; updated_at: string }>(input.kind, input.id, fingerprint);
  if (cached && Date.now() - Date.parse(cached.updated_at) < 10 * 60 * 1000) return JSON.parse(cached.context);
  const ctx = await syllabusContext(input.text, input.kind === "bank" ? input.id : undefined, input.subjectHint);
  // A subject hint alone is not enough to assign every question to an arbitrary topic.
  const best = ctx.candidates.find(c => (c.kind === "topic" || c.kind === "chapter") && (ctx.fromOwnTags || c.weight > 0.36));
  let subject: QuestionStudyContext["subject"] = null;
  let nodeId: string | null = best?.nodeId ?? null;
  for (let guard = 0; nodeId && guard < 10; guard++) {
    const node = await db.prepare("SELECT id, name, kind, parent_id FROM syllabus_nodes WHERE id = ?")
      .get<{ id: string; name: string; kind: string; parent_id: string | null }>(nodeId);
    if (!node) break;
    if (node.kind === "subject" || node.kind === "part") { subject = { id: node.id, name: node.name }; break; }
    nodeId = node.parent_id;
  }
  const topic = best ? { id: best.nodeId, name: best.path.split(" › ").at(-1)!, path: best.path } : null;
  const scope = topic ? `the SSC JE 2026 syllabus topic “${topic.path}”` : "the SSC JE 2026 syllabus concept tested by this question";
  const context: QuestionStudyContext = {
    exam: "SSC JE Civil · 2026", topic, subject,
    basis: best ? ctx.fromOwnTags ? "tagged" : "suggested" : "unmapped",
    suggestions: [
      { label: "Teach the concept step by step", prompt: `Teach me ${scope} from the basics needed for this question. Explain the rule, each symbol and unit, when it applies, and a worked example. Do not just repeat the source explanation. Stay at SSC JE depth.` },
      { label: "Explain the option traps", prompt: `For this question in ${scope}, explain why the correct option works and why each other option fails. Identify the misconception to avoid in the exam.` },
      { label: "What should I revise?", prompt: `Give me a concise revision checklist for ${scope}: essential facts, formulas, assumptions and common traps. Cite only the supplied past-paper evidence for claims about what SSC has asked.` },
      { label: "Try a similar exam question", prompt: `Give me one new SSC JE style question within ${scope}, with four options. Wait for my answer before revealing the solution. Use only complete information and do not claim it is an actual past-paper question.` },
    ],
  };
  await db.prepare(`INSERT INTO question_study_contexts (kind, question_id, content_fp, node_id, context, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(kind, question_id) DO UPDATE SET content_fp = excluded.content_fp, node_id = excluded.node_id, context = excluded.context, updated_at = excluded.updated_at`)
    .run(input.kind, input.id, fingerprint, topic?.id ?? null, JSON.stringify(context), new Date().toISOString());
  return context;
}

export function recoveryContext(q: MadeEasyQuestionWithTest) {
  return questionContext({ kind: "made_easy", id: q.id, fingerprint: recoveryFingerprint(q), text: `${q.question} ${q.options.map(o => o.text).join(" ")} ${q.explanation}`, subjectHint: q.testTitle });
}
