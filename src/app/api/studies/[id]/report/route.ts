import { NextResponse } from "next/server";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getStudyReportRepository } from "@/repositories/get-study-report-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import {
  generateStudyReport,
  NoEligibleInterviewsError,
  StudyNotFoundError,
} from "@/study-report-service";

// See src/app/api/studies/[id]/route.ts for why this is required on routes
// that touch Supabase but use no dynamic Request API of their own.
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const report = await generateStudyReport(
      {
        studyRepo: getStudyRepository(),
        interviewRepo: getInterviewRepository(),
        summaryRepo: getSummaryRepository(),
        studyReportRepo: getStudyReportRepository(),
        llm: getLLMProvider(),
      },
      params.id,
    );
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    if (error instanceof StudyNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof NoEligibleInterviewsError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
