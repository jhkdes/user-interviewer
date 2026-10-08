import { NextResponse } from "next/server";
import { hasValidBearerToken } from "@/lib/bearer-auth";
import { getPipelineDeps } from "@/job-search-study/pipeline/get-deps";
import { runSweep } from "@/job-search-study/pipeline/sweep";

export const dynamic = "force-dynamic";
/** Three extraction runs plus the report writer take about 3 minutes, so one sweep works on one report. */
export const maxDuration = 300;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("Missing required environment variable: CRON_SECRET");
    return NextResponse.json({ error: "Sweep not configured" }, { status: 500 });
  }
  if (!hasValidBearerToken(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSweep(getPipelineDeps());
    console.log(
      `Job-search report sweep: enqueued ${result.enqueued}, skipped ${result.skipped}, ` +
        `processed ${result.processed ? `${result.processed.reportId} (${result.processed.outcome})` : "nothing"}`,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Job-search report sweep failed:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}

/** Turns completed interviews into draft reports, one report per call. Protected by `Authorization: Bearer <CRON_SECRET>`. */
export const GET = handle;
export const POST = handle;
