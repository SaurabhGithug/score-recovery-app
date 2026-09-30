-- Product and question feedback captured from the learner experience.
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
