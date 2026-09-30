import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { PreparationContextRepository } from "@/lib/server/repositories/preparation-context-repo";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const contexts = await PreparationContextRepository.listByUserId(user.id);
    const activeContext = await PreparationContextRepository.getActiveContext(user.id);

    return NextResponse.json({
      contexts,
      activeContext,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch preparation contexts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      type,
      examCategory,
      examId,
      examName,
      department,
      branch,
      degree,
      year,
      semester,
      setAsActive,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Context name is required" }, { status: 400 });
    }

    const context = await PreparationContextRepository.createContext({
      userId: user.id,
      name: name.trim(),
      type: type || "COMPETITIVE_EXAM",
      examCategory,
      examId,
      examName,
      department,
      branch,
      degree,
      year,
      semester,
      setAsActive: setAsActive ?? true,
    });

    return NextResponse.json({ context });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create context";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
