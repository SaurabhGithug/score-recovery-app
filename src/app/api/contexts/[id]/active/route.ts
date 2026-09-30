import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { PreparationContextRepository } from "@/lib/server/repositories/preparation-context-repo";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id } = await props.params;
    const success = await PreparationContextRepository.setActiveContext(user.id, id);

    if (!success) {
      return NextResponse.json({ error: "Preparation context not found" }, { status: 404 });
    }

    const activeContext = await PreparationContextRepository.getActiveContext(user.id);
    return NextResponse.json({ success: true, activeContext });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to activate context";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
