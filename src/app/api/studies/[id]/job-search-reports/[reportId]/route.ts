import { NextResponse } from "next/server";
import { reviewErrorResponse } from "@/job-search-study/pipeline/http-errors";
import { getReviewDeps } from "@/job-search-study/pipeline/get-deps";
import { saveEdits } from "@/job-search-study/pipeline/review-actions";
import type { ReportEdits } from "@/job-search-study/pipeline/edits";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; reportId: string } };

export async function GET(_request: Request, { params }: Params) {
  const report = await getJobSearchReportRepository().getById(params.reportId);
  if (!report || report.studyId !== params.id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}

/** Saves a reviewer's edits to a draft. */
export async function PATCH(request: Request, { params }: Params) {
  let edits: ReportEdits;
  try {
    edits = (await request.json()) as ReportEdits;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const existing = await getJobSearchReportRepository().getById(params.reportId);
    if (!existing || existing.studyId !== params.id) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json(await saveEdits(getReviewDeps(), params.reportId, edits));
  } catch (error) {
    return reviewErrorResponse(error);
  }
}
