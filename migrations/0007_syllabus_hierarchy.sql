-- ============================================================================
-- Migration: 0007_syllabus_hierarchy.sql
-- Description: Versioned exam and content structure (learner spec §3) for SSC JE Civil:
--   exams → exam_cycles → exam_papers (+ exam_scheme_rows, as printed)
--   syllabus_nodes: part → subject → chapter → topic → concept, one table, parent_id tree
--   syllabus_relations: prerequisite_of | explains | uses_formula | tested_by | commonly_confused_with
--   question_concepts: bank question ↔ node, role primary|secondary (one primary per level)
--   formulas + formula_symbols (+ formula_links view), theory_notes, worked_examples
-- Documentation copy: the live DDL runs from src/lib/server/db.ts (runSyllabusMigrations).
-- Additive only (CREATE ... IF NOT EXISTS). SQLite dialect.
--
-- Provenance rules:
--   * origin 'official'  = exact printed wording of an official notice; official_text and
--     citation are required (CHECK). Mechanical splits of printed text record split_note.
--   * origin 'editorial' = app-made subdivision/grouping; official_text must be NULL (CHECK).
--   * parent_link_origin/review_status record whether the grouping itself is official.
--   * No weightages, marks or durations are stored except the scheme rows copied verbatim.
--   * theory_notes of kind 'source_extract' are immutable (trigger).
-- Seed: scripts/seed-syllabus.mjs (idempotent) from src/lib/syllabus-source-ssc-je-2026.json.
-- ============================================================================
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    conducting_body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS exam_cycles (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('current', 'superseded', 'amendment')),
    notice_number TEXT NOT NULL,
    notice_url TEXT NOT NULL DEFAULT '',
    notice_sha256 TEXT NOT NULL DEFAULT '',
    published_on TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    UNIQUE (exam_id, year)
);

CREATE TABLE IF NOT EXISTS exam_papers (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL,
    code TEXT NOT NULL CHECK (code IN ('P1', 'P2')),
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cycle_id) REFERENCES exam_cycles(id) ON DELETE CASCADE,
    UNIQUE (cycle_id, code)
);

-- One node per level of Exam cycle → part → subject → chapter → topic → concept.
-- origin 'official' = printed wording (official_text + citation required);
-- origin 'editorial' = app-made (official_text must stay NULL).
-- parent_link_* records the provenance of the grouping itself: an official chapter can sit
-- under an official subject through an editorial mapping.
CREATE TABLE IF NOT EXISTS syllabus_nodes (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL,
    papers TEXT NOT NULL DEFAULT '[]',
    parent_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('part', 'subject', 'chapter', 'topic', 'concept')),
    name TEXT NOT NULL,
    official_text TEXT,
    origin TEXT NOT NULL CHECK (origin IN ('official', 'editorial')),
    split_note TEXT,
    citation TEXT,
    source_version TEXT NOT NULL,
    review_status TEXT NOT NULL CHECK (review_status IN ('verified', 'draft', 'needs_review')),
    parent_link_origin TEXT CHECK (parent_link_origin IS NULL OR parent_link_origin IN ('official', 'editorial')),
    parent_link_review_status TEXT CHECK (parent_link_review_status IS NULL OR parent_link_review_status IN ('verified', 'draft', 'needs_review')),
    parent_link_note TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (cycle_id) REFERENCES exam_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES syllabus_nodes(id) ON DELETE RESTRICT,
    CHECK (origin = 'editorial' OR (length(coalesce(official_text, '')) > 0 AND length(coalesce(citation, '')) > 0)),
    CHECK (origin = 'official' OR official_text IS NULL),
    CHECK ((parent_id IS NULL) = (parent_link_origin IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_syllabus_nodes_cycle ON syllabus_nodes(cycle_id, kind);
CREATE INDEX IF NOT EXISTS idx_syllabus_nodes_parent ON syllabus_nodes(parent_id, position);

-- The notice's Scheme of Examination rows, exactly as printed (strings, not parsed numbers).
CREATE TABLE IF NOT EXISTS exam_scheme_rows (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    part_node_id TEXT,
    part_or_section TEXT NOT NULL,
    questions TEXT NOT NULL,
    marks TEXT NOT NULL,
    duration TEXT NOT NULL,
    negative_marking TEXT NOT NULL,
    citation TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE,
    FOREIGN KEY (part_node_id) REFERENCES syllabus_nodes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_scheme_rows_paper ON exam_scheme_rows(paper_id, position);

-- Typed edges between nodes, formulas, theory notes, worked examples and questions.
-- Endpoint pairs per relation are enforced in src/lib/syllabus/validate.ts; prerequisite_of
-- must stay acyclic (checked before every insert). Node→question tagging is NOT stored here
-- (see question_concepts); tested_by rows are formula→question only.
CREATE TABLE IF NOT EXISTS syllabus_relations (
    id TEXT PRIMARY KEY,
    from_type TEXT NOT NULL CHECK (from_type IN ('node', 'formula', 'theory_note', 'worked_example', 'question')),
    from_id TEXT NOT NULL,
    to_type TEXT NOT NULL CHECK (to_type IN ('node', 'formula', 'theory_note', 'worked_example', 'question')),
    to_id TEXT NOT NULL,
    relation TEXT NOT NULL CHECK (relation IN ('prerequisite_of', 'explains', 'uses_formula', 'tested_by', 'commonly_confused_with')),
    origin TEXT NOT NULL CHECK (origin IN ('official', 'editorial', 'source')),
    evidence TEXT,
    review_status TEXT NOT NULL CHECK (review_status IN ('verified', 'draft', 'needs_review')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE (from_type, from_id, to_type, to_id, relation),
    CHECK (NOT (from_type = to_type AND from_id = to_id))
);
CREATE INDEX IF NOT EXISTS idx_syllabus_relations_to ON syllabus_relations(to_type, to_id, relation);

-- Bank question ↔ syllabus node. At most one primary per question per level (node_kind):
-- a question has one primary part, one primary subject, one primary topic, …
CREATE TABLE IF NOT EXISTS question_concepts (
    question_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_kind TEXT NOT NULL CHECK (node_kind IN ('part', 'subject', 'chapter', 'topic', 'concept')),
    role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
    origin TEXT NOT NULL CHECK (origin IN ('source', 'editorial', 'ai_suggested', 'keyword')),
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    method TEXT NOT NULL,
    model TEXT,
    review_status TEXT NOT NULL CHECK (review_status IN ('verified', 'draft', 'needs_review')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    PRIMARY KEY (question_id, node_id),
    FOREIGN KEY (question_id) REFERENCES bank_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES syllabus_nodes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_concepts_primary ON question_concepts(question_id, node_kind) WHERE role = 'primary';
CREATE INDEX IF NOT EXISTS idx_question_concepts_node ON question_concepts(node_id);
CREATE TRIGGER IF NOT EXISTS trg_question_concepts_kind_ins BEFORE INSERT ON question_concepts
WHEN NEW.node_kind IS NOT (SELECT kind FROM syllabus_nodes WHERE id = NEW.node_id)
BEGIN SELECT RAISE(ABORT, 'question_concepts.node_kind must match the node kind'); END;
CREATE TRIGGER IF NOT EXISTS trg_question_concepts_kind_upd BEFORE UPDATE ON question_concepts
WHEN NEW.node_kind IS NOT (SELECT kind FROM syllabus_nodes WHERE id = NEW.node_id)
BEGIN SELECT RAISE(ABORT, 'question_concepts.node_kind must match the node kind'); END;

-- Formulas: only with a cited source (title + exact page/section + edition). Missing units or
-- assumptions are recorded in gaps, never model-completed.
CREATE TABLE IF NOT EXISTS formulas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    expression TEXT NOT NULL,
    latex TEXT NOT NULL,
    dimensional_notes TEXT,
    assumptions TEXT NOT NULL DEFAULT '[]',
    applicability TEXT,
    exclusions TEXT NOT NULL DEFAULT '[]',
    conventions TEXT,
    equivalent_forms TEXT NOT NULL DEFAULT '[]',
    source_title TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    source_edition TEXT NOT NULL,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
    gaps TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    CHECK (length(source_title) > 0 AND length(source_locator) > 0 AND length(source_edition) > 0)
);
CREATE TABLE IF NOT EXISTS formula_symbols (
    formula_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    meaning TEXT NOT NULL,
    unit TEXT,
    dimension TEXT,
    PRIMARY KEY (formula_id, symbol),
    FOREIGN KEY (formula_id) REFERENCES formulas(id) ON DELETE CASCADE
);
-- formula_links: every relation row with a formula at either end.
CREATE VIEW IF NOT EXISTS formula_links AS
    SELECT id, from_id AS formula_id, 'out' AS direction, relation, to_type AS other_type, to_id AS other_id, origin, evidence, review_status
      FROM syllabus_relations WHERE from_type = 'formula'
    UNION ALL
    SELECT id, to_id AS formula_id, 'in' AS direction, relation, from_type AS other_type, from_id AS other_id, origin, evidence, review_status
      FROM syllabus_relations WHERE to_type = 'formula';

-- Theory: immutable source extracts kept apart from rewritten teaching notes; layered
-- (concise first, detail on demand).
CREATE TABLE IF NOT EXISTS theory_notes (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('source_extract', 'teaching_note')),
    layer TEXT NOT NULL CHECK (layer IN ('concise', 'detail')),
    body TEXT NOT NULL,
    derived_from TEXT NOT NULL DEFAULT '[]',
    diagrams TEXT NOT NULL DEFAULT '[]',
    source_title TEXT,
    source_locator TEXT,
    source_edition TEXT,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (node_id) REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
    CHECK (kind = 'teaching_note' OR (length(coalesce(source_title, '')) > 0 AND length(coalesce(source_locator, '')) > 0 AND length(coalesce(source_edition, '')) > 0))
);
CREATE INDEX IF NOT EXISTS idx_theory_notes_node ON theory_notes(node_id, layer, position);
CREATE TRIGGER IF NOT EXISTS trg_theory_source_extract_immutable BEFORE UPDATE ON theory_notes
WHEN OLD.kind = 'source_extract' AND (NEW.kind IS NOT OLD.kind OR NEW.body IS NOT OLD.body
    OR NEW.source_title IS NOT OLD.source_title OR NEW.source_locator IS NOT OLD.source_locator
    OR NEW.source_edition IS NOT OLD.source_edition OR NEW.node_id IS NOT OLD.node_id)
BEGIN SELECT RAISE(ABORT, 'source extracts are immutable; add a new extract instead'); END;

CREATE TABLE IF NOT EXISTS worked_examples (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    title TEXT NOT NULL,
    problem TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '[]',
    answer TEXT NOT NULL,
    bank_question_id TEXT,
    bank_content_fp TEXT,                -- content fingerprint of that bank question (bank/content-fp.ts)
    source_title TEXT,
    source_locator TEXT,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (node_id) REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_question_id) REFERENCES bank_questions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_worked_examples_node ON worked_examples(node_id);
