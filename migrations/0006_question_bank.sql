-- ============================================================================
-- Migration: 0006_question_bank.sql
-- Description: Shared question bank (DECISION-002) for SSC JE Civil previous-year papers and
-- provider mock tests. Documentation copy: the live DDL runs from src/lib/server/db.ts.
-- Content is shared by all learners; attempts are per learner. A question has no answer column
-- on purpose: keys are evidence rows, and src/lib/bank/answer-key.ts (resolveAnswerKey) decides
-- which one, if any, is scored.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_papers (
    id VARCHAR(128) PRIMARY KEY,
    kind VARCHAR(16) NOT NULL,              -- pyp | mock
    exam VARCHAR(32) NOT NULL,              -- SSC_JE
    branch VARCHAR(32) NOT NULL,            -- CIVIL
    paper VARCHAR(8) NOT NULL,              -- P1 | P2
    cycle_year INTEGER,                     -- SSC cycle name, not the year it was sat
    exam_date DATE,
    shift VARCHAR(32),                      -- "09:00-11:00"
    title TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    duration_minutes INTEGER,
    fidelity VARCHAR(32) NOT NULL,          -- official_paper | provider_mock
    publisher TEXT NOT NULL,
    source_url TEXT,
    source_file TEXT,
    source_sha256 VARCHAR(64),
    captured_on DATE NOT NULL,
    rights_note TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',   -- languages, contributing source files, match methods, unmatched items
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bank_papers_lookup ON bank_papers(exam, branch, kind, paper, exam_date);

CREATE TABLE IF NOT EXISTS bank_questions (
    id VARCHAR(160) PRIMARY KEY,
    paper_id VARCHAR(128) NOT NULL REFERENCES bank_papers(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    section TEXT NOT NULL,
    stem TEXT NOT NULL,
    options JSONB NOT NULL,                 -- [{id, text}]
    has_visual BOOLEAN NOT NULL DEFAULT FALSE,
    visual_path TEXT,                       -- relative to data/storage/pyp-crops
    source_page INTEGER,
    source_solution TEXT,                   -- provider's own worked solution (never shown before submit)
    topic TEXT,
    topic_evidence VARCHAR(32) NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}',   -- ssc ids, text_quality, translations, per-file sources
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (paper_id, position)
);

-- user_id is '' for evidence that applies to everyone (SSC keys, publisher keys, AI solves) and a
-- learner's id for that learner's own dispute resolutions (authority human_review), which must
-- never change the key another learner sees.
CREATE TABLE IF NOT EXISTS bank_answer_evidence (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(160) NOT NULL REFERENCES bank_questions(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL DEFAULT '',
    authority VARCHAR(32) NOT NULL,         -- ssc_final | ssc_response_sheet | testbook_portal | publisher_key | human_review | ai_blind_solve
    source_group VARCHAR(64) NOT NULL,      -- independence is counted per group
    source_label TEXT NOT NULL,
    answer VARCHAR(64),
    dropped BOOLEAN NOT NULL DEFAULT FALSE,
    detail JSONB NOT NULL DEFAULT '{}',
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (question_id, authority, source_label, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_evidence_question ON bank_answer_evidence(question_id, user_id);

-- AI teaching notes. locked_answer records the key the note was written against; a note whose
-- locked_answer no longer matches the resolved key is stale and must not be shown.
CREATE TABLE IF NOT EXISTS bank_explanations (
    question_id VARCHAR(160) PRIMARY KEY REFERENCES bank_questions(id) ON DELETE CASCADE,
    locked_answer VARCHAR(64) NOT NULL,
    note TEXT NOT NULL,                     -- JSON: BankExplanation teaching fields
    model VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    content_fp VARCHAR(64) NOT NULL DEFAULT ''  -- the question text the note was written for (bank/content-fp.ts)
);

CREATE TABLE IF NOT EXISTS bank_attempts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id VARCHAR(128) NOT NULL REFERENCES bank_papers(id) ON DELETE CASCADE,
    mode VARCHAR(16) NOT NULL DEFAULT 'full',   -- full | section | practice
    section TEXT,                               -- set in section mode
    duration_seconds INTEGER,                   -- null = untimed practice
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE,
    responses JSONB NOT NULL DEFAULT '{}',      -- BankResponses
    checked JSONB NOT NULL DEFAULT '{}',        -- practice: {questionId: locked answer}
    result JSONB,                               -- {result: BankAttemptResult, keySnapshot: {questionId: {status, answer, fp}}}
    content_fps JSONB NOT NULL DEFAULT '{}'     -- {questionId: content fingerprint} at attempt start (bank/content-fp.ts)
);
CREATE INDEX IF NOT EXISTS idx_bank_attempts_user ON bank_attempts(user_id, paper_id);
