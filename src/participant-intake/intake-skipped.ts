import type { Study } from "@/domain";

/**
 * Whether a study's colleagues skip the "A little about you" form. Only partner
 * studies can: their invitation already carries the colleague's first name, and
 * no summary is emailed to them. A study with screener questions keeps the form,
 * because that is where those questions are asked.
 */
export function intakeSkipped(
  study: Pick<Study, "partnerId" | "skipIntake" | "preInterviewQuestions">,
): boolean {
  return Boolean(study.partnerId) && study.skipIntake && study.preInterviewQuestions.length === 0;
}
