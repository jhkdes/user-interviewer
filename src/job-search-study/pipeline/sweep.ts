import { autoReleaseBlockers } from "./auto-release";
import { enqueueEligibleReports, type EnqueueSummary } from "./enqueue";
import { processReport } from "./process-report";
import { STALE_AFTER_MS, type PipelineDeps } from "./types";

/** What happened when the sweep considered releasing a fresh draft without a reviewer. */
export interface AutoReleaseOutcome {
  reportId: string;
  /** released: sent. email_failed: released but the email did not go out. held: left as a draft for a reviewer. */
  outcome: "released" | "email_failed" | "held";
  /** Why it was held, or what went wrong with the email. */
  reasons: string[];
}

export interface SweepResult extends EnqueueSummary {
  /** The report that was worked on this time, with how it ended. Null when nothing was waiting. */
  processed: { reportId: string; outcome: "draft" | "failed" } | null;
  /** Present only when automatic release was considered for the report just processed. */
  autoRelease?: AutoReleaseOutcome;
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
  const outcome = {
    ...queued,
    processed: { reportId: result.id, outcome: result.status === "draft" ? "draft" : "failed" },
  } satisfies SweepResult;

  if (result.status !== "draft" || !deps.autoRelease) return outcome;

  const blockers = autoReleaseBlockers(result);
  if (blockers.length > 0) {
    return { ...outcome, autoRelease: { reportId: result.id, outcome: "held", reasons: blockers } };
  }

  try {
    const sent = await deps.autoRelease(result.id);
    if (sent.emailSent) {
      return { ...outcome, autoRelease: { reportId: result.id, outcome: "released", reasons: [] } };
    }
    // Released, but the participant has not been emailed. Make that visible on the study page.
    const reason = sent.emailError ?? "unknown error";
    await deps.reportRepo.update(result.id, {
      error: `Released automatically, but the email was not sent: ${reason}. Resend it from the review page.`,
    });
    return {
      ...outcome,
      autoRelease: { reportId: result.id, outcome: "email_failed", reasons: [reason] },
    };
  } catch (error) {
    // Nothing was released: the draft stays for a reviewer.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...outcome,
      autoRelease: { reportId: result.id, outcome: "held", reasons: [`release failed: ${reason}`] },
    };
  }
}
