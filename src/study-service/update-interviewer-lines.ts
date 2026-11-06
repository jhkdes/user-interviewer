import type { Study } from "@/domain";
import type { StudyRepository, UpdateStudyDetailsInput } from "@/repositories/study-repository";
import { InvalidStudyInputError } from "./create-study";

/** The longest a scripted interviewer line can be. */
export const INTERVIEWER_LINE_MAX_LENGTH = 300;

/**
 * Saves the two scripted lines a feedback study can word itself: what the
 * interviewer says first (`firstMessage`) and the question it asks before
 * closing (`closingQuestion`). Only the fields that are present are changed;
 * `null` or empty text puts a line back to the standard wording. Feedback
 * studies only, and editable at any time.
 */
export async function updateInterviewerLines(
  repo: StudyRepository,
  studyId: string,
  raw: { firstMessage?: unknown; closingQuestion?: unknown },
): Promise<Study> {
  const existing = await repo.getById(studyId);
  if (!existing) throw new Error(`Study not found: ${studyId}`);
  if (existing.type !== "feedback") {
    throw new InvalidStudyInputError(["interviewer lines can only be set on feedback studies"]);
  }

  const errors: string[] = [];
  const patch: UpdateStudyDetailsInput = {};
  const read = (value: unknown, label: string): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") {
      errors.push(`${label} must be text`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > INTERVIEWER_LINE_MAX_LENGTH) {
      errors.push(`${label} is longer than ${INTERVIEWER_LINE_MAX_LENGTH} characters`);
      return undefined;
    }
    return trimmed || null;
  };

  const firstMessage = read(raw.firstMessage, "opening line");
  if (firstMessage !== undefined) patch.firstMessage = firstMessage;
  const closingQuestion = read(raw.closingQuestion, "closing question");
  if (closingQuestion !== undefined) patch.closingQuestion = closingQuestion;

  if (errors.length > 0) throw new InvalidStudyInputError(errors);
  if (Object.keys(patch).length === 0) return existing;
  return repo.updateDetails(studyId, patch);
}
