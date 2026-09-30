/**
 * Syllabus hierarchy storage (learner spec §3). Content is shared by every learner; question
 * counts are computed per learner so a private (owner_user_id) paper is only counted for its
 * owner. Nothing here ever reads bank_answer_evidence or bank_explanations: node responses carry
 * question COUNTS only, never keys, stems or solutions.
 */
import { getDatabase } from "../db";
import { learnerCommitted } from "../bank/commitment";
import { contentFingerprint } from "../bank/content-fp";
import { BankRepository } from "./bank-repo";
import {
  TAGGABLE_SUBTREE_OF_PART,
  paperLevelTag,
  type SyllabusSeed,
} from "../../syllabus/seed-builder";
import {
  findCycle,
  validateConceptCandidateShape,
  validateFormula,
  validateNodes,
  validatePrimaryRule,
  validateRelationEndpoints,
  validateTheoryNote,
  type ConceptCandidate,
  type FormulaInput,
  type Problems,
} from "../../syllabus/validate";
import type {
  EndpointType,
  ExamCycleRecord,
  ExamPaperRecord,
  FormulaRecord,
  PaperCode,
  QuestionConceptOrigin,
  RelationType,
  ReviewStatus,
  SchemeRowRecord,
  SyllabusNodeDetail,
  SyllabusNodeKind,
  SyllabusNodeRecord,
  SyllabusOrigin,
  SyllabusTreeNode,
  SyllabusTreeResponse,
  TheoryNoteRecord,
  WorkedExampleRecord,
} from "../../syllabus/types";

type Row = Record<string, unknown>;

export class SyllabusValidationError extends Error {
  constructor(public readonly problems: Problems) {
    super(`syllabus validation failed:\n- ${problems.slice(0, 20).join("\n- ")}${problems.length > 20 ? `\n… ${problems.length - 20} more` : ""}`);
  }
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0);
const placeholders = (values: readonly unknown[]): string => values.map(() => "?").join(", ");

function toNode(r: Row): SyllabusNodeRecord {
  return {
    id: String(r.id),
    cycleId: String(r.cycle_id),
    papers: parseJson<PaperCode[]>(r.papers, []),
    parentId: str(r.parent_id),
    kind: r.kind as SyllabusNodeKind,
    name: String(r.name),
    officialText: str(r.official_text),
    origin: r.origin as SyllabusOrigin,
    splitNote: str(r.split_note),
    citation: str(r.citation),
    sourceVersion: String(r.source_version),
    reviewStatus: r.review_status as ReviewStatus,
    parentLinkOrigin: str(r.parent_link_origin) as SyllabusOrigin | null,
    parentLinkReviewStatus: str(r.parent_link_review_status) as ReviewStatus | null,
    parentLinkNote: str(r.parent_link_note),
    position: num(r.position),
    metadata: parseJson<Record<string, unknown>>(r.metadata, {}),
  };
}

function toCycle(r: Row): ExamCycleRecord {
  return {
    id: String(r.id),
    examId: String(r.exam_id),
    year: num(r.year),
    title: String(r.title),
    status: r.status as ExamCycleRecord["status"],
    noticeNumber: String(r.notice_number),
    noticeUrl: String(r.notice_url),
    noticeSha256: String(r.notice_sha256),
    publishedOn: String(r.published_on),
    notes: String(r.notes),
  };
}

function toFormula(r: Row, symbols: Row[]): FormulaRecord {
  return {
    id: String(r.id),
    name: String(r.name),
    expression: String(r.expression),
    latex: String(r.latex),
    symbols: symbols.map((s) => ({ symbol: String(s.symbol), meaning: String(s.meaning), unit: str(s.unit), dimension: str(s.dimension) })),
    dimensionalNotes: str(r.dimensional_notes),
    assumptions: parseJson<string[]>(r.assumptions, []),
    applicability: str(r.applicability),
    exclusions: parseJson<string[]>(r.exclusions, []),
    conventions: str(r.conventions),
    equivalentForms: parseJson(r.equivalent_forms, []),
    sourceTitle: String(r.source_title),
    sourceLocator: String(r.source_locator),
    sourceEdition: String(r.source_edition),
    verificationStatus: r.verification_status as FormulaRecord["verificationStatus"],
    gaps: parseJson<string[]>(r.gaps, []),
  };
}

function toTheory(r: Row): TheoryNoteRecord {
  return {
    id: String(r.id),
    nodeId: String(r.node_id),
    kind: r.kind as TheoryNoteRecord["kind"],
    layer: r.layer as TheoryNoteRecord["layer"],
    body: String(r.body),
    derivedFrom: parseJson<string[]>(r.derived_from, []),
    diagrams: parseJson(r.diagrams, []),
    sourceTitle: str(r.source_title),
    sourceLocator: str(r.source_locator),
    sourceEdition: str(r.source_edition),
    verificationStatus: r.verification_status as TheoryNoteRecord["verificationStatus"],
    position: num(r.position),
  };
}

export interface SeedStats {
  nodesInserted: number;
  nodesUpdated: number;
  nodesUnchanged: number;
  /** Nodes of a seeded cycle that the current build no longer produces (never auto-deleted). */
  orphanNodeIds: string[];
}

export interface PaperTagStats {
  questionsSeen: number;
  tagged: number;
  bySource: number;
  byEditorialPosition: number;
  untagged: number;
  untaggedSections: Record<string, number>;
  removedStale: number;
  byPart: Record<string, number>;
}

export interface ConceptImportResult {
  ok: boolean;
  problems: Problems;
  written: number;
  replaced: number;
}

const PAPER_LEVEL_METHODS = ["printed_section_heading", "p1_scheme_order_position"];

export class SyllabusRepository {
  public static async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return getDatabase().transaction(fn);
  }

  // ------------------------------------------------------------------ seed
  /** Validates, then upserts the whole seed in one transaction. Never deletes nodes. */
  public static async applySeed(seed: SyllabusSeed): Promise<SeedStats> {
    const problems = validateNodes(seed.nodes);
    if (problems.length) throw new SyllabusValidationError(problems);
    const db = getDatabase();
    return this.transaction(async () => {
      const now = new Date().toISOString();
      for (const e of seed.exams) {
        await db.prepare(
          `INSERT INTO exams (id, name, conducting_body) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, conducting_body = excluded.conducting_body,
             updated_at = CASE WHEN exams.name IS DISTINCT FROM excluded.name OR exams.conducting_body IS DISTINCT FROM excluded.conducting_body THEN ? ELSE exams.updated_at END`
        ).run(e.id, e.name, e.conductingBody, now);
      }
      for (const c of seed.cycles) {
        await db.prepare(
          `INSERT INTO exam_cycles (id, exam_id, year, title, status, notice_number, notice_url, notice_sha256, published_on, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, notice_number = excluded.notice_number,
             notice_url = excluded.notice_url, notice_sha256 = excluded.notice_sha256, published_on = excluded.published_on, notes = excluded.notes`
        ).run(c.id, c.examId, c.year, c.title, c.status, c.noticeNumber, c.noticeUrl, c.noticeSha256, c.publishedOn, c.notes);
      }
      for (const p of seed.papers) {
        await db.prepare(
          `INSERT INTO exam_papers (id, cycle_id, code, title, position) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, position = excluded.position`
        ).run(p.id, p.cycleId, p.code, p.title, p.position);
      }
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      const select = db.prepare("SELECT * FROM syllabus_nodes WHERE id = ?");
      for (const n of seed.nodes) {
        const before = await select.get<Row>(n.id);
        const values = [
          n.cycleId, JSON.stringify(n.papers), n.parentId, n.kind, n.name, n.officialText, n.origin, n.splitNote, n.citation,
          n.sourceVersion, n.reviewStatus, n.parentLinkOrigin, n.parentLinkReviewStatus, n.parentLinkNote, n.position, JSON.stringify(n.metadata),
        ];
        if (!before) {
          await db.prepare(
            `INSERT INTO syllabus_nodes (id, cycle_id, papers, parent_id, kind, name, official_text, origin, split_note, citation,
               source_version, review_status, parent_link_origin, parent_link_review_status, parent_link_note, position, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(n.id, ...values);
          inserted++;
          continue;
        }
        const prev = toNode(before);
        // A human review that already verified an editorial link/node survives re-seeding.
        const reviewStatus = prev.reviewStatus === "verified" && prev.origin === n.origin ? "verified" : n.reviewStatus;
        const linkReview =
          prev.parentLinkReviewStatus === "verified" && prev.parentLinkOrigin === n.parentLinkOrigin && prev.parentId === n.parentId
            ? "verified"
            : n.parentLinkReviewStatus;
        const next = { ...n, reviewStatus, parentLinkReviewStatus: linkReview };
        if (sameNode(prev, next)) {
          unchanged++;
          continue;
        }
        await db.prepare(
          `UPDATE syllabus_nodes SET cycle_id = ?, papers = ?, parent_id = ?, kind = ?, name = ?, official_text = ?, origin = ?,
             split_note = ?, citation = ?, source_version = ?, review_status = ?, parent_link_origin = ?, parent_link_review_status = ?,
             parent_link_note = ?, position = ?, metadata = ?, updated_at = ? WHERE id = ?`
        ).run(
          next.cycleId, JSON.stringify(next.papers), next.parentId, next.kind, next.name, next.officialText, next.origin, next.splitNote,
          next.citation, next.sourceVersion, next.reviewStatus, next.parentLinkOrigin, next.parentLinkReviewStatus, next.parentLinkNote,
          next.position, JSON.stringify(next.metadata), now, next.id
        );
        updated++;
      }
      for (const s of seed.schemeRows) {
        await db.prepare(
          `INSERT INTO exam_scheme_rows (id, paper_id, part_node_id, part_or_section, questions, marks, duration, negative_marking, citation, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET paper_id = excluded.paper_id, part_node_id = excluded.part_node_id, part_or_section = excluded.part_or_section,
             questions = excluded.questions, marks = excluded.marks, duration = excluded.duration, negative_marking = excluded.negative_marking,
             citation = excluded.citation, position = excluded.position`
        ).run(s.id, s.paperId, s.partNodeId, s.partOrSection, s.questions, s.marks, s.duration, s.negativeMarking, s.citation, s.position);
      }
      const keep = new Set(seed.nodes.map((n) => n.id));
      const cycles = seed.cycles.map((c) => c.id);
      const existing = cycles.length
        ? await db.prepare(`SELECT id FROM syllabus_nodes WHERE origin = 'official' AND cycle_id IN (${placeholders(cycles)})`).all<Row>(...cycles)
        : [];
      const orphanNodeIds = existing.map((r) => String(r.id)).filter((id) => !keep.has(id));
      return { nodesInserted: inserted, nodesUpdated: updated, nodesUnchanged: unchanged, orphanNodeIds };
    });
  }

  // ------------------------------------------------------------------ reads
  public static async getCycle(id: string): Promise<ExamCycleRecord | null> {
    const r = await getDatabase().prepare("SELECT * FROM exam_cycles WHERE id = ?").get<Row>(id);
    return r ? toCycle(r) : null;
  }

  public static async getCycleByYear(examId: string, year: number): Promise<ExamCycleRecord | null> {
    const r = await getDatabase().prepare("SELECT * FROM exam_cycles WHERE exam_id = ? AND year = ?").get<Row>(examId, year);
    return r ? toCycle(r) : null;
  }

  public static async listCycles(examId: string): Promise<ExamCycleRecord[]> {
    return (await getDatabase().prepare("SELECT * FROM exam_cycles WHERE exam_id = ? ORDER BY year DESC").all<Row>(examId)).map(toCycle);
  }

  public static async listPapers(cycleId: string): Promise<(ExamPaperRecord & { scheme: SchemeRowRecord[] })[]> {
    const db = getDatabase();
    const papers = await db.prepare("SELECT * FROM exam_papers WHERE cycle_id = ? ORDER BY position").all<Row>(cycleId);
    return Promise.all(papers.map(async (p) => ({
      id: String(p.id),
      cycleId: String(p.cycle_id),
      code: p.code as PaperCode,
      title: String(p.title),
      position: num(p.position),
      scheme: (await db.prepare("SELECT * FROM exam_scheme_rows WHERE paper_id = ? ORDER BY position").all<Row>(String(p.id))).map((s) => ({
        id: String(s.id),
        paperId: String(s.paper_id),
        partNodeId: str(s.part_node_id),
        partOrSection: String(s.part_or_section),
        questions: String(s.questions),
        marks: String(s.marks),
        duration: String(s.duration),
        negativeMarking: String(s.negative_marking),
        citation: String(s.citation),
        position: num(s.position),
      })),
    })));
  }

  public static async listNodes(cycleId: string): Promise<SyllabusNodeRecord[]> {
    return (await getDatabase().prepare("SELECT * FROM syllabus_nodes WHERE cycle_id = ? ORDER BY position, id").all<Row>(cycleId)).map(toNode);
  }

  public static async getNode(id: string): Promise<SyllabusNodeRecord | null> {
    const r = await getDatabase().prepare("SELECT * FROM syllabus_nodes WHERE id = ?").get<Row>(id);
    return r ? toNode(r) : null;
  }

  private static async nodeIndex(cycleId?: string): Promise<Map<string, SyllabusNodeRecord>> {
    const rows = cycleId
      ? await getDatabase().prepare("SELECT * FROM syllabus_nodes WHERE cycle_id = ?").all<Row>(cycleId)
      : await getDatabase().prepare("SELECT * FROM syllabus_nodes").all<Row>();
    return new Map(rows.map((r) => [String(r.id), toNode(r)]));
  }

  private static async endpointExists(type: EndpointType, id: string): Promise<boolean> {
    const table = { node: "syllabus_nodes", formula: "formulas", theory_note: "theory_notes", worked_example: "worked_examples", question: "bank_questions" }[type];
    return !!(await getDatabase().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
  }

  // ------------------------------------------------------------------ relations
  /**
   * Adds one typed relation. prerequisite_of is refused if it would close a cycle;
   * commonly_confused_with is symmetric and stored once (lower id first). Idempotent.
   */
  public static async addRelation(input: {
    relation: RelationType;
    fromType: EndpointType;
    fromId: string;
    toType: EndpointType;
    toId: string;
    origin: "official" | "editorial" | "source";
    evidence?: string | null;
    reviewStatus?: ReviewStatus;
  }): Promise<{ created: boolean }> {
    const problems = validateRelationEndpoints(input.relation, input.fromType, input.toType);
    if (input.fromType === input.toType && input.fromId === input.toId) problems.push("a relation cannot point at itself");
    if (!(await this.endpointExists(input.fromType, input.fromId))) problems.push(`${input.fromType} ${input.fromId} does not exist`);
    if (!(await this.endpointExists(input.toType, input.toId))) problems.push(`${input.toType} ${input.toId} does not exist`);
    if (input.relation === "commonly_confused_with" && !input.evidence?.trim()) problems.push("commonly_confused_with needs evidence (e.g. a PYP option pattern or source)");
    if (input.origin === "editorial" && input.reviewStatus === "verified") problems.push("an editorial relation starts unreviewed");
    if (problems.length) throw new SyllabusValidationError(problems);
    let { fromType, fromId, toType, toId } = input;
    if (input.relation === "commonly_confused_with" && `${fromType}:${fromId}` > `${toType}:${toId}`) {
      [fromType, fromId, toType, toId] = [toType, toId, fromType, fromId];
    }
    const db = getDatabase();
    return this.transaction(async () => {
      if (input.relation === "prerequisite_of") {
        const edges = (await db.prepare("SELECT from_type, from_id, to_type, to_id FROM syllabus_relations WHERE relation = 'prerequisite_of'").all<Row>()).map((r) => ({
          from: `${r.from_type}:${r.from_id}`,
          to: `${r.to_type}:${r.to_id}`,
        }));
        edges.push({ from: `${fromType}:${fromId}`, to: `${toType}:${toId}` });
        const cycle = findCycle(edges);
        if (cycle) throw new SyllabusValidationError([`prerequisite_of would create a cycle: ${cycle.join(" → ")}`]);
      }
      const id = `${input.relation}:${fromType}:${fromId}->${toType}:${toId}`;
      const res = await db
        .prepare(
          `INSERT INTO syllabus_relations (id, from_type, from_id, to_type, to_id, relation, origin, evidence, review_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(from_type, from_id, to_type, to_id, relation) DO NOTHING`
        )
        .run(id, fromType, fromId, toType, toId, input.relation, input.origin, input.evidence ?? null, input.reviewStatus ?? (input.origin === "editorial" ? "draft" : "needs_review"));
      return { created: num(res.changes) > 0 };
    });
  }

  // ------------------------------------------------------------------ paper-level tagging
  /**
   * Tags every bank question with its official 2026 part node from the section its paper printed
   * (origin 'source'), or — for unlabelled 200-question Paper-I papers — from the printed scheme
   * order (origin 'editorial', needs review). Idempotent: rows produced by these methods that no
   * longer apply are removed; rows from other methods are never touched.
   */
  public static async tagPaperLevel(): Promise<PaperTagStats> {
    const db = getDatabase();
    const rows = await db
      .prepare(
        `SELECT q.id, q.section, q.position, p.paper, p.question_count,
                (SELECT COUNT(*) FROM bank_questions q2 WHERE q2.paper_id = p.id) AS actual_count
           FROM bank_questions q JOIN bank_papers p ON p.id = q.paper_id`
      )
      .all<Row>();
    const stats: PaperTagStats = { questionsSeen: rows.length, tagged: 0, bySource: 0, byEditorialPosition: 0, untagged: 0, untaggedSections: {}, removedStale: 0, byPart: {} };
    return this.transaction(async () => {
      const existing = await db
        .prepare(`SELECT question_id, node_id FROM question_concepts WHERE method IN (${placeholders(PAPER_LEVEL_METHODS)})`)
        .all<Row>(...PAPER_LEVEL_METHODS);
      const wanted = new Set<string>();
      const upsert = db.prepare(
        `INSERT INTO question_concepts (question_id, node_id, node_kind, role, origin, confidence, method, model, review_status)
         VALUES (?, ?, 'part', 'primary', ?, NULL, ?, NULL, ?)
         ON CONFLICT(question_id, node_id) DO UPDATE SET
           origin = excluded.origin, method = excluded.method, role = 'primary',
           review_status = CASE WHEN question_concepts.review_status = 'verified' AND question_concepts.method = excluded.method THEN 'verified' ELSE excluded.review_status END,
           updated_at = CASE WHEN question_concepts.method IS NOT DISTINCT FROM excluded.method AND question_concepts.origin IS NOT DISTINCT FROM excluded.origin THEN question_concepts.updated_at ELSE CURRENT_TIMESTAMP END`
      );
      const del = db.prepare("DELETE FROM question_concepts WHERE question_id = ? AND node_id = ?");
      // Drop stale paper-level rows first so a changed part never trips the one-primary index.
      const plan = new Map<string, ReturnType<typeof paperLevelTag>>();
      for (const r of rows) {
        const tag = paperLevelTag({
          section: String(r.section),
          position: num(r.position),
          paper: String(r.paper),
          paperQuestionCount: Math.min(num(r.question_count), num(r.actual_count)),
        });
        plan.set(String(r.id), tag);
        if (tag) wanted.add(`${r.id}\u0000${tag.nodeId}`);
        else {
          stats.untagged++;
          stats.untaggedSections[String(r.section)] = (stats.untaggedSections[String(r.section)] ?? 0) + 1;
        }
      }
      for (const e of existing) {
        if (!wanted.has(`${e.question_id}\u0000${e.node_id}`)) {
          await del.run(String(e.question_id), String(e.node_id));
          stats.removedStale++;
        }
      }
      // A different-method primary part (e.g. a human fix) wins over ours.
      const otherPrimary = db.prepare(
        `SELECT node_id FROM question_concepts WHERE question_id = ? AND node_kind = 'part' AND role = 'primary' AND method NOT IN (${placeholders(PAPER_LEVEL_METHODS)})`
      );
      for (const [qid, tag] of plan) {
        if (!tag) continue;
        const other = await otherPrimary.get<Row>(qid, ...PAPER_LEVEL_METHODS);
        if (other && String(other.node_id) !== tag.nodeId) continue;
        await upsert.run(qid, tag.nodeId, tag.origin, tag.method, tag.reviewStatus);
        stats.tagged++;
        if (tag.origin === "source") stats.bySource++;
        else stats.byEditorialPosition++;
        stats.byPart[tag.nodeId] = (stats.byPart[tag.nodeId] ?? 0) + 1;
      }
      return stats;
    });
  }

  // ------------------------------------------------------------------ suggestion import
  /**
   * Validates a whole file of question→node suggestions, then writes all or nothing.
   * Rejects: unknown question/node ids, nodes outside the cycle, part-level nodes, nodes outside
   * the question's own part (GI&R/GA/Civil never mix), origin 'source', a second primary per
   * level (in the file or against stored rows), and a primary outside the stored primary chain.
   * With `replaceSuggestions`, unreviewed ai_suggested/keyword rows of the file's questions are
   * replaced; without it they conflict.
   */
  public static async importQuestionConcepts(raw: unknown, opts: { cycleId: string; replaceSuggestions?: boolean; dryRun?: boolean }): Promise<ConceptImportResult> {
    const problems: Problems = [];
    if (!Array.isArray(raw)) return { ok: false, problems: ["the file must be a JSON array of rows"], written: 0, replaced: 0 };
    const nodes = await this.nodeIndex(opts.cycleId);
    if (nodes.size === 0) return { ok: false, problems: [`cycle ${opts.cycleId} has no nodes — seed it first`], written: 0, replaced: 0 };
    const rows: ConceptCandidate[] = [];
    raw.forEach((r, i) => {
      const v = validateConceptCandidateShape(r, i);
      if (v.ok) rows.push(v.value);
      else problems.push(...v.problems);
    });
    const db = getDatabase();
    const qExists = db.prepare("SELECT 1 FROM bank_questions WHERE id = ?");
    const partTagOf = db.prepare(`SELECT node_id FROM question_concepts WHERE question_id = ? AND node_kind = 'part' AND role = 'primary'`);
    const topPart = (id: string): string | null => {
      let cur = nodes.get(id);
      while (cur && cur.parentId) cur = nodes.get(cur.parentId);
      return cur ? cur.id : null;
    };
    const seenPair = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const at = `row ${i + 1}`;
      const pair = `${r.questionId}\u0000${r.nodeId}`;
      if (seenPair.has(pair)) problems.push(`${at}: duplicate question/node pair`);
      seenPair.add(pair);
      if (!(await qExists.get(r.questionId))) problems.push(`${at}: unknown questionId ${r.questionId}`);
      const n = nodes.get(r.nodeId);
      if (!n) {
        problems.push(`${at}: unknown nodeId ${r.nodeId} (not in cycle ${opts.cycleId})`);
        continue;
      }
      if (n.kind === "part") problems.push(`${at}: part-level tags come only from the printed paper section`);
      const part = await partTagOf.get<Row>(r.questionId);
      if (part) {
        const allowedRoot = TAGGABLE_SUBTREE_OF_PART[String(part.node_id)] ?? String(part.node_id);
        if (topPart(r.nodeId) !== allowedRoot) problems.push(`${at}: node ${r.nodeId} is outside the question's part (${String(part.node_id)})`);
      }
    }
    // one-primary rule across stored + incoming rows
    const questionIds = [...new Set(rows.map((r) => r.questionId))];
    const stored = questionIds.length
      ? await db
          .prepare(`SELECT question_id, node_id, node_kind, role, origin, review_status FROM question_concepts WHERE question_id IN (${placeholders(questionIds)})`)
          .all<Row>(...questionIds)
      : [];
    const replaceable = (r: Row) => opts.replaceSuggestions && (r.origin === "ai_suggested" || r.origin === "keyword") && r.review_status !== "verified";
    const kept = stored.filter((r) => !replaceable(r) && !seenPair.has(`${r.question_id}\u0000${r.node_id}`));
    const incoming = rows
      .filter((r) => nodes.has(r.nodeId))
      .map((r) => ({ questionId: r.questionId, nodeId: r.nodeId, role: r.role as "primary" | "secondary", nodeKind: nodes.get(r.nodeId)!.kind }));
    const combined = [
      ...kept.map((r) => ({ questionId: String(r.question_id), nodeId: String(r.node_id), role: r.role as "primary" | "secondary", nodeKind: r.node_kind as SyllabusNodeKind })),
      ...incoming,
    ];
    problems.push(...validatePrimaryRule(combined, (id) => nodes.get(id)?.parentId ?? null));
    if (problems.length) return { ok: false, problems, written: 0, replaced: 0 };
    if (opts.dryRun) return { ok: true, problems, written: 0, replaced: 0 };
    return this.transaction(async () => {
      let replaced = 0;
      if (opts.replaceSuggestions) {
        for (const r of stored.filter(replaceable)) {
          await db.prepare("DELETE FROM question_concepts WHERE question_id = ? AND node_id = ?").run(String(r.question_id), String(r.node_id));
          replaced++;
        }
      }
      const up = db.prepare(
        `INSERT INTO question_concepts (question_id, node_id, node_kind, role, origin, confidence, method, model, review_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'needs_review')
         ON CONFLICT(question_id, node_id) DO UPDATE SET role = excluded.role, origin = excluded.origin, confidence = excluded.confidence,
           method = excluded.method, model = excluded.model,
           review_status = CASE WHEN question_concepts.review_status = 'verified' THEN 'verified' ELSE 'needs_review' END,
           updated_at = CURRENT_TIMESTAMP`
      );
      // secondaries first cannot matter; primaries of the same level were proven unique above
      for (const r of rows) await up.run(r.questionId, r.nodeId, nodes.get(r.nodeId)!.kind, r.role, r.origin as QuestionConceptOrigin, r.confidence ?? null, r.method, r.model ?? null);
      return { ok: true, problems: [], written: rows.length, replaced };
    });
  }

  // ------------------------------------------------------------------ formulas / theory / examples
  /** Imports one formula (validated; gaps recorded, never completed). Returns the gaps. */
  public static async upsertFormula(input: FormulaInput): Promise<{ gaps: string[] }> {
    const { problems, gaps, record } = validateFormula(input);
    if (!record) throw new SyllabusValidationError(problems);
    const db = getDatabase();
    await this.transaction(async () => {
      await db.prepare(
        `INSERT INTO formulas (id, name, expression, latex, dimensional_notes, assumptions, applicability, exclusions, conventions,
           equivalent_forms, source_title, source_locator, source_edition, verification_status, gaps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, expression = excluded.expression, latex = excluded.latex,
           dimensional_notes = excluded.dimensional_notes, assumptions = excluded.assumptions, applicability = excluded.applicability,
           exclusions = excluded.exclusions, conventions = excluded.conventions, equivalent_forms = excluded.equivalent_forms,
           source_title = excluded.source_title, source_locator = excluded.source_locator, source_edition = excluded.source_edition,
           verification_status = excluded.verification_status, gaps = excluded.gaps, updated_at = CURRENT_TIMESTAMP`
      ).run(
        record.id, record.name, record.expression, record.latex, record.dimensionalNotes, JSON.stringify(record.assumptions), record.applicability,
        JSON.stringify(record.exclusions), record.conventions, JSON.stringify(record.equivalentForms), record.sourceTitle, record.sourceLocator,
        record.sourceEdition, record.verificationStatus, JSON.stringify(record.gaps)
      );
      await db.prepare("DELETE FROM formula_symbols WHERE formula_id = ?").run(record.id);
      for (const [i, s] of record.symbols.entries()) {
        await db.prepare("INSERT INTO formula_symbols (formula_id, position, symbol, meaning, unit, dimension) VALUES (?, ?, ?, ?, ?, ?)").run(record.id, i + 1, s.symbol, s.meaning, s.unit, s.dimension);
      }
    });
    for (const l of input.links ?? []) {
      await this.addRelation({
        relation: l.relation,
        fromType: l.direction === "out" ? "formula" : l.otherType,
        fromId: l.direction === "out" ? record.id : l.otherId,
        toType: l.direction === "out" ? l.otherType : "formula",
        toId: l.direction === "out" ? l.otherId : record.id,
        origin: "editorial",
        evidence: l.evidence ?? null,
        reviewStatus: "draft",
      });
    }
    return { gaps };
  }

  public static async getFormula(id: string): Promise<FormulaRecord | null> {
    const db = getDatabase();
    const r = await db.prepare("SELECT * FROM formulas WHERE id = ?").get<Row>(id);
    if (!r) return null;
    return toFormula(r, await db.prepare("SELECT * FROM formula_symbols WHERE formula_id = ? ORDER BY position").all<Row>(id));
  }

  /** Adds a theory note. Source extracts are immutable once written (DB trigger). */
  public static async addTheoryNote(n: Omit<TheoryNoteRecord, "position"> & { position?: number }): Promise<void> {
    const problems = validateTheoryNote(n);
    if (!(await this.getNode(n.nodeId))) problems.push(`theory note ${n.id}: node ${n.nodeId} does not exist`);
    for (const d of n.derivedFrom) {
      const src = await getDatabase().prepare("SELECT kind FROM theory_notes WHERE id = ?").get<Row>(d);
      if (!src || src.kind !== "source_extract") problems.push(`theory note ${n.id}: derivedFrom ${d} is not a source extract`);
    }
    if (problems.length) throw new SyllabusValidationError(problems);
    await getDatabase()
      .prepare(
        `INSERT INTO theory_notes (id, node_id, kind, layer, body, derived_from, diagrams, source_title, source_locator, source_edition, verification_status, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(n.id, n.nodeId, n.kind, n.layer, n.body, JSON.stringify(n.derivedFrom), JSON.stringify(n.diagrams), n.sourceTitle, n.sourceLocator, n.sourceEdition, n.verificationStatus, n.position ?? 0);
  }

  public static async addWorkedExample(w: WorkedExampleRecord): Promise<void> {
    if (!(await this.getNode(w.nodeId))) throw new SyllabusValidationError([`worked example ${w.id}: node ${w.nodeId} does not exist`]);
    let fp: string | null = null;
    if (w.bankQuestionId) {
      const question = await BankRepository.getQuestion(w.bankQuestionId);
      if (!question) throw new SyllabusValidationError([`worked example ${w.id}: bank question ${w.bankQuestionId} does not exist`]);
      fp = contentFingerprint(question);
    }
    await getDatabase()
      .prepare(
        `INSERT INTO worked_examples (id, node_id, title, problem, steps, answer, bank_question_id, bank_content_fp, source_title, source_locator, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(w.id, w.nodeId, w.title, w.problem, JSON.stringify(w.steps), w.answer, w.bankQuestionId, fp, w.sourceTitle, w.sourceLocator, w.verificationStatus);
  }

  /**
   * A re-import changed what these bank question ids hold: their concept tags described the old
   * content, so drop them (part tags are re-derived by seed-syllabus from the printed section; AI
   * tags must be re-suggested for the new text). Returns the number of rows removed.
   */
  public static async forgetConceptsOf(questionIds: string[]): Promise<number> {
    if (!questionIds.length) return 0;
    const del = getDatabase().prepare("DELETE FROM question_concepts WHERE question_id = ?");
    let n = 0;
    for (const id of questionIds) n += Number((await del.run(id)).changes);
    return n;
  }

  // ------------------------------------------------------------------ learner views
  /** node id → set of visible PYP question ids linked directly to it. */
  private static async directLinks(cycleId: string, userId: string): Promise<Map<string, Set<string>>> {
    const rows = await getDatabase()
      .prepare(
        `SELECT qc.node_id, qc.question_id FROM question_concepts qc
           JOIN syllabus_nodes n ON n.id = qc.node_id
           JOIN bank_questions q ON q.id = qc.question_id
           JOIN bank_papers p ON p.id = q.paper_id
          WHERE n.cycle_id = ? AND p.kind = 'pyp' AND (p.owner_user_id = '' OR p.owner_user_id = ?)`
      )
      .all<Row>(cycleId, userId);
    const out = new Map<string, Set<string>>();
    for (const r of rows) {
      const k = String(r.node_id);
      if (!out.has(k)) out.set(k, new Set());
      out.get(k)!.add(String(r.question_id));
    }
    return out;
  }

  public static async tree(cycleId: string, userId: string): Promise<SyllabusTreeResponse | null> {
    const cycle = await this.getCycle(cycleId);
    if (!cycle) return null;
    const nodes = await this.listNodes(cycleId);
    const direct = await this.directLinks(cycleId, userId);
    const byParent = new Map<string | null, SyllabusNodeRecord[]>();
    for (const n of nodes) {
      if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
      byParent.get(n.parentId)!.push(n);
    }
    const allTagged = new Set<string>();
    const build = (n: SyllabusNodeRecord): { node: SyllabusTreeNode; ids: Set<string> } => {
      const ids = new Set(direct.get(n.id) ?? []);
      const children: SyllabusTreeNode[] = [];
      for (const c of (byParent.get(n.id) ?? []).sort((a, b) => a.position - b.position)) {
        const built = build(c);
        children.push(built.node);
        for (const q of built.ids) ids.add(q);
      }
      for (const q of ids) allTagged.add(q);
      return {
        ids,
        node: {
          id: n.id,
          parentId: n.parentId,
          kind: n.kind,
          name: n.name,
          origin: n.origin,
          reviewStatus: n.reviewStatus,
          papers: n.papers,
          citation: n.citation,
          splitNote: n.splitNote,
          parentLinkOrigin: n.parentLinkOrigin,
          parentLinkReviewStatus: n.parentLinkReviewStatus,
          printedLabel: typeof n.metadata.printedLabel === "string" ? n.metadata.printedLabel : null,
          directQuestionCount: direct.get(n.id)?.size ?? 0,
          questionCount: ids.size,
          children,
        },
      };
    };
    const builtRoots = (byParent.get(null) ?? []).sort((a, b) => a.position - b.position).map((n) => build(n));
    // A part that shares another part's subject tree (Paper-II Civil → Paper-I Civil) also counts
    // toward that tree, so the shared Civil card covers both papers.
    for (const r of builtRoots) {
      const target = nodes.find((n) => n.id === r.node.id)?.metadata.sharesSubjectTreeWith;
      const into = builtRoots.find((x) => x.node.id === target);
      if (into) {
        for (const q of r.ids) into.ids.add(q);
        into.node.questionCount = into.ids.size;
      }
    }
    const roots = builtRoots.map((r) => r.node);
    const pyp = await getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM bank_questions q JOIN bank_papers p ON p.id = q.paper_id WHERE p.kind = 'pyp' AND (p.owner_user_id = '' OR p.owner_user_id = ?)`)
      .get<Row>(userId) as Row;
    return {
      cycle,
      papers: await this.listPapers(cycleId),
      roots,
      totals: { nodes: nodes.length, taggedQuestions: allTagged.size, pypQuestions: num(pyp.c) },
      mappingNote:
        "Previous-year papers from 2016–2024 were set under older syllabi. Their questions are mapped onto this cycle's structure: the part (Reasoning / Awareness / Civil) comes from the section the paper printed; anything finer is an editorial mapping that still needs review.",
    };
  }

  /** Everything the node page needs. Counts only — never answer keys, stems or solutions. */
  public static async nodeDetail(id: string, userId: string): Promise<SyllabusNodeDetail | null> {
    const node = await this.getNode(id);
    if (!node) return null;
    const cycle = (await this.getCycle(node.cycleId))!;
    const index = await this.nodeIndex(node.cycleId);
    const ancestors: SyllabusNodeDetail["ancestors"] = [];
    let cur = node.parentId ? index.get(node.parentId) : undefined;
    while (cur) {
      ancestors.unshift({ id: cur.id, kind: cur.kind, name: cur.name, origin: cur.origin });
      cur = cur.parentId ? index.get(cur.parentId) : undefined;
    }
    const kids = [...index.values()].filter((n) => n.parentId === id).sort((a, b) => a.position - b.position);
    const subtree = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of index.values()) if (n.parentId && subtree.has(n.parentId) && !subtree.has(n.id)) {
        subtree.add(n.id);
        grew = true;
      }
    }
    for (const n of index.values()) if (n.metadata.sharesSubjectTreeWith === id) subtree.add(n.id);
    const db = getDatabase();
    const rel = await db
      .prepare(`SELECT * FROM syllabus_relations WHERE (from_type = 'node' AND from_id = ?) OR (to_type = 'node' AND to_id = ?) ORDER BY relation, id`)
      .all<Row>(id, id);
    const nameOf = async (type: EndpointType, oid: string): Promise<string | null> => {
      if (type === "node") return index.get(oid)?.name ?? (await this.getNode(oid))?.name ?? null;
      if (type === "formula") return str((await db.prepare("SELECT name FROM formulas WHERE id = ?").get<Row>(oid))?.name);
      if (type === "worked_example") return str((await db.prepare("SELECT title FROM worked_examples WHERE id = ?").get<Row>(oid))?.title);
      return null;
    };
    const relations: SyllabusNodeDetail["relations"] = await Promise.all(rel.map(async (r) => {
      const out = r.from_type === "node" && r.from_id === id;
      const otherType = (out ? r.to_type : r.from_type) as EndpointType;
      const otherId = String(out ? r.to_id : r.from_id);
      return {
        relation: r.relation as RelationType,
        direction: out ? "out" : "in",
        otherType,
        otherId,
        otherName: await nameOf(otherType, otherId),
        origin: String(r.origin),
        reviewStatus: r.review_status as ReviewStatus,
        evidence: str(r.evidence),
      };
    }));
    const formulaIds = new Set<string>();
    for (const r of await db
      .prepare(
        `SELECT to_id AS fid FROM syllabus_relations WHERE from_type = 'node' AND from_id = ? AND to_type = 'formula'
         UNION SELECT from_id AS fid FROM syllabus_relations WHERE to_type = 'node' AND to_id = ? AND from_type = 'formula'`
      )
      .all<Row>(id, id))
      formulaIds.add(String(r.fid));
    const formulas = (await Promise.all([...formulaIds].map((f) => this.getFormula(f)))).filter((f): f is FormulaRecord => f !== null);
    const theoryNotes = (await db.prepare("SELECT * FROM theory_notes WHERE node_id = ? ORDER BY CASE layer WHEN 'concise' THEN 0 ELSE 1 END, position, id").all<Row>(id)).map(toTheory);
    // A worked example built on a bank question is that question's solution: it is shown only for
    // the content it was written for, and only to a learner who can see the question and has
    // already answered that content (checked or submitted).
    const committedTo = async (questionId: string | null, fp: string | null): Promise<boolean> => {
      if (!questionId) return true;
      const question = await BankRepository.getQuestionFor(questionId, userId);
      return question !== null && fp === contentFingerprint(question) && (await learnerCommitted(userId, question));
    };
    const allWorkedExamples = await db.prepare("SELECT * FROM worked_examples WHERE node_id = ? ORDER BY id").all<Row>(id);
    const workedExamples = (await Promise.all(allWorkedExamples.map(async (w) =>
      (await committedTo(str(w.bank_question_id), str(w.bank_content_fp))) ? w : null
    )))
      .filter((w): w is Row => w !== null)
      .map((w) => ({
      id: String(w.id),
      nodeId: String(w.node_id),
      title: String(w.title),
      problem: String(w.problem),
      steps: parseJson<string[]>(w.steps, []),
      bankQuestionId: str(w.bank_question_id),
      sourceTitle: str(w.source_title),
      sourceLocator: str(w.source_locator),
      verificationStatus: w.verification_status as WorkedExampleRecord["verificationStatus"],
    }));
    const ids = [...subtree];
    const visible = `JOIN bank_questions q ON q.id = qc.question_id JOIN bank_papers p ON p.id = q.paper_id
       WHERE qc.node_id IN (${placeholders(ids)}) AND p.kind = 'pyp' AND (p.owner_user_id = '' OR p.owner_user_id = ?)`;
    const total = await db.prepare(`SELECT COUNT(DISTINCT qc.question_id) AS c FROM question_concepts qc ${visible}`).get<Row>(...ids, userId) as Row;
    const byPaperYear = (await db
      .prepare(`SELECT p.paper, p.cycle_year, COUNT(DISTINCT qc.question_id) AS c FROM question_concepts qc ${visible} GROUP BY p.paper, p.cycle_year ORDER BY p.paper, p.cycle_year`)
      .all<Row>(...ids, userId)).map((r) => ({ paper: String(r.paper), year: r.cycle_year === null ? null : num(r.cycle_year), count: num(r.c) }));
    const byOrigin = (await db
      .prepare(`SELECT qc.origin, COUNT(DISTINCT qc.question_id) AS c FROM question_concepts qc ${visible} GROUP BY qc.origin ORDER BY qc.origin`)
      .all<Row>(...ids, userId)).map((r) => ({ origin: r.origin as QuestionConceptOrigin, count: num(r.c) }));
    const { metadata, ...rest } = node;
    return {
      node: { ...rest, printedLabel: typeof metadata.printedLabel === "string" ? metadata.printedLabel : null },
      cycle,
      ancestors,
      children: kids.map((k) => ({ id: k.id, kind: k.kind, name: k.name, origin: k.origin, reviewStatus: k.reviewStatus })),
      relations,
      formulas,
      theoryNotes,
      workedExamples,
      questionCounts: { total: num(total.c), byPaperYear, byOrigin },
    };
  }

  /** Counts for reporting: nodes by cycle/kind/origin, and tags by origin/kind. */
  public static async stats(): Promise<{ nodes: Row[]; tags: Row[] }> {
    const db = getDatabase();
    return {
      nodes: await db.prepare("SELECT cycle_id, kind, origin, review_status, COUNT(*) AS n FROM syllabus_nodes GROUP BY 1, 2, 3, 4 ORDER BY 1, 2").all<Row>(),
      tags: await db.prepare("SELECT node_kind, origin, method, review_status, COUNT(*) AS n FROM question_concepts GROUP BY 1, 2, 3, 4 ORDER BY 1, 2").all<Row>(),
    };
  }
}

function sameNode(a: SyllabusNodeRecord, b: SyllabusNodeRecord): boolean {
  const keys: (keyof SyllabusNodeRecord)[] = [
    "cycleId", "papers", "parentId", "kind", "name", "officialText", "origin", "splitNote", "citation", "sourceVersion", "reviewStatus",
    "parentLinkOrigin", "parentLinkReviewStatus", "parentLinkNote", "position", "metadata",
  ];
  return keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
