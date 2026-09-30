/**
 * Versioned exam/content structure (learner spec §3):
 *   Exam → exam cycle → paper → part → subject → chapter → topic → concept/skill
 *
 * Provenance rules that every layer of this module enforces:
 * - origin "official"  = wording printed in an official notice. Must carry the exact printed
 *   text (`officialText`) and a citation. A mechanical split of printed text (on ';' or ',') is
 *   still official wording, but records the split in `splitNote`.
 * - origin "editorial" = an app-made subdivision or grouping. Never carries `officialText`,
 *   never claims review_status "verified" without a human review.
 * Nothing here invents official chapter names, weightages, marks or durations.
 */

export const NODE_KINDS = ["part", "subject", "chapter", "topic", "concept"] as const;
export type SyllabusNodeKind = (typeof NODE_KINDS)[number];

/** Depth rank: a child's kind must rank strictly deeper than its parent's. */
export const NODE_KIND_RANK: Record<SyllabusNodeKind, number> = { part: 0, subject: 1, chapter: 2, topic: 3, concept: 4 };

export const ORIGINS = ["official", "editorial"] as const;
export type SyllabusOrigin = (typeof ORIGINS)[number];

export const REVIEW_STATUSES = ["verified", "draft", "needs_review"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type PaperCode = "P1" | "P2";

export const NODE_RELATIONS = ["prerequisite_of", "commonly_confused_with"] as const;
/**
 * Relation vocabulary and the endpoint types each one allows. node→question tagging is NOT a
 * relation row: it lives in question_concepts (role/origin/confidence). `tested_by` rows exist
 * only for formula→question links.
 */
export const RELATION_ENDPOINTS = {
  prerequisite_of: { from: ["node", "formula"], to: ["node", "formula"] },
  commonly_confused_with: { from: ["node", "formula"], to: ["node", "formula"] },
  explains: { from: ["theory_note", "worked_example"], to: ["node", "formula"] },
  uses_formula: { from: ["node", "worked_example"], to: ["formula"] },
  tested_by: { from: ["formula"], to: ["question"] },
} as const;
export type RelationType = keyof typeof RELATION_ENDPOINTS;
export const RELATION_TYPES = Object.keys(RELATION_ENDPOINTS) as RelationType[];
export type EndpointType = "node" | "formula" | "theory_note" | "worked_example" | "question";

export interface ExamRecord {
  id: string;
  name: string;
  conductingBody: string;
}

export interface ExamCycleRecord {
  id: string;
  examId: string;
  year: number;
  title: string;
  status: "current" | "superseded" | "amendment";
  noticeNumber: string;
  noticeUrl: string;
  noticeSha256: string;
  publishedOn: string;
  notes: string;
}

export interface ExamPaperRecord {
  id: string;
  cycleId: string;
  code: PaperCode;
  title: string;
  position: number;
}

/** One row of the notice's Scheme of Examination table, exactly as printed. */
export interface SchemeRowRecord {
  id: string;
  paperId: string;
  partNodeId: string | null;
  partOrSection: string;
  questions: string;
  marks: string;
  duration: string;
  negativeMarking: string;
  citation: string;
  position: number;
}

export interface SyllabusNodeRecord {
  id: string;
  cycleId: string;
  /** Papers this node applies to. GI&R / GA are Paper-I only; Civil technical nodes may span both. */
  papers: PaperCode[];
  parentId: string | null;
  kind: SyllabusNodeKind;
  name: string;
  /** Exact printed wording (official nodes only). */
  officialText: string | null;
  origin: SyllabusOrigin;
  /** How official text was cut out of a longer printed passage, when it was. */
  splitNote: string | null;
  citation: string | null;
  /** Which source/notice version the node was taken from. */
  sourceVersion: string;
  reviewStatus: ReviewStatus;
  /** Provenance of the parent link itself (a grouping can be editorial even when both ends are official). */
  parentLinkOrigin: SyllabusOrigin | null;
  parentLinkReviewStatus: ReviewStatus | null;
  parentLinkNote: string | null;
  position: number;
  metadata: Record<string, unknown>;
}

export interface SyllabusRelationRecord {
  id: string;
  fromType: EndpointType;
  fromId: string;
  toType: EndpointType;
  toId: string;
  relation: RelationType;
  origin: SyllabusOrigin | "source";
  evidence: string | null;
  reviewStatus: ReviewStatus;
}

export const QUESTION_CONCEPT_ROLES = ["primary", "secondary"] as const;
export type QuestionConceptRole = (typeof QUESTION_CONCEPT_ROLES)[number];
/**
 * source       = the question paper itself printed it (e.g. its section heading)
 * editorial    = an app-made deterministic rule (e.g. position within the official scheme order)
 * ai_suggested = a model proposed it; needs review
 * keyword      = a keyword rule proposed it; needs review
 */
export const QUESTION_CONCEPT_ORIGINS = ["source", "editorial", "ai_suggested", "keyword"] as const;
export type QuestionConceptOrigin = (typeof QUESTION_CONCEPT_ORIGINS)[number];

export interface QuestionConceptRecord {
  questionId: string;
  nodeId: string;
  /** Denormalised from the node: "at most one primary" is enforced per question per level. */
  nodeKind: SyllabusNodeKind;
  role: QuestionConceptRole;
  origin: QuestionConceptOrigin;
  confidence: number | null;
  method: string;
  reviewStatus: ReviewStatus;
}

// ------------------------------------------------------------------ formulas & theory

export const VERIFICATION_STATUSES = ["unverified", "verified", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface FormulaSymbol {
  symbol: string;
  meaning: string;
  /** null = the source did not state a unit. Recorded as a gap, never filled in by a model. */
  unit: string | null;
  dimension: string | null;
}

export interface FormulaRecord {
  id: string;
  name: string;
  /** Readable maths, e.g. "σ = M·y / I". */
  expression: string;
  latex: string;
  symbols: FormulaSymbol[];
  dimensionalNotes: string | null;
  assumptions: string[];
  applicability: string | null;
  exclusions: string[];
  conventions: string | null;
  /** Only forms that were themselves verified against the source. */
  equivalentForms: { expression: string; latex: string; verifiedAgainst: string }[];
  sourceTitle: string;
  /** Exact page / section / clause. */
  sourceLocator: string;
  /** Edition or code version, e.g. "IS 456:2000 (Reaffirmed 2021)". */
  sourceEdition: string;
  verificationStatus: VerificationStatus;
  /** Explicit gaps (missing units, missing assumptions, …) found by validation. */
  gaps: string[];
}

export const THEORY_NOTE_KINDS = ["source_extract", "teaching_note"] as const;
export type TheoryNoteKind = (typeof THEORY_NOTE_KINDS)[number];
export const THEORY_LAYERS = ["concise", "detail"] as const;
export type TheoryLayer = (typeof THEORY_LAYERS)[number];

export interface TheoryNoteRecord {
  id: string;
  nodeId: string;
  kind: TheoryNoteKind;
  layer: TheoryLayer;
  body: string;
  /** Teaching notes point at the source extract(s) they were rewritten from. */
  derivedFrom: string[];
  diagrams: { path: string; caption: string; source: string | null }[];
  sourceTitle: string | null;
  sourceLocator: string | null;
  sourceEdition: string | null;
  verificationStatus: VerificationStatus;
  position: number;
}

export interface WorkedExampleRecord {
  id: string;
  nodeId: string;
  title: string;
  problem: string;
  steps: string[];
  answer: string;
  bankQuestionId: string | null;
  sourceTitle: string | null;
  sourceLocator: string | null;
  verificationStatus: VerificationStatus;
}

// ------------------------------------------------------------------ API shapes

export interface SyllabusTreeNode {
  id: string;
  parentId: string | null;
  kind: SyllabusNodeKind;
  name: string;
  origin: SyllabusOrigin;
  reviewStatus: ReviewStatus;
  papers: PaperCode[];
  citation: string | null;
  splitNote: string | null;
  parentLinkOrigin: SyllabusOrigin | null;
  parentLinkReviewStatus: ReviewStatus | null;
  printedLabel: string | null;
  /** Distinct PYP bank questions linked to this node (any role). */
  directQuestionCount: number;
  /** Distinct PYP bank questions linked to this node or any descendant. */
  questionCount: number;
  children: SyllabusTreeNode[];
}

export interface SyllabusTreeResponse {
  cycle: ExamCycleRecord;
  papers: (ExamPaperRecord & { scheme: SchemeRowRecord[] })[];
  roots: SyllabusTreeNode[];
  totals: { nodes: number; taggedQuestions: number; pypQuestions: number };
  mappingNote: string;
}

export interface SyllabusNodeDetail {
  node: Omit<SyllabusNodeRecord, "metadata"> & { printedLabel: string | null };
  cycle: ExamCycleRecord;
  ancestors: { id: string; kind: SyllabusNodeKind; name: string; origin: SyllabusOrigin }[];
  children: { id: string; kind: SyllabusNodeKind; name: string; origin: SyllabusOrigin; reviewStatus: ReviewStatus }[];
  relations: {
    relation: RelationType;
    direction: "out" | "in";
    otherType: EndpointType;
    otherId: string;
    otherName: string | null;
    origin: string;
    reviewStatus: ReviewStatus;
    evidence: string | null;
  }[];
  /** Gaps (missing units/assumptions) are part of the record and shown, never filled in. */
  formulas: FormulaRecord[];
  theoryNotes: TheoryNoteRecord[];
  workedExamples: Omit<WorkedExampleRecord, "answer">[];
  questionCounts: {
    total: number;
    byPaperYear: { paper: string; year: number | null; count: number }[];
    byOrigin: { origin: QuestionConceptOrigin; count: number }[];
  };
}
