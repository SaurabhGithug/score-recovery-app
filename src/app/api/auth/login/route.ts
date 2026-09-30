import { NextRequest, NextResponse } from "next/server";
import { SessionRepository } from "@/lib/server/repositories/session-repo";
import { UserRepository } from "@/lib/server/repositories/user-repo";
import { attachSessionCookie } from "@/lib/server/session-cookie";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = UserRepository.authenticate(name, password);
    if (!user) {
      return NextResponse.json({ error: "Name or password is incorrect." }, { status: 401 });
    }
    const session = SessionRepository.create(user.id);
    const response = NextResponse.json({ user });
    attachSessionCookie(response, session.token);
    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign in." }, { status: 400 });
  }
}
