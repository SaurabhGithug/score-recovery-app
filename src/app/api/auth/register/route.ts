import { NextRequest, NextResponse } from "next/server";
import { validatePassword } from "@/lib/server/password";
import { SessionRepository } from "@/lib/server/repositories/session-repo";
import { UserRepository } from "@/lib/server/repositories/user-repo";
import { attachSessionCookie } from "@/lib/server/session-cookie";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name : "";
    const password = validatePassword(body.password);
    const { user, claimedLegacyProfile } = UserRepository.register(name, password);
    SessionRepository.deleteForUser(user.id);
    const session = SessionRepository.create(user.id);
    const response = NextResponse.json({ user, claimedLegacyProfile }, { status: 201 });
    attachSessionCookie(response, session.token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account.";
    const conflict = message.includes("already exists");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
