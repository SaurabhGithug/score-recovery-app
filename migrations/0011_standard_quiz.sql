-- ============================================================================
-- Migration: 0011_standard_quiz.sql
-- Description: Timed MCQ tests on a standard (IS/ISO/IEC 17025 first). AI-written questions, each
-- bound to a verbatim proof quote from the standard, plus a learner's timed attempts.
-- ============================================================================

-- A question is shown in tests only while status = 'verified' AND clause_fp still equals the
-- fingerprint of the clause it was written from (a re-imported, changed clause hides its questions).
CREATE TABLE IF NOT EXISTS standard_questions (
    id TEXT PRIMARY KEY,
    standard_id TEXT NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    clause_no TEXT NOT NULL,
    clause_fp TEXT NOT NULL,
    stem TEXT NOT NULL,
    options TEXT NOT NULL,
    answer TEXT NOT NULL,
    explanation TEXT NOT NULL,
    option_notes TEXT NOT NULL DEFAULT '{}',
    proof_quote TEXT NOT NULL,
    proof_clause_no TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 2,
    level TEXT,
    status TEXT NOT NULL,
    generated_by TEXT NOT NULL,
    checked_by TEXT,
    check_independence TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_standard_questions_clause ON standard_questions(standard_id, clause_no);

-- One timed attempt. The deadline is fixed by the server when the attempt starts; answer keys never
-- leave the server until the attempt is submitted.
CREATE TABLE IF NOT EXISTS standard_quiz_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    standard_id TEXT NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    question_ids TEXT NOT NULL,
    limit_seconds INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    responses TEXT NOT NULL DEFAULT '{}',
    submitted_at TEXT,
    auto_submitted INTEGER NOT NULL DEFAULT 0,
    result TEXT
);
CREATE INDEX IF NOT EXISTS idx_standard_quiz_attempts_user ON standard_quiz_attempts(user_id, standard_id, started_at);

-- Postgres only (SQLite has no RLS): same convention as every other production table.
ALTER TABLE standard_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_quiz_attempts ENABLE ROW LEVEL SECURITY;
