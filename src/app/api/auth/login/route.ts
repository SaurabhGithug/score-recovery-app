import { NextRequest, NextResponse } from "next/server";
import { SessionRepository } from "@/lib/server/repositories/session-repo";
import { UserRepository } from "@/lib/server/repositories/user-repo";
import { attachSessionCookie } from "@/lib/server/session-cookie";
import { getDatabase } from "@/lib/server/db";
import crypto from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

async function loginBucket(req: NextRequest, name: string): Promise<{ key: string; blocked: boolean }> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = crypto.createHash("sha256").update(`${ip}\0${name.trim().toLowerCase()}`).digest("hex");
  const now = Date.now();
  const row = await getDatabase().prepare("SELECT count, reset_at FROM auth_rate_limits WHERE bucket = ?").get<{ count: number | string; reset_at: number | string }>(key);
  if (!row || Number(row.reset_at) <= now) return { key, blocked: false };
  return { key, blocked: Number(row.count) >= MAX_FAILURES };
}

async function recordFailure(key: string): Promise<void> {
  const now = Date.now();
  await getDatabase().prepare(`INSERT INTO auth_rate_limits (bucket, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN auth_rate_limits.reset_at <= ? THEN 1 ELSE auth_rate_limits.count + 1 END,
      reset_at = CASE WHEN auth_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE auth_rate_limits.reset_at END`
  ).run(key, now + WINDOW_MS, now, now);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name : "";
    const password = typeof body.password === "string" ? body.password : "";
    const limit = await loginBucket(req, name);
    if (limit.blocked) return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
    const user = await UserRepository.authenticate(name, password);
    if (!user) {
      await recordFailure(limit.key);
      return NextResponse.json({ error: "Name or password is incorrect." }, { status: 401 });
    }
    await getDatabase().prepare("DELETE FROM auth_rate_limits WHERE bucket = ?").run(limit.key);
    const session = await SessionRepository.create(user.id);
    const response = NextResponse.json({ user });
    attachSessionCookie(response, session.token);
    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign in." }, { status: 400 });
  }
}
