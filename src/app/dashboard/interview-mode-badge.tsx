import type { Interview } from "@/domain";

/**
 * Marks an interview that was taken by typing instead of talking (see
 * TEXT_INTERVIEW_MODE.md). Voice interviews — every interview before text
 * mode existed, and the default — show nothing, so existing lists look
 * exactly as they always have. A typed interview that began as a voice call
 * the participant couldn't use says so.
 */
export function InterviewModeBadge({
  interview,
}: {
  interview: Pick<Interview, "mode" | "switchedToTextAt">;
}) {
  if (interview.mode !== "text") return null;

  return (
    <span
      className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
      title={
        interview.switchedToTextAt
          ? "Typed interview — the participant started by voice, then switched to typing"
          : "Typed interview — no audio recording"
      }
    >
      {interview.switchedToTextAt ? "Typed · switched from voice" : "Typed"}
    </span>
  );
}
