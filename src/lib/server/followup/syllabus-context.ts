/**
 * Which 2026 syllabus topic a question belongs to, and how SSC has examined it, worked out from
 * the previous-year papers in the bank rather than guessed:
 * - the question's own topic tags when it has them (bank questions);
 * - otherwise the most similar PYP questions (TF-IDF cosine over their text) and their tags.
 * Tags are the ai_suggested / needs_review question_concepts rows (DECISION-003), so the UI says
 * the counts rest on suggested tags. Nothing here calls a model.
 */
import { getDatabase } from "../db";

const CYCLE_PREFIX = "SSC_JE:2026:";
const CACHE_MS = 10 * 60 * 1000;

export interface TopicCandidate {
  nodeId: string;
  kind: "topic" | "chapter" | "subject" | "part";
  /** "Hydrology and Irrigation Engineering › Hydrology › flood estimation" */
  path: string;
  officialText: string;
  /** PYP questions tagged with this node, and the years they appeared in. */
  pypCount: number;
  years: number[];
  weight: number;
}

export interface SimilarPyp {
  questionId: string;
  year: number | null;
  stem: string;
  score: number;
}

export interface SyllabusContext {
  candidates: TopicCandidate[];
  similar: SimilarPyp[];
  /** True when the candidates came from the question's own tags, not from similar questions. */
  fromOwnTags: boolean;
}

interface Doc {
  id: string;
  year: number | null;
  stem: string;
  vector: Map<string, number>;
  norm: number;
  tags: { nodeId: string; kind: string }[];
}

interface Node {
  id: string;
  parentId: string | null;
  kind: string;
  name: string;
  officialText: string;
}

interface NodeVector {
  id: string;
  vector: Map<string, number>;
  norm: number;
}

interface Index {
  builtAt: number;
  docs: Doc[];
  idf: Map<string, number>;
  nodes: Map<string, Node>;
  /** Topic and chapter wording from the notice, for matching a question to the syllabus directly. */
  nodeVectors: NodeVector[];
  counts: Map<string, { count: number; years: Set<number> }>;
}

let cache: Index | null = null;

const STOP = new Set(
  "the a an of to in is are was were be been by for on at as with from that this which what when where who whom whose why how and or not no it its into than then there their these those such can may shall should will would could has have had do does did if but so also any all each other only same both between about above below under over per used use using given following correct incorrect statement statements option options choose select find value approximately nearly respectively".split(" ")
);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [])
    .filter((t) => !STOP.has(t))
    .map((t) => t.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, ""))
    .filter((t) => t.length >= 3);
}

function termFreq(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function build(): Index {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT q.id, q.stem, q.options, p.exam_date FROM bank_questions q JOIN bank_papers p ON p.id = q.paper_id
       WHERE p.kind = 'pyp' AND p.owner_user_id = ''`
    )
    .all() as unknown as { id: string; stem: string; options: string; exam_date: string | null }[];
  const tagRows = db
    .prepare(`SELECT question_id, node_id, node_kind FROM question_concepts WHERE role = 'primary' AND node_id LIKE ?`)
    .all(`${CYCLE_PREFIX}%`) as unknown as { question_id: string; node_id: string; node_kind: string }[];
  const tags = new Map<string, { nodeId: string; kind: string }[]>();
  for (const r of tagRows) {
    const list = tags.get(r.question_id) ?? [];
    list.push({ nodeId: r.node_id, kind: r.node_kind });
    tags.set(r.question_id, list);
  }
  const nodeRows = db
    .prepare(`SELECT id, parent_id, kind, name, official_text FROM syllabus_nodes WHERE id LIKE ?`)
    .all(`${CYCLE_PREFIX}%`) as unknown as { id: string; parent_id: string | null; kind: string; name: string; official_text: string | null }[];
  const nodes = new Map<string, Node>(nodeRows.map((n) => [n.id, { id: n.id, parentId: n.parent_id, kind: n.kind, name: n.name, officialText: n.official_text ?? "" }]));

  const df = new Map<string, number>();
  const raw = rows.map((r) => {
    let optionText = "";
    try {
      optionText = (JSON.parse(r.options) as { text: string }[]).map((o) => o.text).join(" ");
    } catch {
      // Malformed options only lose their words for matching.
    }
    const tf = termFreq(`${r.stem} ${optionText}`);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    const year = r.exam_date ? Number(r.exam_date.slice(0, 4)) : null;
    return { id: r.id, stem: r.stem, year: Number.isFinite(year) ? year : null, tf };
  });
  const n = Math.max(1, raw.length);
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(1 + n / d));

  const counts = new Map<string, { count: number; years: Set<number> }>();
  const docs: Doc[] = raw.map((r) => {
    const vector = new Map<string, number>();
    let sq = 0;
    for (const [t, f] of r.tf) {
      const w = (1 + Math.log(f)) * (idf.get(t) ?? 0);
      vector.set(t, w);
      sq += w * w;
    }
    const docTags = tags.get(r.id) ?? [];
    for (const tag of docTags) {
      const c = counts.get(tag.nodeId) ?? { count: 0, years: new Set<number>() };
      c.count++;
      if (r.year) c.years.add(r.year);
      counts.set(tag.nodeId, c);
    }
    return { id: r.id, year: r.year, stem: r.stem, vector, norm: Math.sqrt(sq) || 1, tags: docTags };
  });
  const nodeVectors: NodeVector[] = [...nodes.values()]
    .filter((node) => node.kind === "topic" || node.kind === "chapter")
    .map((node) => {
      const vector = new Map<string, number>();
      let sq = 0;
      for (const [t, f] of termFreq(`${node.name} ${node.officialText}`)) {
        const w = (1 + Math.log(f)) * (idf.get(t) ?? Math.log(1 + n));
        vector.set(t, w);
        sq += w * w;
      }
      return { id: node.id, vector, norm: Math.sqrt(sq) || 1 };
    });
  return { builtAt: Date.now(), docs, idf, nodes, nodeVectors, counts };
}

function cosine(query: Map<string, number>, qNorm: number, vector: Map<string, number>, norm: number): number {
  let dot = 0;
  for (const [t, w] of query) {
    const d = vector.get(t);
    if (d) dot += w * d;
  }
  return dot / (qNorm * norm);
}

function index(): Index {
  if (!cache || Date.now() - cache.builtAt > CACHE_MS) cache = build();
  return cache;
}

/** Drops the cached index (tests, and after a re-import or re-tagging). */
export function resetSyllabusIndex(): void {
  cache = null;
}

function pathOf(ix: Index, nodeId: string): string {
  const names: string[] = [];
  let node = ix.nodes.get(nodeId);
  let guard = 0;
  while (node && guard++ < 8) {
    if (node.kind !== "part") names.unshift(node.name);
    node = node.parentId ? ix.nodes.get(node.parentId) : undefined;
  }
  return names.join(" › ");
}

function candidate(ix: Index, nodeId: string, weight: number): TopicCandidate | null {
  const node = ix.nodes.get(nodeId);
  if (!node) return null;
  const c = ix.counts.get(nodeId);
  return {
    nodeId,
    kind: node.kind as TopicCandidate["kind"],
    path: pathOf(ix, nodeId) || node.name,
    officialText: node.officialText.slice(0, 400),
    pypCount: c?.count ?? 0,
    years: [...(c?.years ?? [])].sort(),
    weight,
  };
}

const KIND_RANK: Record<string, number> = { topic: 3, chapter: 2, subject: 1, part: 0 };

/**
 * Syllabus context for a question's text. `ownQuestionId` (a bank question) uses its own tags
 * first; similar PYP questions are always listed (never including the question itself).
 * `subjectHint` (e.g. a mock test's title, "Irrigation Engineering") adds that subject's topics.
 */
export function syllabusContext(text: string, ownQuestionId?: string, subjectHint?: string): SyllabusContext {
  const ix = index();
  const tf = termFreq(text);
  const query = new Map<string, number>();
  let sq = 0;
  for (const [t, f] of tf) {
    const w = (1 + Math.log(f)) * (ix.idf.get(t) ?? 0);
    if (!w) continue;
    query.set(t, w);
    sq += w * w;
  }
  const qNorm = Math.sqrt(sq) || 1;
  const scored: { doc: Doc; score: number }[] = [];
  for (const doc of ix.docs) {
    if (doc.id === ownQuestionId) continue;
    let dot = 0;
    for (const [t, w] of query) {
      const d = doc.vector.get(t);
      if (d) dot += w * d;
    }
    if (dot > 0) scored.push({ doc, score: dot / (qNorm * doc.norm) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 12).filter((s) => s.score >= 0.12);

  const own = ownQuestionId ? ix.docs.find((d) => d.id === ownQuestionId)?.tags ?? ownTags(ownQuestionId) : [];
  const weights = new Map<string, number>();
  if (own.length) {
    for (const tag of own) weights.set(tag.nodeId, 10 + (KIND_RANK[tag.kind] ?? 0));
  } else {
    const add = (id: string, w: number) => weights.set(id, (weights.get(id) ?? 0) + w);
    for (const { doc, score } of top) {
      // The most specific tag each neighbour has, weighted by how similar it is.
      const best = [...doc.tags].sort((a, b) => (KIND_RANK[b.kind] ?? 0) - (KIND_RANK[a.kind] ?? 0))[0];
      if (best && best.kind !== "part") add(best.nodeId, score);
    }
    // The notice's own wording for each topic, matched directly.
    ix.nodeVectors
      .map((nv) => ({ id: nv.id, score: cosine(query, qNorm, nv.vector, nv.norm) }))
      .filter((m) => m.score >= 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .forEach((m) => add(m.id, m.score));
    // Topics of the subject the source says the question is from.
    const hint = new Set(tokens(subjectHint ?? ""));
    if (hint.size) {
      const subjects = [...ix.nodes.values()].filter((node) => node.kind === "subject" && tokens(node.name).some((t) => hint.has(t)));
      for (const subject of subjects) {
        const under = (id: string | null): boolean => {
          for (let node = id ? ix.nodes.get(id) : undefined, g = 0; node && g < 8; node = node.parentId ? ix.nodes.get(node.parentId) : undefined, g++) {
            if (node.id === subject.id) return true;
          }
          return false;
        };
        for (const node of ix.nodes.values()) {
          if (node.kind === "topic" && under(node.parentId)) add(node.id, 0.05);
        }
        for (const [id, w] of weights) if (under(id)) weights.set(id, w + 0.3);
      }
    }
  }
  const candidates = [...weights.entries()]
    .map(([id, w]) => candidate(ix, id, w))
    .filter((c): c is TopicCandidate => c !== null)
    .sort((a, b) => b.weight - a.weight || (KIND_RANK[b.kind] ?? 0) - (KIND_RANK[a.kind] ?? 0))
    .slice(0, 12);
  return {
    candidates,
    similar: top.slice(0, 5).map(({ doc, score }) => ({ questionId: doc.id, year: doc.year, stem: doc.stem.slice(0, 300), score: Math.round(score * 100) / 100 })),
    fromOwnTags: own.length > 0,
  };
}

function ownTags(questionId: string): { nodeId: string; kind: string }[] {
  return getDatabase()
    .prepare(`SELECT node_id AS nodeId, node_kind AS kind FROM question_concepts WHERE question_id = ? AND role = 'primary' AND node_id LIKE ?`)
    .all(questionId, `${CYCLE_PREFIX}%`) as unknown as { nodeId: string; kind: string }[];
}
