import type { PreInterviewQuestion, StudyType } from "@/domain";

export interface StudyInput {
  /** Defaults to `"discovery"` when omitted, so existing discovery-only call sites don't need updating. */
  type?: StudyType;
  title: string;
  description: string;
  /** Validated only for discovery-type input — ignored for feedback-type. */
  preInterviewQuestions: PreInterviewQuestion[];
  /** Validated only for feedback-type input — ignored for discovery-type. */
  feedbackQuestions?: string[];
}

export interface StudyInputValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Only checks presence/shape, not content — the PM describes the study and
 * authors its questions in their own words rather than picking from an enum.
 * Which set of questions gets validated depends on `type` (FEEDBACK_STUDY_TYPE.md
 * decision 5) — a feedback-type study never has preInterviewQuestions to
 * validate, and vice versa.
 */
export function validateStudyInput(input: StudyInput): StudyInputValidationResult {
  const errors: string[] = [];
  const type = input.type ?? "discovery";

  if (!input.title?.trim()) errors.push("title is required");
  if (!input.description?.trim()) errors.push("description is required");

  if (type === "feedback") {
    const feedbackQuestions = input.feedbackQuestions ?? [];
    if (feedbackQuestions.length === 0) {
      errors.push("at least one feedback question is required");
    }
    feedbackQuestions.forEach((question, index) => {
      if (!question?.trim()) {
        errors.push(`feedback question ${index + 1}: text is required`);
      }
    });
  } else {
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
  }

  return { valid: errors.length === 0, errors };
}
