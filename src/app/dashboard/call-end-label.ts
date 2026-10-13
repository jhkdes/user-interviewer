import type { Interview } from "@/domain";

/**
 * A plain-language line about how a voice call ended, for the dashboard.
 * `null` when nothing was recorded (typed interviews, and interviews that ended
 * before this was tracked). For an interrupted call it includes the provider's
 * own words, which is what makes a dropped call diagnosable.
 */
export function describeCallEnd(
  interview: Pick<Interview, "endCause" | "endDetail">,
): string | null {
  if (interview.endCause === "finished") return "the interviewer wrapped up";
  if (interview.endCause !== "interrupted") return null;

  const detail = interview.endDetail;
  const parts: string[] = ["the call ended before the interviewer wrapped up"];
  if (detail?.errorType) parts.push(detail.errorType.replace(/_/g, " "));
  const why = detail?.errorReason ?? detail?.terminationReason ?? detail?.endedReason;
  if (why) parts.push(why);
  return parts.join(": ");
}
