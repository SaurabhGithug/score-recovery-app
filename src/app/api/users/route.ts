import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ users: [] }, { status: 401 });
  return NextResponse.json({ users: [user] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Account creation is disabled. Choose the Civil or Mechanical profile." },
    { status: 410 }
  );
}
