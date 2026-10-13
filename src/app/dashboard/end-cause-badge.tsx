import type { Interview } from "@/domain";
import { describeCallEnd } from "./call-end-label";

/**
 * Marks a voice interview whose call ended before the interviewer wrapped it
 * up (a lost connection, a long silence, the participant leaving, or a
 * provider error). Interviews that finished normally, and typed ones, show
 * nothing, so existing lists look as they always have.
 */
export function EndCauseBadge({
  interview,
}: {
  interview: Pick<Interview, "endCause" | "endDetail">;
}) {
  if (interview.endCause !== "interrupted") return null;

  return (
    <span
      className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
      title={describeCallEnd(interview) ?? "The call ended before the interviewer wrapped up"}
    >
      Call dropped
    </span>
  );
}
