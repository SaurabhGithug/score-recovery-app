-- ============================================================================
-- Migration: 0014_activity_events.sql
-- Description: What each learner does in the app, one row per meaningful action (pages opened,
-- answers looked at, practice answers, AI questions, marks, past-paper attempts, sign-ins).
-- Append-only. Private per user; never sent anywhere. `client` is a short browser/device label;
-- 'claude-app' marks traffic from Claude's own browser (testing), which reports leave out.
-- Types: src/lib/activity.ts. Server: src/lib/server/activity.ts. SQLite twin: src/lib/server/sqlite-db.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    type TEXT NOT NULL,
    target_kind TEXT,
    target_id TEXT,
    detail TEXT NOT NULL DEFAULT '{}',
    client TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events(user_id, at);
CREATE INDEX IF NOT EXISTS idx_activity_events_target ON activity_events(user_id, target_kind, target_id);

-- Postgres only (SQLite has no RLS): same convention as every other production table.
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
