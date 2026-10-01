import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Account creation is disabled. Choose the Reema or Saurabh profile." },
    { status: 410 }
  );
}
