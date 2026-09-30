-- ============================================================================
-- Migration: 0003_preparation_context.sql
-- Description: Preparation Context layer (User -> PreparationContext -> Documents/Attempts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS preparation_contexts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'COMPETITIVE_EXAM', -- COMPETITIVE_EXAM | ACADEMIC | BOTH
    exam_category VARCHAR(64),
    exam_id VARCHAR(64),
    exam_name VARCHAR(255),
    department VARCHAR(128),
    branch VARCHAR(64),
    degree VARCHAR(64),
    year INTEGER,
    semester INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prep_contexts_user ON preparation_contexts(user_id, is_active);

-- Add preparation_context_id to study_documents if not exists
-- (Handled in SQLite migrations safely)
