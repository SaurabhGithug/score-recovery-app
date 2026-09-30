import { NextRequest, NextResponse } from "next/server";
import { getSessionTokenFromRequest } from "@/lib/server/auth";
import { SessionRepository } from "@/lib/server/repositories/session-repo";
import { clearSessionCookie } from "@/lib/server/session-cookie";

export async function POST(req: NextRequest) {
  const token = getSessionTokenFromRequest(req);
  if (token) SessionRepository.delete(token);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
