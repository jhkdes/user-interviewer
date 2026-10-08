import { enqueueEligibleReports, type EnqueueSummary } from "./enqueue";
import { processReport } from "./process-report";
import { STALE_AFTER_MS, type PipelineDeps } from "./types";

export interface SweepResult extends EnqueueSummary {
  /** The report that was worked on this time, with how it ended. Null when nothing was waiting. */
  processed: { reportId: string; outcome: "draft" | "failed" } | null;
}

/**
 * One pass of the worker: queue any completed interviews that have no report
 * yet, then take the oldest waiting report (or one abandoned mid-way) and
 * process it. One report per pass keeps each run within a serverless time
 * limit; run it as often as reports should be picked up.
 */
export async function runSweep(deps: PipelineDeps): Promise<SweepResult> {
  const queued = await enqueueEligibleReports(deps);

  const now = (deps.now ?? (() => new Date()))();
  const claimed = await deps.reportRepo.claimNext({
    staleBefore: new Date(now.getTime() - STALE_AFTER_MS),
  });
  if (!claimed) return { ...queued, processed: null };

  const result = await processReport(deps, claimed);
  return {
    ...queued,
    processed: { reportId: result.id, outcome: result.status === "draft" ? "draft" : "failed" },
  };
}
