import { NextResponse } from "next/server";
import { appBaseUrl, getReviewDeps } from "@/job-search-study/pipeline/get-deps";
import { reviewErrorResponse } from "@/job-search-study/pipeline/http-errors";
import {
  regenerateNarrative,
  releaseReport,
  requeueFromScratch,
  resendReportEmail,
  withdrawReport,
} from "@/job-search-study/pipeline/review-actions";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";
/** Regenerating the narrative calls the model. */
export const maxDuration = 120;

type Params = { params: { id: string; reportId: string; action: string } };

/** Reviewer actions: regenerate, requeue, release, resend-email, withdraw. */
export async function POST(request: Request, { params }: Params) {
  const existing = await getJobSearchReportRepository().getById(params.reportId);
  if (!existing || existing.studyId !== params.id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const deps = getReviewDeps();
  try {
    switch (params.action) {
      case "regenerate":
        return NextResponse.json(await regenerateNarrative(deps, params.reportId));
      case "requeue":
        return NextResponse.json(await requeueFromScratch(deps, params.reportId));
      case "withdraw":
        return NextResponse.json(await withdrawReport(deps, params.reportId));
      case "resend-email":
        return NextResponse.json(
          await resendReportEmail(deps, params.reportId, appBaseUrl(request)),
        );
      case "release": {
        const body = (await request.json().catch(() => ({}))) as {
          acknowledgeViolations?: boolean;
        };
        const {
          data: { user },
        } = await createServerComponentSupabaseClient().auth.getUser();
        return NextResponse.json(
          await releaseReport(deps, params.reportId, {
            releasedBy: user?.email ?? "unknown",
            baseUrl: appBaseUrl(request),
            acknowledgeViolations: body.acknowledgeViolations === true,
          }),
        );
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${params.action}` }, { status: 404 });
    }
  } catch (error) {
    return reviewErrorResponse(error);
  }
}
