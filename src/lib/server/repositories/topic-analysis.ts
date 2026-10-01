import { getDatabase } from "../db";
import { SyllabusRepository } from "./syllabus-repo";
import { allMadeEasyQuestions, canReadMadeEasy } from "../made-easy";
import { recoveryContext, recoveryFingerprint } from "../followup/question-context";
import { storedRecoveryLessons } from "../followup/followup";
import { HttpError } from "../bank/http";
import type { TopicAnalysis } from "@/lib/syllabus/study-types";

let sync: Promise<void> | null = null;
let syncedAt = 0;
async function syncRecovery() {
  if (Date.now() - syncedAt < 10 * 60 * 1000) return;
  sync ??= (async () => {
    for (const q of allMadeEasyQuestions()) await recoveryContext(q);
    syncedAt = Date.now();
  })().finally(() => { sync = null; });
  await sync;
}

/** All counts include descendants and respect private-paper ownership. No answer keys returned. */
export async function topicAnalysis(userId: string, id: string, page = 1): Promise<TopicAnalysis> {
  const node = await SyllabusRepository.getNode(id);
  if (!node) throw new HttpError(404, "Syllabus topic not found.");
  const db = getDatabase();
  const nodes = await db.prepare("SELECT id, parent_id, metadata FROM syllabus_nodes WHERE cycle_id = ?")
    .all<{ id: string; parent_id: string | null; metadata: string }>(node.cycleId);
  const ids = new Set([id]);
  for (const n of nodes) if (JSON.parse(n.metadata || "{}").sharesSubjectTreeWith === id) ids.add(n.id);
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes) if (n.parent_id && ids.has(n.parent_id) && !ids.has(n.id)) { ids.add(n.id); changed = true; }
  }
  const placeholders = [...ids].map(() => "?").join(",");
  const bank = await db.prepare(`SELECT DISTINCT q.id, q.stem, q.position, p.id AS paper_id, p.title, p.kind, p.cycle_year
    FROM question_concepts qc JOIN bank_questions q ON q.id = qc.question_id JOIN bank_papers p ON p.id = q.paper_id
    WHERE qc.node_id IN (${placeholders}) AND (p.owner_user_id = '' OR p.owner_user_id = ?)
    ORDER BY p.cycle_year DESC, p.title, q.position`)
    .all<{ id: string; stem: string; position: number; paper_id: string; title: string; kind: string; cycle_year: number | null }>(...ids, userId);
  const questions: TopicAnalysis["questions"] = bank.map(q => ({ id: q.id, kind: "bank", stem: q.stem, title: `${q.title} · Q${q.position}`, href: `/papers/${encodeURIComponent(q.paper_id)}/instructions`, status: q.kind === "pyp" ? "Past paper · mapped" : "Mapped question", year: q.cycle_year }));
  const recovery = { total: 0, incorrect: 0, unattempted: 0, slow: 0 };
  let attempts = 0, correct = 0, seconds = 0;
  let lessons: TopicAnalysis["lessons"] = [];
  if (canReadMadeEasy(userId) && node.cycleId === "SSC_JE:2026") {
    await syncRecovery();
    const mapped = await db.prepare(`SELECT question_id FROM question_study_contexts WHERE kind = 'made_easy' AND node_id IN (${placeholders})`)
      .all<{ question_id: string }>(...ids);
    const wanted = new Set(mapped.map(q => q.question_id));
    const qs = allMadeEasyQuestions().filter(q => wanted.has(q.id));
    lessons = await storedRecoveryLessons(userId, qs.map(q => q.id));
    const practice = await db.prepare("SELECT question_id, content_fp, correct, seconds FROM recovery_practice WHERE user_id = ?")
      .all<{ question_id: string; content_fp: string; correct: number; seconds: number }>(userId);
    const fingerprints = new Map(qs.map(q => [q.id, recoveryFingerprint(q)]));
    for (const p of practice) if (fingerprints.get(p.question_id) === p.content_fp) { attempts++; correct += Number(p.correct); seconds += Number(p.seconds); }
    for (const q of qs) {
      recovery.total++; recovery[q.status]++;
      if (q.timeSeconds > q.avgTimeSeconds) recovery.slow++;
      questions.push({ id: q.id, kind: "made_easy", stem: q.question, title: `${q.testTitle} · Q${q.number}`, href: `/recovery-lab/${q.testCode}?question=${encodeURIComponent(q.id)}`, status: `${q.status === "incorrect" ? "Incorrect" : "Unattempted"} · suggested topic`, year: null });
    }
  }
  const years = new Map<number, number>();
  for (const q of bank) if (q.kind === "pyp" && q.cycle_year) years.set(q.cycle_year, (years.get(q.cycle_year) ?? 0) + 1);
  const pages = Math.max(1, Math.ceil(questions.length / 25));
  const current = Math.min(Math.max(1, page), pages);
  return { lessons, total: questions.length, pyp: bank.filter(q => q.kind === "pyp").length, recovery,
    practice: { attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : null, averageSeconds: attempts ? Math.round(seconds / attempts) : null },
    years: [...years].sort((a,b) => b[0]-a[0]).map(([year,count]) => ({year,count})),
    questions: questions.slice((current - 1) * 25, current * 25), page: current, pages };
}
