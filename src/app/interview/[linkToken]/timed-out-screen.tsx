import { IDLE_END_AFTER_MS } from "@/text-session/constants";

/**
 * Shown when a typed interview ended because the participant went quiet
 * (see TEXT_INTERVIEW_MODE.md). There is deliberately no way to restart: the
 * interview is over and what was said has been saved.
 */
export function TimedOutScreen() {
  const minutes = Math.round(IDLE_END_AFTER_MS / 60_000);

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">This interview ended due to inactivity</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        We didn&apos;t see any activity for {minutes} minutes, so we ended the interview. What you
        shared so far has been saved. Thank you for your time.
      </p>
    </div>
  );
}
