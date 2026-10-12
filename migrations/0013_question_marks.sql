-- ============================================================================
-- Migration: 0013_question_marks.sql
-- Description: The learner's own marks on questions they have answered (bank past papers and
-- Made Easy tests): Revise, Important or Super important, with an optional note. One mark per
-- question per learner; clearing a mark deletes its row. Private per user.
-- Types: src/lib/marks.ts. Server: src/lib/server/marks.ts. SQLite twin: src/lib/server/sqlite-db.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_marks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('bank', 'made_easy')),
    source_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('revise', 'important', 'super_important')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, source_kind, source_id)
);
CREATE INDEX IF NOT EXISTS idx_question_marks_user ON question_marks(user_id, level, updated_at);

-- Postgres only (SQLite has no RLS): same convention as every other production table.
ALTER TABLE question_marks ENABLE ROW LEVEL SECURITY;
