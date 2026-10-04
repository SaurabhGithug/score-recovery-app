import { NextRequest, NextResponse } from "next/server";
import { SessionRepository } from "@/lib/server/repositories/session-repo";
import { UserRepository, isFixedProfileKey } from "@/lib/server/repositories/user-repo";
import { attachSessionCookie } from "@/lib/server/session-cookie";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const profile = typeof body.profile === "string" ? body.profile.toLowerCase() : "";
    if (!isFixedProfileKey(profile)) {
      return NextResponse.json({ error: "Choose Civil, Saurabh Civil or Mechanical." }, { status: 400 });
    }
    const user = await UserRepository.findOrCreateFixedProfile(profile);
    const session = await SessionRepository.create(user.id);
    const response = NextResponse.json({ user });
    attachSessionCookie(response, session.token);
    return response;
  } catch {
    return NextResponse.json({ error: "Could not open this profile." }, { status: 500 });
  }
}
