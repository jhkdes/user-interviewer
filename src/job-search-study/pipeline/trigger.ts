/**
 * Starts the report worker as soon as a job-search interview completes, by
 * calling the sweep route (which runs in its own function invocation, with its
 * own time limit). Waits only briefly for the response: the sweep keeps running
 * after the request is dropped, and the scheduled sweep and "Process now" are
 * the backstop if it does not.
 */
const WAIT_MS = 5000;

export async function triggerReportSweep(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const base =
    process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!secret || !base) {
    console.warn(
      "Report sweep not triggered: set CRON_SECRET and APP_BASE_URL. The scheduled sweep or Process now will pick it up.",
    );
    return;
  }
  try {
    await fetch(`${base.replace(/\/+$/, "")}/api/internal/job-search-reports/sweep`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(WAIT_MS),
    });
  } catch {
    // A timeout is expected: the sweep is still running on its side.
  }
}
