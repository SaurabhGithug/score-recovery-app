import { getDatabase } from "../db";
import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "../password";

export interface UserRecord {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
}

interface UserWithPassword extends UserRecord {
  password_hash: string | null;
}

const PUBLIC_USER_COLUMNS = "id, name, normalized_name, created_at, updated_at";

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export class UserRepository {
  public static async register(rawName: string, password: string): Promise<{ user: UserRecord; claimedLegacyProfile: boolean }> {
    const trimmed = rawName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      throw new Error("Name must be between 2 and 60 characters.");
    }
    const normalized = normalizeName(trimmed);
    const db = getDatabase();

    const existing = await db.prepare(
      `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE normalized_name = ? LIMIT 1`
    ).get<UserWithPassword>(normalized);

    if (existing) {
      if (existing.password_hash) {
        throw new Error("An account with this name already exists. Sign in instead.");
      }
      throw new Error("This name belongs to an older profile. Ownership must be recovered by the local administrator; registration cannot claim it by name. Choose a different name for a new account.");
    }

    const id = `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO users (id, name, normalized_name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, trimmed, normalized, hashPassword(password), now, now);

    return {
      user: { id, name: trimmed, normalized_name: normalized, created_at: now, updated_at: now },
      claimedLegacyProfile: false,
    };
  }

  public static async authenticate(rawName: string, password: string): Promise<UserRecord | null> {
    const normalized = normalizeName(rawName);
    const existing = await getDatabase().prepare(
      `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE normalized_name = ? LIMIT 1`
    ).get<UserWithPassword>(normalized);
    if (!existing?.password_hash || !verifyPassword(password, existing.password_hash)) return null;
    return {
      id: existing.id,
      name: existing.name,
      normalized_name: existing.normalized_name,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };
  }

  public static async findById(id: string): Promise<UserRecord | null> {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`);
    const user = await stmt.get<UserRecord>(id);
    return user ?? null;
  }

  public static async listAll(): Promise<UserRecord[]> {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users ORDER BY updated_at DESC`);
    return stmt.all<UserRecord>();
  }
}
