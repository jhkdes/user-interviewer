/**
 * What the browser knows when a voice call ends, used to tell a finished
 * interview from one that was cut short. The server records the authoritative
 * reason from the provider's webhook (see voice-session/call-end.ts); this is
 * only what lets the participant see a useful message right away.
 */
export interface CallEndInfo {
  /** How many times the participant spoke during the call. */
  participantTurns: number;
  /** Who closed the connection, as the voice SDK reports it. */
  reason: "user" | "agent" | "error";
}

/**
 * A call that ends before this many participant turns is shown the "ended
 * early" screen with a way to start again, not the thank-you page. Studies
 * that make a report use the report's own minimum (see
 * job-search-study/min-turns.ts); other studies use this smaller default.
 */
export const DEFAULT_MIN_PARTICIPANT_TURNS_FOR_FOLLOW_UP = 6;

export function endedEarly(
  info: CallEndInfo,
  minParticipantTurns: number = DEFAULT_MIN_PARTICIPANT_TURNS_FOR_FOLLOW_UP,
): boolean {
  return info.participantTurns < minParticipantTurns;
}
