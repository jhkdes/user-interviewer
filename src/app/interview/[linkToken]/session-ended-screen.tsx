import type { ParticipantCopy } from "@/domain";
import { DISCOVERY_TEXT_HARD_CAP_MINUTES } from "@/interview-agent/termination";
import { resolveCompletionCopy, resolveSessionEndedCopy } from "@/participant-copy";

/**
 * Shown when a typed discovery session ended because it reached its time limit
 * (see TEXT_DISCOVERY_INTERVIEW.md). There is no way to restart: the session is
 * over and what was said has been saved. The study's own ending text follows the
 * note, so whatever it promises next (a report, a follow-up email) still reaches
 * the participant.
 */
export function SessionEndedScreen({ copy }: { copy?: ParticipantCopy | null }) {
  const ended = resolveSessionEndedCopy(DISCOVERY_TEXT_HARD_CAP_MINUTES);
  const completion = resolveCompletionCopy(copy, "text");
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">{ended.title}</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{ended.message}</p>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{completion.message}</p>
    </div>
  );
}
