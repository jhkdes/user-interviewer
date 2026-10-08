import { NextResponse } from "next/server";
import { getPipelineDeps } from "@/job-search-study/pipeline/get-deps";
import { runSweep } from "@/job-search-study/pipeline/sweep";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The study's reports, newest first, without the heavy fields. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const reports = await getJobSearchReportRepository().listByStudyId(params.id);
  return NextResponse.json(
    reports.map((r) => ({
      id: r.id,
      interviewId: r.interviewId,
      status: r.status,
      error: r.error,
      violations: r.narrativeViolations.length + r.textViolations.length,
      releasedAt: r.releasedAt,
      emailSentAt: r.emailSentAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  );
}

/** "Process now": queues new interviews and works on one report, without waiting for the scheduler. */
export async function POST() {
  try {
    return NextResponse.json(await runSweep(getPipelineDeps()));
  } catch (error) {
    console.error("Job-search report sweep failed:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
