-- ============================================================================
-- Migration: 0012_standard_notes.sql
-- Description: The learner's own notes on a standard: a "learn later" list of topics picked while
-- reading, and saved explanations (snapshots of AI lessons/answers or passages). Private per user.
-- Types: src/lib/standards/notes-types.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS standard_saved_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    standard_id TEXT NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    clause_no TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    question TEXT,
    body TEXT NOT NULL,
    my_note TEXT,
    ai_generated INTEGER NOT NULL DEFAULT 1,
    model TEXT,
    sources TEXT NOT NULL DEFAULT '[]',
    check_result TEXT,
    body_hash TEXT NOT NULL,
    content_sathi_sent_at TEXT,
    content_sathi_idea_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_standard_saved_notes_user ON standard_saved_notes(user_id, standard_id, created_at);

CREATE TABLE IF NOT EXISTS standard_learn_later (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    standard_id TEXT NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    clause_no TEXT,
    text TEXT NOT NULL,
    text_key TEXT NOT NULL,
    context TEXT,
    source TEXT NOT NULL,
    source_note_id TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    explanation_note_id TEXT,
    created_at TEXT NOT NULL,
    done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_standard_learn_later_user ON standard_learn_later(user_id, standard_id, status, created_at);

-- Postgres only (SQLite has no RLS): same convention as every other production table.
ALTER TABLE standard_saved_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_learn_later ENABLE ROW LEVEL SECURITY;
