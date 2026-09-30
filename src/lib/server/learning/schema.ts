import type { DatabaseSync } from "node:sqlite";

export function migrateLearning(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL,
      queue TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, completed_at TEXT,
      policy_version TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS learning_one_active ON learning_sessions(user_id) WHERE completed_at IS NULL;
    CREATE TABLE IF NOT EXISTS learning_items (
      session_id TEXT NOT NULL REFERENCES learning_sessions(id), position INTEGER NOT NULL,
      snapshot TEXT NOT NULL, selected TEXT, seconds REAL NOT NULL DEFAULT 0,
      assisted INTEGER NOT NULL DEFAULT 0, interrupted INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER, lesson TEXT, checked_at TEXT,
      PRIMARY KEY(session_id, position)
    );
    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES learning_sessions(id),
      position INTEGER NOT NULL, question_id TEXT NOT NULL, fingerprint TEXT NOT NULL, content_version TEXT NOT NULL,
      group_id TEXT NOT NULL, group_name TEXT NOT NULL, at TEXT NOT NULL,
      answer TEXT, correct INTEGER, assisted INTEGER NOT NULL, repeated INTEGER NOT NULL,
      seconds REAL NOT NULL, interrupted INTEGER NOT NULL, confidence INTEGER, cause TEXT,
      mode TEXT NOT NULL, due_at TEXT NOT NULL, interval_days INTEGER NOT NULL,
      UNIQUE(session_id, position)
    );
    CREATE INDEX IF NOT EXISTS learning_events_user ON learning_events(user_id, at);
    CREATE TABLE IF NOT EXISTS learning_exposures (
      user_id TEXT NOT NULL REFERENCES users(id), fingerprint TEXT NOT NULL, first_seen_at TEXT NOT NULL,
      PRIMARY KEY(user_id, fingerprint)
    );
    CREATE TABLE IF NOT EXISTS learning_ai_notes (
      cache_key TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
