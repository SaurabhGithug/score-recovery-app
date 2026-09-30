/**
 * Pure validators for the syllabus hierarchy. The repository calls these before every write and
 * the seed/import scripts refuse to write anything when one fails.
 */
import { officialCorpus, SYLLABUS_SOURCE, type SyllabusSource } from "./source";
import {
  NODE_KIND_RANK,
  NODE_KINDS,
  ORIGINS,
  QUESTION_CONCEPT_ORIGINS,
  QUESTION_CONCEPT_ROLES,
  RELATION_ENDPOINTS,
  REVIEW_STATUSES,
  type EndpointType,
  type FormulaRecord,
  type QuestionConceptRecord,
  type RelationType,
  type SyllabusNodeKind,
  type SyllabusNodeRecord,
  type TheoryNoteRecord,
} from "./types";
import { P1_CIVIL_SUBJECTS_2026, P2_TOPIC_SPLITS, parseSplit, type SyllabusSeed } from "./seed-builder";

export type Problems = string[];

// ------------------------------------------------------------------ nodes

/**
 * Structural + provenance checks on a set of nodes:
 * - ids unique; parent exists, same cycle, and strictly shallower kind; no parent cycles
 * - official nodes: exact official text found in the source corpus, citation present
 * - editorial nodes: no official text, never 'verified' straight from a seed
 */
export function validateNodes(nodes: SyllabusNodeRecord[], source: SyllabusSource = SYLLABUS_SOURCE, opts: { allowVerifiedEditorial?: boolean } = {}): Problems {
  const problems: Problems = [];
  const byId = new Map<string, SyllabusNodeRecord>();
  const corpus = officialCorpus(source);
  for (const n of nodes) {
    if (byId.has(n.id)) problems.push(`duplicate node id ${n.id}`);
    byId.set(n.id, n);
  }
  for (const n of nodes) {
    const at = `node ${n.id}`;
    if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(n.id)) problems.push(`${at}: id is not URL-safe`);
    if (!(NODE_KINDS as readonly string[]).includes(n.kind)) problems.push(`${at}: unknown kind ${n.kind}`);
    if (!(ORIGINS as readonly string[]).includes(n.origin)) problems.push(`${at}: unknown origin ${n.origin}`);
    if (!(REVIEW_STATUSES as readonly string[]).includes(n.reviewStatus)) problems.push(`${at}: unknown review status`);
    if (!n.name.trim()) problems.push(`${at}: empty name`);
    if (!n.papers.length || n.papers.some((p) => p !== "P1" && p !== "P2")) problems.push(`${at}: papers must be a non-empty subset of P1/P2`);
    if (n.origin === "official") {
      if (!n.officialText) problems.push(`${at}: official node without official text`);
      else if (!corpus.some((s) => s.includes(n.officialText!))) problems.push(`${at}: official text is not found verbatim in the source`);
      if (!n.citation?.trim()) problems.push(`${at}: official node without citation`);
      if (n.officialText && n.name !== n.officialText && !corpus.some((s) => s.includes(n.name))) {
        problems.push(`${at}: official node name is not printed wording`);
      }
    } else {
      if (n.officialText !== null) problems.push(`${at}: editorial node must not carry official text`);
      if (n.reviewStatus === "verified" && !opts.allowVerifiedEditorial) problems.push(`${at}: editorial node cannot be seeded as verified`);
    }
    if (n.parentId === null) {
      if (n.parentLinkOrigin !== null) problems.push(`${at}: root node with a parent-link origin`);
      if (n.kind !== "part") problems.push(`${at}: only parts may be roots`);
    } else {
      const p = byId.get(n.parentId);
      if (!p) problems.push(`${at}: parent ${n.parentId} missing`);
      else {
        if (p.cycleId !== n.cycleId) problems.push(`${at}: parent is in another cycle`);
        if (NODE_KIND_RANK[p.kind] >= NODE_KIND_RANK[n.kind]) problems.push(`${at}: ${n.kind} cannot sit under ${p.kind}`);
        if (n.origin === "official" && p.origin === "editorial") problems.push(`${at}: official node under an editorial parent`);
      }
      if (n.parentLinkOrigin === null) problems.push(`${at}: parent link without origin`);
      if (n.parentLinkOrigin === "editorial" && n.parentLinkReviewStatus === "verified" && !opts.allowVerifiedEditorial) {
        problems.push(`${at}: editorial parent link cannot be seeded as verified`);
      }
    }
  }
  // parent chains must terminate
  for (const n of nodes) {
    const seen = new Set<string>();
    let cur: SyllabusNodeRecord | undefined = n;
    while (cur && cur.parentId) {
      if (seen.has(cur.id)) {
        problems.push(`node ${n.id}: parent chain loops`);
        break;
      }
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
  }
  return problems;
}

/**
 * Proves a mechanical split is lossless: consuming labels and items in order from the printed
 * text must leave only separators behind.
 */
export function checkSplitCoverage(printed: string, entries: string[]): Problems {
  const problems: Problems = [];
  let cursor = 0;
  let residue = "";
  for (const e of entries) {
    const piece = e.startsWith("§") ? e.slice(1) : e;
    if (!piece) continue;
    const at = printed.indexOf(piece, cursor);
    if (at < 0) {
      problems.push(`"${piece}" not found (in order) in printed text`);
      continue;
    }
    residue += printed.slice(cursor, at);
    cursor = at + piece.length;
  }
  residue += printed.slice(cursor);
  if (!/^[\s;,.:\-–]*$/.test(residue)) problems.push(`split drops printed words: ${JSON.stringify(residue.replace(/[\s;,.:\-–]+/g, " ").trim())}`);
  return problems;
}

/** Seed-level checks on top of validateNodes. */
export function validateSeed(seed: SyllabusSeed, source: SyllabusSource = SYLLABUS_SOURCE): Problems {
  const problems = validateNodes(seed.nodes, source);
  const p1 = source.syllabus.find((r) => r.paper === "Paper-I" && r.part === "Part-A (Civil Engineering)");
  if (!p1 || `${P1_CIVIL_SUBJECTS_2026.join(", ")}.` !== p1.verbatim) problems.push("Paper-I Part-A subject list does not rejoin to the printed text");
  for (const row of source.syllabus.filter((r) => r.paper === "Paper-II")) {
    const split = P2_TOPIC_SPLITS[row.heading];
    if (!split) {
      problems.push(`no split for "${row.heading}"`);
      continue;
    }
    for (const p of checkSplitCoverage(row.verbatim, split)) problems.push(`${row.heading}: ${p}`);
    if (parseSplit(split).length === 0) problems.push(`${row.heading}: empty split`);
  }
  if (seed.schemeRows.length !== source.scheme.length) problems.push("scheme rows do not match the source");
  return problems;
}

// ------------------------------------------------------------------ relations

export function validateRelationEndpoints(relation: RelationType, fromType: EndpointType, toType: EndpointType): Problems {
  const spec = RELATION_ENDPOINTS[relation];
  if (!spec) return [`unknown relation ${relation}`];
  const problems: Problems = [];
  if (!(spec.from as readonly string[]).includes(fromType)) problems.push(`${relation} cannot start at a ${fromType}`);
  if (!(spec.to as readonly string[]).includes(toType)) problems.push(`${relation} cannot end at a ${toType}`);
  return problems;
}

/**
 * Returns one cycle (as a list of ids, first = last) if the directed prerequisite graph has one,
 * else null. Iterative DFS with colours, so deep chains cannot overflow the stack.
 */
export function findCycle(edges: { from: string; to: string }[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const colour = new Map<string, 0 | 1 | 2>(); // 0 white, 1 on stack, 2 done
  const parent = new Map<string, string>();
  for (const start of adj.keys()) {
    if (colour.get(start)) continue;
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
    colour.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = adj.get(top.id)?.[top.i++];
      if (next === undefined) {
        colour.set(top.id, 2);
        stack.pop();
        continue;
      }
      const c = colour.get(next) ?? 0;
      if (c === 0) {
        colour.set(next, 1);
        parent.set(next, top.id);
        stack.push({ id: next, i: 0 });
      } else if (c === 1) {
        const cycle = [next];
        let cur = top.id;
        while (cur !== next) {
          cycle.push(cur);
          cur = parent.get(cur)!;
        }
        cycle.push(next);
        return cycle.reverse();
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ question ↔ node

export interface ConceptCandidate {
  questionId: string;
  nodeId: string;
  role: string;
  origin: string;
  confidence?: number | null;
  method: string;
  model?: string | null;
}

/**
 * At most one primary per question per level, and a deeper primary must descend from the
 * shallower primary of the same question (a primary topic sits inside the primary subject).
 */
export function validatePrimaryRule(
  rows: Pick<QuestionConceptRecord, "questionId" | "nodeId" | "role" | "nodeKind">[],
  parentOf: (nodeId: string) => string | null
): Problems {
  const problems: Problems = [];
  const primaries = new Map<string, Map<SyllabusNodeKind, string>>();
  for (const r of rows) {
    if (r.role !== "primary") continue;
    const byKind = primaries.get(r.questionId) ?? new Map<SyllabusNodeKind, string>();
    const prev = byKind.get(r.nodeKind);
    if (prev && prev !== r.nodeId) problems.push(`question ${r.questionId}: more than one primary ${r.nodeKind} (${prev}, ${r.nodeId})`);
    byKind.set(r.nodeKind, r.nodeId);
    primaries.set(r.questionId, byKind);
  }
  for (const [qid, byKind] of primaries) {
    const ordered = [...byKind.entries()].sort((a, b) => NODE_KIND_RANK[a[0]] - NODE_KIND_RANK[b[0]]);
    for (let i = 1; i < ordered.length; i++) {
      const [, shallow] = ordered[i - 1];
      const [deepKind, deep] = ordered[i];
      let cur: string | null = parentOf(deep);
      let ok = false;
      while (cur) {
        if (cur === shallow) {
          ok = true;
          break;
        }
        cur = parentOf(cur);
      }
      // Paper-II questions: the part tag is the P2 part while subjects hang under the P1 Civil part.
      if (!ok && ordered[i - 1][0] === "part") continue;
      if (!ok) problems.push(`question ${qid}: primary ${deepKind} ${deep} is not inside primary ${ordered[i - 1][0]} ${shallow}`);
    }
  }
  return problems;
}

/** Shape checks on one imported (AI / keyword / editorial) suggestion row. */
export function validateConceptCandidateShape(row: unknown, index: number): { ok: true; value: ConceptCandidate } | { ok: false; problems: Problems } {
  const at = `row ${index + 1}`;
  if (typeof row !== "object" || row === null || Array.isArray(row)) return { ok: false, problems: [`${at}: not an object`] };
  const r = row as Record<string, unknown>;
  const problems: Problems = [];
  const allowed = new Set(["questionId", "nodeId", "role", "origin", "confidence", "method", "model", "rationale"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) problems.push(`${at}: unknown field "${k}"`);
  if (typeof r.questionId !== "string" || !r.questionId) problems.push(`${at}: questionId required`);
  if (typeof r.nodeId !== "string" || !r.nodeId) problems.push(`${at}: nodeId required`);
  if (!(QUESTION_CONCEPT_ROLES as readonly unknown[]).includes(r.role)) problems.push(`${at}: role must be primary or secondary`);
  if (!(QUESTION_CONCEPT_ORIGINS as readonly unknown[]).includes(r.origin)) problems.push(`${at}: unknown origin ${String(r.origin)}`);
  else if (r.origin === "source") problems.push(`${at}: origin "source" cannot be imported — only the paper itself can supply it`);
  if (r.confidence !== undefined && r.confidence !== null && (typeof r.confidence !== "number" || !(r.confidence >= 0 && r.confidence <= 1))) {
    problems.push(`${at}: confidence must be a number in [0, 1]`);
  }
  if (r.origin === "ai_suggested" && typeof r.confidence !== "number") problems.push(`${at}: ai_suggested rows need a confidence`);
  if (typeof r.method !== "string" || !r.method.trim() || r.method.length > 120) problems.push(`${at}: method required (≤120 chars)`);
  if (r.model !== undefined && r.model !== null && typeof r.model !== "string") problems.push(`${at}: model must be a string`);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    value: {
      questionId: r.questionId as string,
      nodeId: r.nodeId as string,
      role: r.role as string,
      origin: r.origin as string,
      confidence: (r.confidence as number | null | undefined) ?? null,
      method: (r.method as string).trim(),
      model: (r.model as string | null | undefined) ?? null,
    },
  };
}

// ------------------------------------------------------------------ formulas & theory

export interface FormulaInput {
  id: string;
  name: string;
  expression: string;
  latex: string;
  symbols: { symbol: string; meaning: string; unit?: string | null; dimension?: string | null }[];
  dimensionalNotes?: string | null;
  assumptions?: string[];
  applicability?: string | null;
  exclusions?: string[];
  conventions?: string | null;
  equivalentForms?: { expression: string; latex: string; verifiedAgainst: string }[];
  sourceTitle: string;
  sourceLocator: string;
  sourceEdition: string;
  verificationStatus?: "unverified" | "verified" | "rejected";
  links?: { relation: RelationType; direction: "out" | "in"; otherType: EndpointType; otherId: string; evidence?: string | null }[];
}

/**
 * Hard problems block the import; gaps are stored with the formula and shown to learners.
 * Nothing is ever filled in: a missing unit stays missing.
 */
export function validateFormula(f: FormulaInput): { problems: Problems; gaps: string[]; record: FormulaRecord | null } {
  const problems: Problems = [];
  const gaps: string[] = [];
  const at = `formula ${f?.id ?? "?"}`;
  if (!f || typeof f !== "object") return { problems: ["formula is not an object"], gaps, record: null };
  if (typeof f.id !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(f.id)) problems.push(`${at}: stable URL-safe id required`);
  for (const k of ["name", "expression", "latex", "sourceTitle", "sourceLocator", "sourceEdition"] as const) {
    if (typeof f[k] !== "string" || !f[k].trim()) problems.push(`${at}: ${k} required`);
  }
  if (!Array.isArray(f.symbols) || f.symbols.length === 0) problems.push(`${at}: symbol definitions required`);
  const seen = new Set<string>();
  for (const s of Array.isArray(f.symbols) ? f.symbols : []) {
    if (!s || typeof s.symbol !== "string" || !s.symbol.trim() || typeof s.meaning !== "string" || !s.meaning.trim()) {
      problems.push(`${at}: every symbol needs symbol + meaning`);
      continue;
    }
    if (seen.has(s.symbol)) problems.push(`${at}: symbol ${s.symbol} defined twice`);
    seen.add(s.symbol);
    if (s.unit === undefined || s.unit === null || s.unit === "") gaps.push(`unit of ${s.symbol} not stated in source`);
  }
  if (!f.assumptions || f.assumptions.length === 0) gaps.push("assumptions not stated in source");
  if (!f.applicability) gaps.push("applicability not stated in source");
  if (!f.dimensionalNotes) gaps.push("dimensional relationship not stated");
  for (const e of f.equivalentForms ?? []) {
    if (!e.verifiedAgainst?.trim()) problems.push(`${at}: equivalent form "${e.expression}" has no verification reference`);
  }
  if (f.verificationStatus === "verified" && gaps.some((g) => g.startsWith("unit of"))) {
    problems.push(`${at}: cannot be verified while a symbol's unit is missing`);
  }
  for (const l of f.links ?? []) {
    const from = l.direction === "out" ? "formula" : l.otherType;
    const to = l.direction === "out" ? l.otherType : "formula";
    problems.push(...validateRelationEndpoints(l.relation, from, to).map((p) => `${at}: ${p}`));
  }
  if (problems.length) return { problems, gaps, record: null };
  return {
    problems,
    gaps,
    record: {
      id: f.id,
      name: f.name.trim(),
      expression: f.expression.trim(),
      latex: f.latex.trim(),
      symbols: f.symbols.map((s) => ({ symbol: s.symbol, meaning: s.meaning, unit: s.unit || null, dimension: s.dimension || null })),
      dimensionalNotes: f.dimensionalNotes ?? null,
      assumptions: f.assumptions ?? [],
      applicability: f.applicability ?? null,
      exclusions: f.exclusions ?? [],
      conventions: f.conventions ?? null,
      equivalentForms: f.equivalentForms ?? [],
      sourceTitle: f.sourceTitle.trim(),
      sourceLocator: f.sourceLocator.trim(),
      sourceEdition: f.sourceEdition.trim(),
      verificationStatus: f.verificationStatus ?? "unverified",
      gaps,
    },
  };
}

export function validateTheoryNote(n: Omit<TheoryNoteRecord, "position"> & { position?: number }): Problems {
  const problems: Problems = [];
  const at = `theory note ${n.id}`;
  if (!n.body?.trim()) problems.push(`${at}: body required`);
  if (n.kind === "source_extract") {
    if (!n.sourceTitle || !n.sourceLocator || !n.sourceEdition) problems.push(`${at}: a source extract needs source title, exact locator and edition`);
    if (n.derivedFrom.length) problems.push(`${at}: a source extract is not derived from anything`);
  } else if (n.verificationStatus === "verified" && n.derivedFrom.length === 0) {
    problems.push(`${at}: a verified teaching note must name the source extract(s) it was rewritten from`);
  }
  if (n.layer === "concise" && n.body.length > 600) problems.push(`${at}: concise layer is limited to 600 characters`);
  return problems;
}
