import type { PreInterviewQuestion } from "@/domain";

export interface StudyInput {
  title: string;
  description: string;
  preInterviewQuestions: PreInterviewQuestion[];
}

export interface StudyInputValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Only checks presence/shape, not content — the PM describes the study and
 * authors its questions in their own words rather than picking from an enum.
 */
export function validateStudyInput(input: StudyInput): StudyInputValidationResult {
  const errors: string[] = [];

  if (!input.title?.trim()) errors.push("title is required");
  if (!input.description?.trim()) errors.push("description is required");

  input.preInterviewQuestions.forEach((question, index) => {
    if (!question.label?.trim()) {
      errors.push(`question ${index + 1}: label is required`);
    }
    if (question.type !== "single" && question.type !== "multi") {
      errors.push(`question ${index + 1}: type must be "single" or "multi"`);
    }
    if (question.options.length < 2) {
      errors.push(`question ${index + 1}: at least 2 options are required`);
    }
  });

  return { valid: errors.length === 0, errors };
}
