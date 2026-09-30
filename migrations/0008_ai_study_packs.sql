-- DECISION-004 (2026-09-30): AI study packs for follow-up questions. Applied at startup by
-- src/lib/server/db.ts runMigrations; kept here as the record of the schema change.
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
