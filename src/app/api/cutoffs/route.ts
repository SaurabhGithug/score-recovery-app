import { NextRequest, NextResponse } from "next/server";
import { HistoricalCutoffRepository } from "@/lib/server/repositories/historical-cutoff-repo";

export async function GET(req: NextRequest) {
  try {
    const examId = req.nextUrl.searchParams.get("examId") || "ssc-je";
    const branch = req.nextUrl.searchParams.get("branch") || null;
    const category = req.nextUrl.searchParams.get("category") || "UR";
    const stage = req.nextUrl.searchParams.get("stage") || "PAPER_I";

    const cutoffs = await HistoricalCutoffRepository.findComparable({
      examDefinitionId: examId,
      branch,
      category,
      stage,
    });

    return NextResponse.json({ cutoffs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch historical cutoffs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
