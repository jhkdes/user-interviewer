/**
 * Runs the job-search report worker from the command line: queues completed
 * interviews and works through pending reports (one per pass) until none are
 * left. Use `--once` for a single pass.
 *
 *   npm run process:job-search-reports
 */
import { getPipelineDeps } from "../src/job-search-study/pipeline/get-deps";
import { runSweep } from "../src/job-search-study/pipeline/sweep";

async function main() {
  const once = process.argv.includes("--once");
  const deps = getPipelineDeps();
  for (;;) {
    const result = await runSweep(deps);
    console.log(
      `enqueued ${result.enqueued}, skipped ${result.skipped}, ` +
        `processed ${result.processed ? `${result.processed.reportId} (${result.processed.outcome})` : "nothing"}`,
    );
    if (once || !result.processed) break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
