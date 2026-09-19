import type { Interview, Study } from "@/domain";

export interface ResolvedScreenerAnswer {
  label: string;
  answer: string;
}

/**
 * Turns `interview.screenerAnswers` (keyed by the study's opaque
 * `PreInterviewQuestion.id`, not its label — see intake-form.tsx) into a
 * self-explanatory list for the printable interview export. Falls back to
 * showing the raw key as the label when a question id no longer exists on
 * the study (e.g. the PM has since edited/regenerated its questions) rather
 * than throwing — a stale id is a rare edge case the PM's own review of the
 * printed page will catch, not something that should break the export.
 *
 * Returns `[]` when there are no answers or no questions to resolve them
 * against — naturally covers feedback-type studies, which never have
 * either (FEEDBACK_STUDY_TYPE.md decision 6).
 */
export function resolveScreenerAnswers(
  study: Study,
  interview: Interview,
): ResolvedScreenerAnswer[] {
  if (!interview.screenerAnswers) return [];

  return Object.entries(interview.screenerAnswers).map(([questionId, value]) => {
    const question = study.preInterviewQuestions.find((q) => q.id === questionId);
    return {
      label: question?.label ?? questionId,
      answer: Array.isArray(value) ? value.join(", ") : value,
    };
  });
}
