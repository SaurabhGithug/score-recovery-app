import { NextRequest, NextResponse } from "next/server";
import { SessionRepository } from "@/lib/server/repositories/session-repo";
import { UserRepository } from "@/lib/server/repositories/user-repo";
import type { FixedProfileKey } from "@/lib/server/repositories/user-repo";
import { attachSessionCookie } from "@/lib/server/session-cookie";

const FIXED_PROFILES = new Set<FixedProfileKey>(["reema", "saurabh"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const profile = typeof body.profile === "string" ? body.profile.toLowerCase() : "";
    if (!FIXED_PROFILES.has(profile as FixedProfileKey)) {
      return NextResponse.json({ error: "Choose Civil or Mechanical." }, { status: 400 });
    }
    const user = await UserRepository.findOrCreateFixedProfile(profile as FixedProfileKey);
    const session = await SessionRepository.create(user.id);
    const response = NextResponse.json({ user });
    attachSessionCookie(response, session.token);
    return response;
  } catch {
    return NextResponse.json({ error: "Could not open this profile." }, { status: 500 });
  }
}
