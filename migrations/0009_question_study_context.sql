CREATE TABLE IF NOT EXISTS question_study_contexts (
    kind TEXT NOT NULL,
    question_id TEXT NOT NULL,
    content_fp TEXT NOT NULL,
    node_id TEXT,
    context TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (kind, question_id)
);
CREATE INDEX IF NOT EXISTS idx_study_context_node ON question_study_contexts(node_id);
CREATE TABLE IF NOT EXISTS recovery_practice (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    content_fp TEXT NOT NULL,
    correct INTEGER NOT NULL,
    seconds INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_practice_user ON recovery_practice(user_id, question_id);
