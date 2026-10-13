import type { Study } from "@/domain";
import { validateParticipantCopy } from "@/participant-copy";
import type { StudyRepository } from "@/repositories/study-repository";
import { InvalidStudyInputError } from "./create-study";

/**
 * Saves the custom text for a study's landing and ending pages. `null` (or
 * copy with nothing in it) returns the study to the standard wording. Only
 * discovery studies have these pages to customize; a feedback study keeps its
 * own simpler intro. Editable at any time, unlike a study's type or pipeline.
 */
export async function updateParticipantCopy(
  repo: StudyRepository,
  studyId: string,
  rawCopy: unknown,
): Promise<Study> {
  const existing = await repo.getById(studyId);
  if (!existing) throw new Error(`Study not found: ${studyId}`);
  if (existing.type !== "discovery") {
    throw new InvalidStudyInputError([
      "participant pages can only be customized for discovery studies",
    ]);
  }

  const result = validateParticipantCopy(rawCopy);
  if (!result.valid) throw new InvalidStudyInputError(result.errors);
  return repo.updateDetails(studyId, { participantCopy: result.value });
}
