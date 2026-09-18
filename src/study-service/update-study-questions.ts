import type { PreInterviewQuestion, Study } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { InvalidStudyInputError } from "./create-study";
import { validateStudyInput } from "./study-input-validation";

export interface UpdateStudyQuestionsInput {
  title?: string;
  description?: string;
  /** Discovery-type studies only — leave unset for a feedback-type study. */
  preInterviewQuestions?: PreInterviewQuestion[];
  /** Feedback-type studies only — leave unset for a discovery-type study. */
  feedbackQuestions?: string[];
  /** `null` clears it back to unset; `undefined` leaves it untouched. */
  researchTopic?: string | null;
  /** `null` clears it back to unset; `undefined` leaves it untouched. */
  customPrompt?: string | null;
}

/**
 * Lets a PM add/edit/regenerate a study's questions (pre-interview screener
 * for discovery-type, feedback questions for feedback-type — see
 * FEEDBACK_STUDY_TYPE.md), title, description, research topic, and custom
 * prompt any time after creation — not just in the "New Study" wizard — e.g.
 * to fill in a study migrated with blank title/description, fix a bad draft,
 * or adjust interviewing strategy without recreating the study. `type`
 * itself is never accepted here — a study's type is immutable after creation.
 */
export async function updateStudyQuestions(
  repo: StudyRepository,
  studyId: string,
  input: UpdateStudyQuestionsInput,
): Promise<Study> {
  const existing = await repo.getById(studyId);
  if (!existing) throw new Error(`Study not found: ${studyId}`);

  const { valid, errors } = validateStudyInput({
    type: existing.type,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    preInterviewQuestions: input.preInterviewQuestions ?? existing.preInterviewQuestions,
    feedbackQuestions: input.feedbackQuestions ?? existing.feedbackQuestions,
  });
  if (!valid) throw new InvalidStudyInputError(errors);

  return repo.updateDetails(studyId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.researchTopic !== undefined ? { researchTopic: input.researchTopic } : {}),
    ...(input.customPrompt !== undefined ? { customPrompt: input.customPrompt } : {}),
    ...(input.preInterviewQuestions !== undefined
      ? { preInterviewQuestions: input.preInterviewQuestions }
      : {}),
    ...(input.feedbackQuestions !== undefined
      ? { feedbackQuestions: input.feedbackQuestions }
      : {}),
  });
}
