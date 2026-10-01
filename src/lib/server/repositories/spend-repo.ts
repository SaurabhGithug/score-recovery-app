import { getDatabase } from "../db";
import crypto from "node:crypto";

/**
 * Postgres advisory-lock key for the spend ledger (any constant; it only has to be the same in
 * every process). Held for the length of one reserve() transaction.
 */
export const SPEND_LOCK_KEY = 1702503017;

/** Ledger of billed LLM calls, used for the server-wide daily spending limit. */
export class SpendRepository {
  public static async add(entry: { userId: string; documentId: string | null; model: string; costUsd: number }): Promise<void> {
    if (!(entry.costUsd > 0)) return;
    const db = getDatabase();
    await db.prepare(
      "INSERT INTO llm_spend (id, user_id, document_id, model, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      `spend_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      entry.userId,
      entry.documentId,
      entry.model,
      entry.costUsd,
      new Date().toISOString()
    );
  }

  /**
   * Atomically reserves `usd` against the rolling limit, serialised across every process and
   * server instance: on SQLite by the BEGIN IMMEDIATE transaction (one writer at a time); on
   * Postgres, where a transaction is READ COMMITTED and two of them could otherwise both read the
   * same total and both pass the cap, by a transaction-scoped advisory lock taken first and
   * released at commit. Refuses when spend since `since` plus `usd` would exceed `capUsd`, else
   * records a ledger row for the full `usd`. Returns that row's id, or
   * null when refused. Settle it to the real cost with settle() once the call returns; a crash
   * leaves the worst case recorded, which errs on the side of the limit.
   */
  public static async reserve(entry: { userId: string; model: string; usd: number; capUsd: number; since: Date }): Promise<string | null> {
    const db = getDatabase();
    const id = `spend_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    return db.transaction(async () => {
      if (db.dialect === "postgres") await db.prepare("SELECT pg_advisory_xact_lock(?)").get(SPEND_LOCK_KEY);
      if ((await SpendRepository.totalSince(entry.since)) + entry.usd > entry.capUsd) {
        return null;
      }
      await db.prepare(
        "INSERT INTO llm_spend (id, user_id, document_id, model, cost_usd, created_at) VALUES (?, ?, NULL, ?, ?, ?)"
      ).run(id, entry.userId, entry.model, Math.max(0, entry.usd), new Date().toISOString());
      return id;
    });
  }

  /** Replaces a reservation with what the call actually billed. */
  public static async settle(id: string, usd: number): Promise<void> {
    await getDatabase().prepare("UPDATE llm_spend SET cost_usd = ? WHERE id = ?").run(Math.max(0, usd), id);
  }

  /** Total spend across all users since the given time. */
  public static async totalSince(since: Date): Promise<number> {
    const db = getDatabase();
    const row = await db
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_spend WHERE created_at >= ?")
      .get<{ total: number | string }>(since.toISOString());
    return Number(row?.total ?? 0);
  }
}
