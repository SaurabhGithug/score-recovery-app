import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { migrateLearning } from "./learning/schema";

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  // Server-only override for isolated QA/deployments; never taken from a request.
  const dbDir = process.env.SCORE_RECOVERY_DATA_DIR
    ? path.resolve(process.env.SCORE_RECOVERY_DATA_DIR)
    : path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "score_recovery.db");
  const db = new DatabaseSync(dbPath);

  // Enable foreign keys and WAL mode for reliability and performance
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  // Wait for another process's write (e.g. the CLI importer or an explain batch) instead of
  // failing at once with SQLITE_BUSY: spend reservations use BEGIN IMMEDIATE.
  db.exec("PRAGMA busy_timeout = 5000;");

  // Run foundation migrations
  runMigrations(db);
  migrateLearning(db);

  dbInstance = db;
  return db;
}

function runMigrations(db: DatabaseSync) {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        password_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_users_normalized_name ON users(normalized_name);

    CREATE TABLE IF NOT EXISTS user_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS preparation_contexts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'COMPETITIVE_EXAM',
        exam_category TEXT,
        exam_id TEXT,
        exam_name TEXT,
        department TEXT,
        branch TEXT,
        degree TEXT,
        year INTEGER,
        semester INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_prep_contexts_user ON preparation_contexts(user_id, is_active);

    CREATE TABLE IF NOT EXISTS study_documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        preparation_context_id TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        storage_path TEXT,
        file_size_bytes INTEGER DEFAULT 0,
        document_type TEXT DEFAULT 'UNKNOWN',
        extraction_status TEXT NOT NULL DEFAULT 'UPLOADED',
        status_message TEXT,
        parser_used TEXT,
        page_count INTEGER DEFAULT 0,
        questions_count INTEGER DEFAULT 0,
        ready_questions_count INTEGER DEFAULT 0,
        review_questions_count INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (preparation_context_id) REFERENCES preparation_contexts(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_study_documents_user ON study_documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_study_documents_context ON study_documents(preparation_context_id);
    CREATE INDEX IF NOT EXISTS idx_study_documents_status ON study_documents(extraction_status);

    CREATE TABLE IF NOT EXISTS document_pages (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        raw_text TEXT,
        markdown TEXT,
        parser TEXT,
        confidence REAL DEFAULT 1.0,
        image_path TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (document_id) REFERENCES study_documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_document_pages_doc ON document_pages(document_id, page_number);

    CREATE TABLE IF NOT EXISTS imported_questions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        preparation_context_id TEXT,
        question_number INTEGER,
        question_text TEXT NOT NULL,
        question_type TEXT NOT NULL DEFAULT 'MCQ',
        options TEXT NOT NULL DEFAULT '[]',
        correct_answer TEXT,
        explanation TEXT,
        subject TEXT,
        topic TEXT,
        difficulty INTEGER DEFAULT 2,
        source_page INTEGER NOT NULL DEFAULT 1,
        source_bounding_box TEXT,
        source_image_crop TEXT,
        source_type TEXT NOT NULL DEFAULT 'EXTRACTED',
        extraction_confidence REAL DEFAULT 1.0,
        verification_status TEXT NOT NULL DEFAULT 'AUTO_ACCEPTED',
        review_reason TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (document_id) REFERENCES study_documents(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (preparation_context_id) REFERENCES preparation_contexts(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_imported_questions_user_doc ON imported_questions(user_id, document_id);
    CREATE INDEX IF NOT EXISTS idx_imported_questions_context ON imported_questions(preparation_context_id);
    CREATE INDEX IF NOT EXISTS idx_imported_questions_status ON imported_questions(verification_status);

    CREATE TABLE IF NOT EXISTS exam_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        preparation_context_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'UR',
        date_of_birth TEXT,
        pwbd_status INTEGER DEFAULT 0,
        pwbd_type TEXT,
        ex_serviceman_status INTEGER DEFAULT 0,
        target_posts TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (preparation_context_id) REFERENCES preparation_contexts(id) ON DELETE CASCADE,
        UNIQUE (user_id, preparation_context_id)
    );
    CREATE INDEX IF NOT EXISTS idx_exam_profiles_context ON exam_profiles(preparation_context_id);

    CREATE TABLE IF NOT EXISTS historical_cutoffs (
        id TEXT PRIMARY KEY,
        exam_definition_id TEXT NOT NULL,
        exam_year INTEGER NOT NULL,
        branch TEXT,
        category TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT 'PAPER_I',
        cutoff_score REAL NOT NULL,
        total_marks REAL NOT NULL DEFAULT 200,
        shortlisted_count INTEGER,
        vacancies INTEGER,
        normalization_applied INTEGER DEFAULT 1,
        official_source_url TEXT NOT NULL,
        official_source_title TEXT,
        source_published_at TEXT,
        verified INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_historical_cutoffs_lookup ON historical_cutoffs(exam_definition_id, branch, category, stage);

    CREATE TABLE IF NOT EXISTS target_scores (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        preparation_context_id TEXT NOT NULL,
        score REAL NOT NULL,
        method_version TEXT NOT NULL DEFAULT 'v1_historical_trend',
        official_qualifying_mark REAL NOT NULL,
        safety_margin REAL NOT NULL DEFAULT 8.0,
        evidence TEXT NOT NULL DEFAULT '{}',
        historical_years TEXT NOT NULL DEFAULT '[]',
        calculated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (preparation_context_id) REFERENCES preparation_contexts(id) ON DELETE CASCADE,
        UNIQUE (user_id, preparation_context_id)
    );
    CREATE INDEX IF NOT EXISTS idx_target_scores_context ON target_scores(preparation_context_id);

    CREATE TABLE IF NOT EXISTS product_feedback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        preparation_context_id TEXT,
        document_id TEXT,
        question_id TEXT,
        category TEXT NOT NULL,
        rating INTEGER,
        message TEXT NOT NULL,
        placement TEXT NOT NULL DEFAULT 'unknown',
        metadata TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (preparation_context_id) REFERENCES preparation_contexts(id) ON DELETE SET NULL,
        FOREIGN KEY (document_id) REFERENCES study_documents(id) ON DELETE SET NULL,
        FOREIGN KEY (question_id) REFERENCES imported_questions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_product_feedback_status ON product_feedback(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_product_feedback_user ON product_feedback(user_id, created_at);

    -- Every billed LLM call. No foreign keys on purpose: deleting a document or user must not
    -- erase spend history (that would reset the daily spending limit).
    CREATE TABLE IF NOT EXISTS llm_spend (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        document_id TEXT,
        model TEXT NOT NULL,
        cost_usd REAL NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_spend_created ON llm_spend(created_at);

    -- Shared question bank (DECISION-002): previous-year papers and provider mock tests.
    -- Content is shared by all learners; attempts are per learner. A question has no answer
    -- column on purpose: keys are evidence rows, and src/lib/bank/answer-key.ts decides which
    -- one (if any) is scored.
    CREATE TABLE IF NOT EXISTS bank_papers (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        exam TEXT NOT NULL,
        branch TEXT NOT NULL,
        paper TEXT NOT NULL,
        cycle_year INTEGER,
        exam_date TEXT,
        shift TEXT,
        title TEXT NOT NULL,
        question_count INTEGER NOT NULL,
        duration_minutes INTEGER,
        fidelity TEXT NOT NULL,
        publisher TEXT NOT NULL,
        source_url TEXT,
        source_file TEXT,
        source_sha256 TEXT,
        captured_on TEXT NOT NULL,
        rights_note TEXT NOT NULL,
        -- '' = shared with every learner (e.g. SSC papers). A learner's id = private to that
        -- learner (e.g. a Testbook test captured from their own account): nobody else may see
        -- it, and its key evidence is scoped to that learner too.
        owner_user_id TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_bank_papers_lookup ON bank_papers(exam, branch, kind, paper, exam_date);

    CREATE TABLE IF NOT EXISTS bank_questions (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        section TEXT NOT NULL,
        stem TEXT NOT NULL,
        options TEXT NOT NULL,
        has_visual INTEGER NOT NULL DEFAULT 0,
        visual_path TEXT,
        source_page INTEGER,
        source_solution TEXT,
        topic TEXT,
        topic_evidence TEXT NOT NULL DEFAULT 'pending',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (paper_id) REFERENCES bank_papers(id) ON DELETE CASCADE,
        UNIQUE (paper_id, position)
    );

    -- user_id is '' for evidence that applies to everyone (SSC keys, publisher keys, AI solves)
    -- and a learner's id for that learner's own dispute resolutions (authority human_review),
    -- which must never change the key another learner sees.
    CREATE TABLE IF NOT EXISTS bank_answer_evidence (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        authority TEXT NOT NULL,
        source_group TEXT NOT NULL,
        source_label TEXT NOT NULL,
        answer TEXT,
        dropped INTEGER NOT NULL DEFAULT 0,
        detail TEXT NOT NULL DEFAULT '{}',
        observed_at TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES bank_questions(id) ON DELETE CASCADE,
        UNIQUE (question_id, authority, source_label, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_bank_evidence_question ON bank_answer_evidence(question_id, user_id);

    -- AI teaching notes. locked_answer records the key the note was written against and
    -- content_fp the question text it was written for (bank/content-fp.ts); a note whose
    -- locked_answer or content_fp no longer matches is stale and must not be shown.
    CREATE TABLE IF NOT EXISTS bank_explanations (
        question_id TEXT PRIMARY KEY,
        locked_answer TEXT NOT NULL,
        note TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        content_fp TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (question_id) REFERENCES bank_questions(id) ON DELETE CASCADE
    );

    -- AI study packs (DECISION-004): syllabus topic, scope, exam points and cross-checked practice
    -- questions for one question, labelled AI-generated in the UI. Keyed by the content the pack was
    -- made for, so a re-imported question gets a new pack. kind is 'bank' or 'made_easy'.
    CREATE TABLE IF NOT EXISTS ai_study_packs (
        kind TEXT NOT NULL,
        question_id TEXT NOT NULL,
        content_fp TEXT NOT NULL,
        pack TEXT NOT NULL,
        model TEXT NOT NULL,
        checker TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (kind, question_id, content_fp)
    );

    CREATE TABLE IF NOT EXISTS bank_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'full',
        section TEXT,
        duration_seconds INTEGER,
        started_at TEXT NOT NULL,
        submitted_at TEXT,
        responses TEXT NOT NULL DEFAULT '{}',
        -- practice mode: {questionId: answer} for questions whose key was revealed; locked.
        checked TEXT NOT NULL DEFAULT '{}',
        -- BankAttemptResult plus the key snapshot it was scored against.
        result TEXT,
        -- {questionId: content fingerprint} of every in-scope question when the attempt started
        -- (bank/content-fp.ts): answers bind to that content, never to whatever the id holds later.
        content_fps TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (paper_id) REFERENCES bank_papers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bank_attempts_user ON bank_attempts(user_id, paper_id);
  `;

  db.exec(schemaSql);
  runSyllabusMigrations(db);

  const profileCols = db.prepare("PRAGMA table_info(exam_profiles)").all() as unknown as { name: string }[];
  if (!profileCols.some(c => c.name === "gender")) db.exec("ALTER TABLE exam_profiles ADD COLUMN gender TEXT;");

  // Safely alter existing tables if preparation_context_id column is missing
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as unknown as { name: string }[];
    if (!userCols.some((c) => c.name === "password_hash")) {
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
    }
    const docCols = db.prepare("PRAGMA table_info(study_documents)").all() as unknown as { name: string }[];
    if (!docCols.some((c) => c.name === "preparation_context_id")) {
      db.exec("ALTER TABLE study_documents ADD COLUMN preparation_context_id TEXT;");
    }
    const qCols = db.prepare("PRAGMA table_info(imported_questions)").all() as unknown as { name: string }[];
    if (!qCols.some((c) => c.name === "preparation_context_id")) {
      db.exec("ALTER TABLE imported_questions ADD COLUMN preparation_context_id TEXT;");
    }
  } catch {
    // column already exists
  }

  // bank_attempts gained mode/section/duration_seconds/checked after the table first shipped.
  const attemptCols = db.prepare("PRAGMA table_info(bank_attempts)").all() as unknown as { name: string }[];
  const attemptAdds: [string, string][] = [
    ["mode", "mode TEXT NOT NULL DEFAULT 'full'"],
    ["section", "section TEXT"],
    ["duration_seconds", "duration_seconds INTEGER"],
    ["checked", "checked TEXT NOT NULL DEFAULT '{}'"],
    ["content_fps", "content_fps TEXT NOT NULL DEFAULT '{}'"],
  ];
  for (const [name, ddl] of attemptAdds) {
    if (!attemptCols.some((c) => c.name === name)) db.exec(`ALTER TABLE bank_attempts ADD COLUMN ${ddl};`);
  }

  // bank_papers gained owner_user_id (private learner imports) after the table first shipped.
  const paperCols = db.prepare("PRAGMA table_info(bank_papers)").all() as unknown as { name: string }[];
  if (!paperCols.some((c) => c.name === "owner_user_id")) {
    db.exec("ALTER TABLE bank_papers ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT '';");
  }

  // bank_explanations gained content_fp. Existing notes get '' and so never match any content:
  // they are treated as stale and regenerated, never shown against text they were not written for.
  const explanationCols = db.prepare("PRAGMA table_info(bank_explanations)").all() as unknown as { name: string }[];
  if (!explanationCols.some((c) => c.name === "content_fp")) {
    db.exec("ALTER TABLE bank_explanations ADD COLUMN content_fp TEXT NOT NULL DEFAULT '';");
  }
}

// ============================================================================================
// Syllabus hierarchy (learner spec §3) — additive only. Documentation copy:
// migrations/0007_syllabus_hierarchy.sql. Owned by src/lib/syllabus/** and
// src/lib/server/repositories/syllabus-repo.ts. Exam → cycle → paper → part → subject → chapter
// → topic → concept, with provenance (official vs editorial) on every node and link.
// ============================================================================================
const SYLLABUS_SCHEMA_SQL = `
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
        -- content fingerprint of the bank question it was written for (bank/content-fp.ts)
        bank_content_fp TEXT,
        source_title TEXT,
        source_locator TEXT,
        verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        FOREIGN KEY (node_id) REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (bank_question_id) REFERENCES bank_questions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_worked_examples_node ON worked_examples(node_id);
`;

function runSyllabusMigrations(db: DatabaseSync) {
  db.exec(SYLLABUS_SCHEMA_SQL);
  // worked_examples gained bank_content_fp (a bank-linked example is valid only for that content).
  const cols = db.prepare("PRAGMA table_info(worked_examples)").all() as unknown as { name: string }[];
  if (!cols.some((c) => c.name === "bank_content_fp")) db.exec("ALTER TABLE worked_examples ADD COLUMN bank_content_fp TEXT;");
}
