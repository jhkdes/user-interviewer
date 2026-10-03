const LABELS: Record<string, string> = {
  "text-interview-ended": "the interviewer wrapped up",
  "participant-requested": "the participant asked to stop",
  "time-cap": "the time limit was reached",
  "participant-inactive": "no activity (timed out)",
  "message-limit": "the message limit was reached",
};

/**
 * A short, plain-language reason a typed interview ended, for the interview
 * detail page. Typed interviews can end for reasons a "completed" status
 * alone hides — most importantly a participant who walked away part-way, so
 * the transcript is partial. Returns `null` when there is no reason to show
 * (voice providers' own free-form reasons are deliberately not interpreted).
 */
export function describeTextEndedReason(endedReason: string | null): string | null {
  if (!endedReason) return null;
  return LABELS[endedReason] ?? endedReason;
}
