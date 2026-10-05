import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";

/** Matches the UUIDs studies are keyed by. Anything else can't be a study id, and Postgres rejects it as a query error rather than finding nothing. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CountCompletedInterviewsDeps {
  studyRepo: StudyRepository;
  interviewRepo: InterviewRepository;
}

/**
 * The number of completed interviews in a study that have a transcript — see
 * `InterviewRepository.countCompletedWithTranscript` for exactly what counts.
 * Returns `null` when there is no such study, including when `studyId`
 * isn't even a well-formed id, so a caller can't tell the two apart.
 */
export async function countCompletedInterviews(
  deps: CountCompletedInterviewsDeps,
  studyId: string,
): Promise<number | null> {
  if (!UUID_PATTERN.test(studyId)) return null;

  const study = await deps.studyRepo.getById(studyId);
  if (!study) return null;

  return deps.interviewRepo.countCompletedWithTranscript(study.id);
}
