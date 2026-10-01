-- ============================================================================
-- Migration: 0010_standards.sql
-- Description: Standards study (IS/ISO/IEC 17025 first). A standard's verbatim clause text,
-- owned by one account, plus cached AI lessons per clause (labelled AI-generated in the UI).
-- ============================================================================

CREATE TABLE IF NOT EXISTS standards (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    source_name TEXT NOT NULL,
    content_fp TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (owner_user_id, code)
);

CREATE TABLE IF NOT EXISTS standard_clauses (
    standard_id TEXT NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    clause_no TEXT NOT NULL,
    parent_no TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    page INTEGER NOT NULL,
    ord INTEGER NOT NULL,
    PRIMARY KEY (standard_id, clause_no)
);

-- One lesson per clause and standard content; regenerating replaces it.
CREATE TABLE IF NOT EXISTS standard_lessons (
    standard_id TEXT NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    clause_no TEXT NOT NULL,
    content_fp TEXT NOT NULL,
    lesson TEXT NOT NULL,
    model TEXT NOT NULL,
    grounded INTEGER NOT NULL DEFAULT 0,
    sources TEXT NOT NULL DEFAULT '[]',
    search_html TEXT,
    check_result TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (standard_id, clause_no)
);

-- The second AI's verdict on a free-question answer, polled by the learner. In the database, not
-- server memory: on Vercel the poll can reach a different instance than the one that answered.
CREATE TABLE IF NOT EXISTS standard_answer_checks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Postgres only (SQLite has no RLS): like every other production table (scripts/migrate-sqlite-to-postgres.mjs),
-- RLS is on with no policies, so Supabase's public Data API can't read the standard's text. The app connects
-- as the table owner, which bypasses RLS.
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_answer_checks ENABLE ROW LEVEL SECURITY;
