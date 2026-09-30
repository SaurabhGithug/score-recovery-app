import crypto from "node:crypto";
import { getDatabase } from "../db";
import type { UserRecord } from "./user-repo";

export const SESSION_COOKIE_NAME = "score_recovery_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class SessionRepository {
  public static async create(userId: string) {
    const db = getDatabase();
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    await db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(new Date().toISOString());
    await db.prepare(
      "INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).run(tokenHash(token), userId, expiresAt, new Date().toISOString());
    return { token, expiresAt };
  }

  public static async findUser(token: string): Promise<UserRecord | null> {
    const row = await getDatabase().prepare(`
      SELECT users.id, users.name, users.normalized_name, users.created_at, users.updated_at
      FROM user_sessions
      JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?
      LIMIT 1
    `).get<UserRecord>(tokenHash(token), new Date().toISOString());
    return row ?? null;
  }

  public static async delete(token: string) {
    await getDatabase().prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  public static async deleteForUser(userId: string) {
    await getDatabase().prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
  }
}
