/**
 * Builds the SSC JE Civil syllabus hierarchy from the verified notice JSON
 * (src/lib/syllabus-source-ssc-je-2026.json). Pure: no database access. Output is deterministic,
 * so seeding is idempotent and node ids are stable across runs.
 *
 * What is official and what is editorial:
 * - Parts, the 13 Paper-I Part-A subjects, the 21 Paper-II headings (chapters) and the items of
 *   each heading (topics) all carry exact printed wording + the notice citation → origin official.
 * - Topic items are a MECHANICAL split of the printed heading text (on ';', sentence breaks and,
 *   where the notice lists separate items, ','). The wording is exact; the split is recorded in
 *   split_note. A printed sub-label such as "Construction materials:" is kept in
 *   metadata.printedLabel rather than glued onto each item.
 * - Grouping a Paper-II heading under a Paper-I subject is official only where the names are
 *   identical; otherwise the parent link is editorial (parent_link_origin = 'editorial').
 * - No concepts are seeded: there is no cited teaching source in the repo yet.
 */
import { SYLLABUS_SOURCE, findNotice, findSyllabusRow, type SyllabusSource } from "./source";
import type {
  ExamCycleRecord,
  ExamPaperRecord,
  ExamRecord,
  PaperCode,
  SchemeRowRecord,
  SyllabusNodeRecord,
} from "./types";

export const EXAM_ID = "SSC_JE";
export const CYCLE_2026 = "SSC_JE:2026";
export const CYCLE_2025 = "SSC_JE:2025";
export const CURRENT_CYCLE_ID = CYCLE_2026;

const SRC_2026 = "SSC JE 2026 notice F. No. HQ-C-3019/1/2026-C-3 (02.09.2026)";
const SRC_2025 = "SSC JE 2025 notice (Notice_of_adv_je_2025.pdf) — superseded";

/** Stable ids of the four official part nodes of the 2026 cycle. */
export const PART_IDS = {
  gir: `${CYCLE_2026}:part:p1-gir`,
  ga: `${CYCLE_2026}:part:p1-ga`,
  p1Civil: `${CYCLE_2026}:part:p1-civil`,
  p2Civil: `${CYCLE_2026}:part:p2-civil`,
} as const;

/**
 * Parts whose questions may be tagged below a given part. Paper-II Civil questions are tagged
 * against the shared Civil subject tree, which hangs under the Paper-I Civil part.
 * GI&R and GA never share nodes with Civil technical content.
 */
export const TAGGABLE_SUBTREE_OF_PART: Record<string, string> = {
  [PART_IDS.gir]: PART_IDS.gir,
  [PART_IDS.ga]: PART_IDS.ga,
  [PART_IDS.p1Civil]: PART_IDS.p1Civil,
  [PART_IDS.p2Civil]: PART_IDS.p1Civil,
};

export function slug(text: string, max = 64): string {
  const s = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length <= max ? s : s.slice(0, max).replace(/-+$/, "");
}

// ------------------------------------------------------------------ official wording

/** Paper-I Part-A (Civil) subject list, in printed order. Joined with ", " + "." it must equal the printed text. */
export const P1_CIVIL_SUBJECTS_2026 = [
  "Engineering Mechanics",
  "Solid Mechanics",
  "Structural Analysis",
  "Construction Materials and Management",
  "Estimating, Costing and Valuation",
  "Concrete Structures",
  "Steel Structures",
  "Surveying",
  "Soil Mechanics (Geotechnical Engineering)",
  "Fluid Mechanics and Hydraulics",
  "Hydrology and Irrigation Engineering",
  "Environmental Engineering",
  "Transportation (Traffic) Engineering",
] as const;

/** Paper-II heading → the Paper-I subject it is grouped under. */
export const P2_HEADING_TO_SUBJECT: Record<string, (typeof P1_CIVIL_SUBJECTS_2026)[number]> = {
  "Engineering Mechanics": "Engineering Mechanics",
  "Solid Mechanics": "Solid Mechanics",
  "Structural Analysis": "Structural Analysis",
  "Construction Materials and Management": "Construction Materials and Management",
  "Estimating, Costing and Valuation": "Estimating, Costing and Valuation",
  "Concrete Structures": "Concrete Structures",
  "Steel Structures": "Steel Structures",
  Surveying: "Surveying",
  "Soil Mechanics": "Soil Mechanics (Geotechnical Engineering)",
  "Fluid Mechanics": "Fluid Mechanics and Hydraulics",
  Hydraulics: "Fluid Mechanics and Hydraulics",
  Hydrology: "Hydrology and Irrigation Engineering",
  Irrigation: "Hydrology and Irrigation Engineering",
  "Water and Wastewater Quality and Treatment": "Environmental Engineering",
  "Air Pollution": "Environmental Engineering",
  "Municipal Solid Wastes": "Environmental Engineering",
  "Transportation Infrastructure": "Transportation (Traffic) Engineering",
  "Highway Pavements": "Transportation (Traffic) Engineering",
  "Traffic Engineering": "Transportation (Traffic) Engineering",
};

/**
 * Mechanical split of each Paper-II heading's printed text. Every entry is an exact substring
 * of the printed text, in printed order. "§Label" sets the printed sub-label for the items that
 * follow; "§" clears it. validate.ts proves that items + labels cover the whole printed text
 * (only separators left over).
 */
export const P2_TOPIC_SPLITS: Record<string, string[]> = {
  "Engineering Mechanics": [
    "System of forces", "free-body diagrams", "equilibrium equations", "Internal forces in structures",
    "Friction and its applications", "Centre of mass", "Moment of Inertia",
  ],
  "Solid Mechanics": [
    "Bending moment and shear force in statically determinate beams", "Simple stress and strain relationships",
    "Simple bending theory", "flexural and shear stresses", "Uniform torsion", "buckling of column",
    "combined and direct bending stresses",
  ],
  "Structural Analysis": [
    "Introduction to Statically determinate and indeterminate structures", "Method of superposition",
    "Analysis of trusses, arches, beams, cables and frames", "Slope deflection and moment distribution method", "Influence lines",
  ],
  "Construction Materials and Management": [
    "§Construction materials", "Bricks", "Stones", "Timber", "Steel", "Cement", "Aggregates", "Plastics", "Polymers", "Glass",
    "Concrete", "concrete mix design", "testing of concrete",
    "§Construction Management", "Types of construction projects", "Project planning and network analysis - PERT and CPM",
  ],
  "Estimating, Costing and Valuation": [
    "Fundamentals of estimating", "Cost Estimates for works", "Rate Analysis", "Valuation", "Detailed Estimates",
  ],
  "Concrete Structures": [
    "Working stress and Limit State design concepts", "Design of beams, slabs, columns", "Foundation and Retaining Walls",
    "Bond and development length",
  ],
  "Steel Structures": [
    "Working stress and Limit state design concepts", "Bolted connections", "Welds",
    "Design of tension members, compression members and beams", "Concept of plastic analysis - beams and frames",
  ],
  Surveying: [
    "Principles of surveying", "Errors and their adjustment", "Maps - scale, coordinate system",
    "§Distance and angle measurement", "Chain and Compass survey", "Plane table surveying", "Levelling and trigonometric levelling",
    "§", "Traversing and triangulation survey", "Total station", "Tacheometric surveying", "Theodolite Surveying",
    "Advanced surveying equipment",
  ],
  "Soil Mechanics": [
    "Three-phase system and phase relationships", "index properties", "Unified and Indian standard soil classification system",
    "Permeability - one dimensional flow",
    "§Seepage through soils", "two-dimensional flow", "flow nets", "uplift pressure", "piping", "capillarity", "seepage force",
    "§", "Principle of effective stress and quicksand condition", "Compaction of soils", "One-dimensional consolidation",
    "time rate of consolidation", "Shear Strength", "Mohr's circle", "effective and total shear strength parameters",
    "Stress-Strain characteristics of clays and sand",
  ],
  "Fluid Mechanics": [
    "Properties of fluids", "fluid statics", "Continuity, momentum and energy equations and their applications",
    "Laminar and turbulent flow", "Flow in pipes", "pipe networks", "Concept of lift and drag",
  ],
  Hydraulics: [
    "Forces on immersed bodies", "Flow measurement in channels and pipes",
    "§Channel Hydraulics", "Energy-depth relationships", "specific energy", "critical flow", "hydraulic jump", "uniform flow",
  ],
  Hydrology: [
    "Hydrologic cycle", "precipitation", "evaporation", "evapo-transpiration", "watershed", "infiltration", "unit hydrographs",
    "hydrograph analysis", "reservoir capacity", "flood estimation and routing",
    "§groundwater hydrology", "steady-state well hydraulics and aquifers", "§", "Application of Darcy's Law",
  ],
  Irrigation: [
    "Types of irrigation systems and methods",
    "§Crop water requirements", "Duty", "delta", "evapo-transpiration",
    "§", "Gravity Dams and Spillways", "Lined and unlined canals", "cross drainage structures",
  ],
  "Water and Wastewater Quality and Treatment": [
    "Basics of water quality standards – Physical, chemical and biological parameters", "Water quality index",
    "Unit processes and operations", "Water requirement", "Water distribution system", "Drinking water treatment",
    "Sewerage system design", "quantity of domestic wastewater", "primary and secondary treatment",
    "Effluent discharge standards", "Sludge disposal", "Reuse of treated sewage for different applications",
  ],
  "Air Pollution": [
    "Types of Pollutants, their sources and impacts", "Air Pollution control", "Air Quality Standards", "Air Quality Index and limits",
  ],
  "Municipal Solid Wastes": [
    "Characteristics, generation, collection and transportation of solid wastes",
    "engineered systems for solid waste management (reuse/recycle, energy recovery, treatment and disposal)",
  ],
  "Transportation Infrastructure": [
    "§Geometric design of highways", "cross-sectional elements", "sight distances", "horizontal and vertical alignments",
    "§", "Geometric design of railway Track – Speed and Cant",
  ],
  "Highway Pavements": [
    "Highway materials - desirable properties and tests", "Desirable properties of bituminous paving mixes",
    "Design factors for flexible and rigid pavements", "Design of flexible and rigid pavement using IRC codes",
  ],
  "Traffic Engineering": [
    "Traffic studies on flow and speed", "peak hour factor", "accident study", "fundamental relationships", "Traffic signs",
    "Signal design by Webster's method", "Types of intersections", "Highway capacity",
  ],
};

/** GI&R: the comma list after "The test may include questions on" (the notice ends it with "etc."). */
export const GIR_LISTED_AREAS = [
  "analogies", "similarities", "differences", "space visualization", "problem-solving", "analysis", "judgment",
  "decision-making", "visual memory", "discrimination", "observation", "relationship concepts", "arithmetical reasoning",
  "verbal and figure classification", "arithmetical number series",
];
const GIR_LIST_SPAN =
  "analogies, similarities, differences, space visualization, problem-solving, analysis, judgment, decision-making, visual memory, discrimination, observation, relationship concepts, arithmetical reasoning, verbal and figure classification, arithmetical number series";

/** GA: "current events" plus the list after "especially pertaining to" (ends with "etc."). */
export const GA_LISTED_AREAS = ["current events", "History", "Culture", "Geography", "Economic Scene", "General Polity", "Scientific Research"];

/** 2025 (superseded) Paper-I Part-A wording, as quoted from the 2025 notice in the source file's `differences`. */
export const P1_CIVIL_2025_BLOCK =
  "Building Materials, Estimating, Costing and Valuation, Surveying, Soil Mechanics, Hydraulics, Irrigation Engineering, Transportation Engineering, Environmental Engineering";
export const P1_CIVIL_2025_SUBJECTS = [
  "Building Materials", "Estimating, Costing and Valuation", "Surveying", "Soil Mechanics", "Hydraulics",
  "Irrigation Engineering", "Transportation Engineering", "Environmental Engineering",
];
export const P1_STRUCTURAL_2025_BLOCK = "Structural Engineering: Theory of Structures, Concrete Technology, RCC Design, Steel Design";
export const P1_STRUCTURAL_2025_ITEMS = ["Theory of Structures", "Concrete Technology", "RCC Design", "Steel Design"];

// ------------------------------------------------------------------ builder

export interface SyllabusSeed {
  exams: ExamRecord[];
  cycles: ExamCycleRecord[];
  papers: ExamPaperRecord[];
  schemeRows: SchemeRowRecord[];
  /** Parents always precede children. */
  nodes: SyllabusNodeRecord[];
}

export interface TopicSplitItem {
  text: string;
  label: string | null;
}

export function parseSplit(entries: string[]): TopicSplitItem[] {
  const out: TopicSplitItem[] = [];
  let label: string | null = null;
  for (const e of entries) {
    if (e.startsWith("§")) label = e.slice(1) || null;
    else out.push({ text: e, label });
  }
  return out;
}

const MECHANICAL_SPLIT_NOTE =
  "Mechanical split of the printed heading text on ';', sentence breaks and, where the notice lists separate items, ','. Wording is exact; the split is app-made.";

export function buildSyllabusSeed(source: SyllabusSource = SYLLABUS_SOURCE): SyllabusSeed {
  const current = findNotice("current", source);
  const superseded = findNotice("superseded", source);

  const exams: ExamRecord[] = [{ id: EXAM_ID, name: "SSC Junior Engineer (Civil) Examination", conductingBody: "Staff Selection Commission" }];
  const cycles: ExamCycleRecord[] = [
    {
      id: CYCLE_2026,
      examId: EXAM_ID,
      year: 2026,
      title: current.cycle,
      status: "current",
      noticeNumber: current.notice_number,
      noticeUrl: current.url,
      noticeSha256: current.sha256,
      publishedOn: current.published_on,
      notes: current.notes,
    },
    {
      id: CYCLE_2025,
      examId: EXAM_ID,
      year: 2025,
      title: superseded.cycle,
      status: "superseded",
      noticeNumber: superseded.notice_number,
      noticeUrl: superseded.url,
      noticeSha256: superseded.sha256,
      publishedOn: superseded.published_on,
      notes: superseded.notes,
    },
  ];

  const papers: ExamPaperRecord[] = [
    { id: `${CYCLE_2026}:P1`, cycleId: CYCLE_2026, code: "P1", title: "Paper-I", position: 1 },
    { id: `${CYCLE_2026}:P2`, cycleId: CYCLE_2026, code: "P2", title: "Paper-II", position: 2 },
  ];

  const nodes: SyllabusNodeRecord[] = [];
  const node = (n: Omit<SyllabusNodeRecord, "metadata" | "parentLinkNote"> & { metadata?: Record<string, unknown>; parentLinkNote?: string | null }) => {
    nodes.push({ metadata: {}, parentLinkNote: null, ...n });
    return n.id;
  };
  const partBase = { cycleId: CYCLE_2026, parentId: null, kind: "part" as const, origin: "official" as const, splitNote: null, sourceVersion: SRC_2026, reviewStatus: "verified" as const, parentLinkOrigin: null, parentLinkReviewStatus: null };

  // ---- Paper-I parts
  const gir = findSyllabusRow("Paper-I", "General Intelligence & Reasoning", "", source);
  const ga = findSyllabusRow("Paper-I", "General Awareness", "", source);
  const p1Civil = findSyllabusRow("Paper-I", "Part-A (Civil Engineering)", "", source);
  const scheme = source.scheme;
  node({ ...partBase, id: PART_IDS.gir, papers: ["P1"], name: gir.part, officialText: gir.verbatim, citation: gir.citation, position: 1, metadata: { schemeRow: scheme[0].part_or_section } });
  node({ ...partBase, id: PART_IDS.ga, papers: ["P1"], name: ga.part, officialText: ga.verbatim, citation: ga.citation, position: 2, metadata: { schemeRow: scheme[1].part_or_section } });
  node({
    ...partBase,
    id: PART_IDS.p1Civil,
    papers: ["P1", "P2"],
    name: "Part-A General Engineering (Civil & Structural)",
    officialText: p1Civil.verbatim,
    citation: `${p1Civil.citation}; name as printed in ${scheme[2].citation}`,
    position: 3,
    metadata: {
      schemeRow: scheme[2].part_or_section,
      syllabusHeading: p1Civil.part,
      note: "Paper-II Part-A headings are grouped under these Paper-I subjects so both papers share one Civil tree.",
    },
  });
  const p2Heading = source.syllabus.find((r) => r.paper === "Paper-II")!;
  node({
    ...partBase,
    id: PART_IDS.p2Civil,
    papers: ["P2"],
    name: p2Heading.part,
    officialText: scheme[3].part_or_section,
    citation: `${scheme[3].citation}; syllabus para 14.3.1`,
    position: 4,
    metadata: {
      schemeRow: scheme[3].part_or_section,
      sharesSubjectTreeWith: PART_IDS.p1Civil,
      note: "The 21 Paper-II headings appear as chapters under the matching Paper-I subjects (see Part-A General Engineering).",
    },
  });

  // ---- GI&R / GA listed areas (mechanical splits of the printed paragraph)
  const girSpanStart = gir.verbatim.indexOf(GIR_LIST_SPAN);
  GIR_LISTED_AREAS.forEach((text, i) =>
    node({
      id: `${PART_IDS.gir}:topic:${slug(text)}`,
      cycleId: CYCLE_2026,
      papers: ["P1"],
      parentId: PART_IDS.gir,
      kind: "topic",
      name: text,
      officialText: text,
      origin: "official",
      splitNote: `Mechanical ',' split of the printed list "The test may include questions on …, etc." (para 14.2.1). The notice's list is not exhaustive.${girSpanStart < 0 ? " WARNING: list span not found." : ""}`,
      citation: gir.citation,
      sourceVersion: SRC_2026,
      reviewStatus: "verified",
      parentLinkOrigin: "official",
      parentLinkReviewStatus: "verified",
      position: i + 1,
    })
  );
  GA_LISTED_AREAS.forEach((text, i) =>
    node({
      id: `${PART_IDS.ga}:topic:${slug(text)}`,
      cycleId: CYCLE_2026,
      papers: ["P1"],
      parentId: PART_IDS.ga,
      kind: "topic",
      name: text,
      officialText: text,
      origin: "official",
      splitNote:
        i === 0
          ? 'Quoted from "knowledge of current events" (para 14.2.2).'
          : 'Mechanical split of "especially pertaining to History, Culture, Geography, Economic Scene, General Polity and Scientific Research, etc." — printed in the context of "India and its neighboring countries"; not exhaustive.',
      citation: ga.citation,
      sourceVersion: SRC_2026,
      reviewStatus: "verified",
      parentLinkOrigin: "official",
      parentLinkReviewStatus: "verified",
      position: i + 1,
    })
  );

  // ---- Civil subjects (official names from the Paper-I list)
  const subjectId = (name: string) => `${CYCLE_2026}:subject:${slug(name)}`;
  P1_CIVIL_SUBJECTS_2026.forEach((name, i) =>
    node({
      id: subjectId(name),
      cycleId: CYCLE_2026,
      papers: ["P1", "P2"],
      parentId: PART_IDS.p1Civil,
      kind: "subject",
      name,
      officialText: name,
      origin: "official",
      splitNote: "Item of the printed comma-separated Paper-I Part-A list (para 14.2.3); split checked to rejoin to the exact printed text.",
      citation: p1Civil.citation,
      sourceVersion: SRC_2026,
      reviewStatus: "verified",
      parentLinkOrigin: "official",
      parentLinkReviewStatus: "verified",
      position: i + 1,
      metadata: { paperApplicabilityNote: "Named in the Paper-I list; Paper-II applicability comes from the Paper-II headings grouped beneath it." },
    })
  );

  // ---- Paper-II headings (chapters) and their items (topics)
  const chapterPos = new Map<string, number>();
  for (const row of source.syllabus.filter((r) => r.paper === "Paper-II")) {
    const subject = P2_HEADING_TO_SUBJECT[row.heading];
    if (!subject) throw new Error(`no subject mapping for Paper-II heading "${row.heading}"`);
    const sameName = subject === row.heading;
    const pos = (chapterPos.get(subject) ?? 0) + 1;
    chapterPos.set(subject, pos);
    const chapterId = `${CYCLE_2026}:chapter:${slug(row.heading)}`;
    node({
      id: chapterId,
      cycleId: CYCLE_2026,
      papers: ["P2"],
      parentId: subjectId(subject),
      kind: "chapter",
      name: row.heading,
      officialText: row.verbatim,
      origin: "official",
      splitNote: null,
      citation: row.citation,
      sourceVersion: SRC_2026,
      reviewStatus: "verified",
      parentLinkOrigin: sameName ? "official" : "editorial",
      parentLinkReviewStatus: sameName ? "verified" : "needs_review",
      parentLinkNote: sameName
        ? "Paper-II heading and Paper-I subject are printed with the same name."
        : `Editorial grouping: the notice prints Paper-II heading "${row.heading}" and Paper-I subject "${subject}" separately; the app groups them by name.`,
      position: pos,
    });
    const split = P2_TOPIC_SPLITS[row.heading];
    if (!split) throw new Error(`no topic split for Paper-II heading "${row.heading}"`);
    parseSplit(split).forEach((item, i) =>
      node({
        id: `${chapterId}:topic:${slug(item.label ? `${item.label} ${item.text}` : item.text)}`,
        cycleId: CYCLE_2026,
        papers: ["P2"],
        parentId: chapterId,
        kind: "topic",
        name: item.text,
        officialText: item.text,
        origin: "official",
        splitNote: MECHANICAL_SPLIT_NOTE,
        citation: row.citation,
        sourceVersion: SRC_2026,
        reviewStatus: "verified",
        parentLinkOrigin: "official",
        parentLinkReviewStatus: "verified",
        position: i + 1,
        metadata: item.label ? { printedLabel: item.label } : {},
      })
    );
  }

  // ---- 2025 (superseded) Paper-I Part-A, kept for version history. Quoted from the source
  // file's comparison of the two notices; page not recorded there, so review is pending.
  const cite2025 =
    "SSC JE 2025 notice (Notice_of_adv_je_2025.pdf), para 14 Indicative Syllabus, Paper-I Part-A — page not recorded; quoted in src/lib/syllabus-source-ssc-je-2026.json 'differences'";
  const part2025 = `${CYCLE_2025}:part:p1-civil`;
  const base2025 = { cycleId: CYCLE_2025, papers: ["P1"] as PaperCode[], origin: "official" as const, citation: cite2025, sourceVersion: SRC_2025, reviewStatus: "needs_review" as const };
  node({ ...base2025, id: part2025, parentId: null, kind: "part", name: "Part-A (Civil Engineering)", officialText: P1_CIVIL_2025_BLOCK, splitNote: null, parentLinkOrigin: null, parentLinkReviewStatus: null, position: 1 });
  P1_CIVIL_2025_SUBJECTS.forEach((name, i) =>
    node({ ...base2025, id: `${CYCLE_2025}:subject:${slug(name)}`, parentId: part2025, kind: "subject", name, officialText: name, splitNote: "Item of the printed 2025 Paper-I Part-A list.", parentLinkOrigin: "official", parentLinkReviewStatus: "needs_review", position: i + 1 })
  );
  const structural2025 = `${CYCLE_2025}:subject:structural-engineering`;
  node({ ...base2025, id: structural2025, parentId: part2025, kind: "subject", name: "Structural Engineering", officialText: P1_STRUCTURAL_2025_BLOCK, splitNote: null, parentLinkOrigin: "official", parentLinkReviewStatus: "needs_review", position: P1_CIVIL_2025_SUBJECTS.length + 1 });
  P1_STRUCTURAL_2025_ITEMS.forEach((name, i) =>
    node({ ...base2025, id: `${CYCLE_2025}:chapter:${slug(name)}`, parentId: structural2025, kind: "chapter", name, officialText: name, splitNote: 'Item of the printed "Structural Engineering:" list (2025).', parentLinkOrigin: "official", parentLinkReviewStatus: "needs_review", position: i + 1 })
  );

  // ---- scheme rows, exactly as printed
  const partForRow = [PART_IDS.gir, PART_IDS.ga, PART_IDS.p1Civil, PART_IDS.p2Civil];
  const schemeRows: SchemeRowRecord[] = scheme.map((r, i) => ({
    id: `${CYCLE_2026}:scheme:${i + 1}`,
    paperId: r.paper === "Paper-I" ? `${CYCLE_2026}:P1` : `${CYCLE_2026}:P2`,
    partNodeId: partForRow[i] ?? null,
    partOrSection: r.part_or_section,
    questions: r.questions,
    marks: r.marks,
    duration: r.duration,
    negativeMarking: r.negative_marking,
    citation: r.citation,
    position: i + 1,
  }));

  return { exams, cycles, papers, schemeRows, nodes };
}

// ------------------------------------------------------------------ bank section → part

export type PaperLevelTag = { nodeId: string; origin: "source" | "editorial"; method: string; reviewStatus: "verified" | "needs_review" };

/**
 * Maps a bank question to its official 2026 part node from what the paper itself printed.
 * - A printed section heading → origin 'source' (verified).
 * - "Unlabelled section" on a 200-question Paper-I → Paper-I's printed scheme order
 *   (GI&R 1–50, GA 51–100, Civil 101–200): origin 'editorial', needs review, because the order
 *   is an inference (the 2016 paper, for one, printed Civil first).
 * Returns null when neither applies.
 */
export function paperLevelTag(q: { section: string; position: number; paper: string; paperQuestionCount: number }): PaperLevelTag | null {
  const s = q.section.trim();
  const civil = q.paper === "P2" ? PART_IDS.p2Civil : PART_IDS.p1Civil;
  if (/reasoning|intelligence/i.test(s)) {
    return q.paper === "P1" ? { nodeId: PART_IDS.gir, origin: "source", method: "printed_section_heading", reviewStatus: "verified" } : null;
  }
  if (/awareness/i.test(s)) {
    return q.paper === "P1" ? { nodeId: PART_IDS.ga, origin: "source", method: "printed_section_heading", reviewStatus: "verified" } : null;
  }
  if (/engineering|civil|structural/i.test(s)) {
    return { nodeId: civil, origin: "source", method: "printed_section_heading", reviewStatus: "verified" };
  }
  if (/^unlabel+ed section$/i.test(s) && q.paper === "P1" && q.paperQuestionCount === 200) {
    const nodeId = q.position <= 50 ? PART_IDS.gir : q.position <= 100 ? PART_IDS.ga : PART_IDS.p1Civil;
    return { nodeId, origin: "editorial", method: "p1_scheme_order_position", reviewStatus: "needs_review" };
  }
  return null;
}
