import type { Interview } from "@/domain";
import { DEFAULT_MIN_PARTICIPANT_TURNS, type PipelineDeps } from "./types";

export interface EnqueueSummary {
  enqueued: number;
  skipped: number;
}

export function participantTurnCount(interview: Pick<Interview, "transcript">): number {
  return (interview.transcript ?? []).filter((turn) => turn.speaker === "participant").length;
}

/**
 * Finds completed interviews in job-search studies that have no report row yet
 * and queues them. An interview with too little to analyze is recorded as
 * skipped, with the reason, so the dashboard shows why it has no report and the
 * sweep does not look at it again. Safe to run repeatedly: a report row is
 * created at most once per interview.
 */
export async function enqueueEligibleReports(deps: PipelineDeps): Promise<EnqueueSummary> {
  const minTurns = deps.minParticipantTurns ?? DEFAULT_MIN_PARTICIPANT_TURNS;
  const summary: EnqueueSummary = { enqueued: 0, skipped: 0 };

  const studies = (await deps.studyRepo.list()).filter(
    (study) => study.reportPipeline === "job-search",
  );
  for (const study of studies) {
    const existing = new Set(
      (await deps.reportRepo.listByStudyId(study.id)).map((report) => report.interviewId),
    );
    const interviews = await deps.interviewRepo.listByStudyId(study.id);

    for (const interview of interviews) {
      if (interview.status !== "completed" || existing.has(interview.id)) continue;

      const turns = participantTurnCount(interview);
      if (turns < minTurns) {
        await deps.reportRepo.enqueue({
          interviewId: interview.id,
          studyId: study.id,
          status: "skipped",
          error: `Too short to analyze: ${turns} participant turn${turns === 1 ? "" : "s"} (needs at least ${minTurns}).`,
        });
        summary.skipped++;
        continue;
      }

      const { created } = await deps.reportRepo.enqueue({
        interviewId: interview.id,
        studyId: study.id,
      });
      if (created) summary.enqueued++;
    }
  }
  return summary;
}
