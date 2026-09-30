import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { ExamProfileRepository } from "@/lib/server/repositories/exam-profile-repo";
import { PreparationContextRepository } from "@/lib/server/repositories/preparation-context-repo";
import { ExamProfileValidationError } from "@/lib/ssc-je/eligibility";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id: contextId } = await props.params;
    const profile = await ExamProfileRepository.findByContextId(contextId, user.id);

    return NextResponse.json({ profile: profile ? { ...profile, target_posts: JSON.parse(profile.target_posts) } : null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch exam profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "User session required" }, { status: 401 });
    }

    const { id: contextId } = await props.params;
    const context = await PreparationContextRepository.findById(contextId, user.id);
    if (!context) {
      return NextResponse.json({ error: "Preparation context not found" }, { status: 404 });
    }

    const body = await req.json();
    const category = body.category || "UR";
    const dateOfBirth = body.dateOfBirth === "" ? null : body.dateOfBirth;
    const pwbdStatus = Boolean(body.pwbdStatus);
    const pwbdType = body.pwbdType || null;
    const exServicemanStatus = Boolean(body.exServicemanStatus);
    const targetPosts = body.targetPosts;

    const profile = await ExamProfileRepository.upsert({
      userId: user.id,
      preparationContextId: contextId,
      category,
      dateOfBirth,
      gender: body.gender,
      pwbdStatus,
      pwbdType,
      exServicemanStatus,
      targetPosts,
    });

    return NextResponse.json({ profile: { ...profile, target_posts: JSON.parse(profile.target_posts) } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save exam profile";
    return NextResponse.json({ error: message }, { status: err instanceof ExamProfileValidationError || err instanceof SyntaxError ? 400 : 500 });
  }
}
