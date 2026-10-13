import type { InterviewTurn } from "@/llm";

/**
 * Detecting a participant the interviewer cannot hear. When the microphone is
 * muted, wrong, or blocked, the speech-to-text records each of their turns as
 * "..." (or nothing). The language model treats those as vague answers and
 * keeps rephrasing its question, so the participant never learns the problem is
 * on their side. These lines are scripted, not generated, so they are reliable.
 */

/** A turn with no words in it: empty, or only punctuation such as "...". */
export function isSilentTurn(text: string): boolean {
  return !/[\p{L}\p{N}]/u.test(text);
}

/** How many of the participant's most recent turns in a row were silent. */
export function trailingSilentTurns(history: InterviewTurn[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.speaker !== "participant") continue;
    if (!isSilentTurn(turn.text)) break;
    count++;
  }
  return count;
}

/** Silent turns in a row before the interviewer says it cannot hear them. */
export const SILENT_TURNS_BEFORE_NOTICE = 2;

export const CANT_HEAR_UTTERANCE =
  "Sorry, I'm not able to hear you. Could you check that your microphone is on and not muted, and say a few words so I know it's working?";

export const STILL_CANT_HEAR_UTTERANCE =
  "I still can't hear anything on my end. Could you check your browser's microphone settings, and try saying something now?";

/** What the interviewer says when it has not been able to hear the participant, or null when it has. */
export function silenceNotice(history: InterviewTurn[]): string | null {
  const silent = trailingSilentTurns(history);
  if (silent < SILENT_TURNS_BEFORE_NOTICE) return null;
  return silent === SILENT_TURNS_BEFORE_NOTICE ? CANT_HEAR_UTTERANCE : STILL_CANT_HEAR_UTTERANCE;
}
