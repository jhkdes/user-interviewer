import type { PreInterviewQuestion, Study } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { InvalidStudyInputError } from "./create-study";
import { validateStudyInput } from "./study-input-validation";

export interface UpdateStudyQuestionsInput {
  title?: string;
  description?: string;
  preInterviewQuestions: PreInterviewQuestion[];
  /** `null` clears it back to unset; `undefined` leaves it untouched. */
  researchTopic?: string | null;
  /** `null` clears it back to unset; `undefined` leaves it untouched. */
  customPrompt?: string | null;
}

/**
 * Lets a PM add/edit/regenerate a study's pre-interview questions, title,
 * description, research topic, and custom prompt any time after creation —
 * not just in the "New Study" wizard — e.g. to fill in a study migrated
 * with blank title/description, fix a bad draft, or adjust interviewing
 * strategy without recreating the study.
 */
export async function updateStudyQuestions(
  repo: StudyRepository,
  studyId: string,
  input: UpdateStudyQuestionsInput,
): Promise<Study> {
  const existing = await repo.getById(studyId);
  if (!existing) throw new Error(`Study not found: ${studyId}`);

  const { valid, errors } = validateStudyInput({
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    preInterviewQuestions: input.preInterviewQuestions,
  });
  if (!valid) throw new InvalidStudyInputError(errors);

  return repo.updateDetails(studyId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.researchTopic !== undefined ? { researchTopic: input.researchTopic } : {}),
    ...(input.customPrompt !== undefined ? { customPrompt: input.customPrompt } : {}),
    preInterviewQuestions: input.preInterviewQuestions,
  });
}
