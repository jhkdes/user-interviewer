import type { InterviewTurn } from "@/llm";
import { extractEvidence } from "../extraction/extract";
import { aggregateRuns } from "../ledger/aggregate";
import { generateReport } from "../report/generate";
import { loadRubric } from "../rubric/rubric";
import type { JobSearchReport } from "../storage/types";
import { DEFAULT_EXTRACTION_RUNS, MIN_VALID_RUNS, type PipelineDeps } from "./types";

/** Error text safe to show a reviewer: the message, without a stack. */
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Turns one claimed report into a draft: reads the interview, runs the
 * extraction several times in parallel (saving each result so a restart does
 * not repeat paid work), combines and scores them, and writes the report. Any
 * failure marks the report failed with the reason, so a reviewer can see it and
 * retry; it never throws.
 */
export async function processReport(
  deps: PipelineDeps,
  claimed: JobSearchReport,
): Promise<JobSearchReport> {
  const rubric = deps.rubric ?? loadRubric();
  const target = deps.extractionRuns ?? DEFAULT_EXTRACTION_RUNS;

  try {
    const interview = await deps.interviewRepo.getById(claimed.interviewId);
    if (!interview) throw new Error("The interview no longer exists.");
    if (!interview.transcript || interview.transcript.length === 0)
      throw new Error("The interview has no transcript.");

    const transcript: InterviewTurn[] = interview.transcript.map(({ speaker, text }) => ({
      speaker,
      text,
    }));
    const screenerAnswers = interview.screenerAnswers;

    // Stage 1: extraction. Only the runs still missing, all at once.
    // Runs saved under an older rubric describe different behaviors under the same ids, so they are not reused.
    let runs = claimed.extractionRuns.filter((run) => run.rubricVersion === rubric.version);
    const missing = target - runs.length;
    if (missing > 0) {
      const results = await Promise.allSettled(
        Array.from({ length: missing }, () =>
          extractEvidence({ complete: deps.complete, rubric }, { transcript, screenerAnswers }),
        ),
      );
      const valid = results.flatMap((result) =>
        result.status === "fulfilled" && result.value.ok ? [result.value.ledger] : [],
      );
      runs = [...runs, ...valid];
      // Keep what was paid for, and show the worker is alive, before the next stage.
      await deps.reportRepo.update(claimed.id, { extractionRuns: runs });

      if (runs.length < MIN_VALID_RUNS) {
        const reasons = results.map((r) =>
          r.status === "rejected"
            ? describe(r.reason)
            : r.value.ok
              ? null
              : `invalid ledger (${r.value.issues
                  .filter((i) => i.severity === "error")
                  .map((i) => i.message)
                  .join("; ")})`,
        );
        throw new Error(
          `Extraction produced ${runs.length} valid run(s); at least ${MIN_VALID_RUNS} are needed. ${reasons.filter(Boolean).join(" | ")}`,
        );
      }
    }

    // Stage 2: combine, score, and write the report.
    const aggregate = aggregateRuns(rubric, runs);
    const generated = await generateReport(
      { complete: deps.complete },
      { rubric, aggregate, screenerAnswers },
    );

    return await deps.reportRepo.update(claimed.id, {
      status: "draft",
      rubricVersion: rubric.version,
      extractionRuns: runs,
      aggregate,
      scoring: generated.scoring,
      pack: generated.pack,
      comparison: generated.comparison,
      generatedReport: generated.report,
      report: generated.report,
      narrativeViolations: generated.narrativeViolations,
      textViolations: generated.textViolations,
      error: null,
      attempts: claimed.attempts + 1,
    });
  } catch (error) {
    return deps.reportRepo.update(claimed.id, {
      status: "failed",
      error: describe(error),
      attempts: claimed.attempts + 1,
    });
  }
}
