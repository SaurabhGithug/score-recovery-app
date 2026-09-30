import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { PreparationContextRepository } from "@/lib/server/repositories/preparation-context-repo";
import { ExamProfileRepository } from "@/lib/server/repositories/exam-profile-repo";
import { TargetScoreRepository } from "@/lib/server/repositories/target-score-repo";
import { calculatePersonalTarget } from "@/lib/target/target-calculator";
import { generateQuestionScenarios } from "@/lib/target/strategy-engine";

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
    const context = await PreparationContextRepository.findById(contextId, user.id);
    if (!context) {
      return NextResponse.json({ error: "Preparation context not found" }, { status: 404 });
    }

    // Retrieve or default exam profile
    const profile = await ExamProfileRepository.findByContextId(contextId, user.id);
    const category = profile?.category || "UR";

    const examId = context.exam_id || "ssc-je";
    const branch = context.branch || "civil";

    // Calculate personal target with full explanation
    const targetResult = await calculatePersonalTarget({
      examDefinitionId: examId,
      branch,
      category,
      stage: "PAPER_I",
    });

    // Generate question strategy scenarios
    const scenarios = generateQuestionScenarios(
      targetResult.planningTargetScore,
      targetResult.totalMarks,
      1.0,
      0.25
    );

    // Save target record in DB for provenance
    await TargetScoreRepository.upsert({
      userId: user.id,
      preparationContextId: contextId,
      score: targetResult.planningTargetScore,
      officialQualifyingMark: targetResult.officialMinimumScore,
      safetyMargin: targetResult.safetyMargin,
      evidence: targetResult.explanation,
      historicalYears: targetResult.historicalYears,
    });

    return NextResponse.json({
      target: targetResult,
      scenarios,
      profile,
      context,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compute target score";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
