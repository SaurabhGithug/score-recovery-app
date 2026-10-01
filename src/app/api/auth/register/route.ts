import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Account creation is disabled. Choose the Civil or Mechanical profile." },
    { status: 410 }
  );
}
