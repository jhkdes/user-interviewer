/**
 * Gate for text interview mode (feedback studies only — see
 * TEXT_INTERVIEW_MODE.md). Off by default: with it unset, participants see
 * exactly the voice-only flow and the endpoint that switches an interview to
 * typing refuses. Set `TEXT_INTERVIEW_MODE_ENABLED=true` to turn it on for a
 * deploy. Read on the server only (the interview page passes it down), so it
 * never depends on `NEXT_PUBLIC_*` build-time inlining.
 */
export function isTextInterviewModeEnabled(): boolean {
  return process.env.TEXT_INTERVIEW_MODE_ENABLED === "true";
}
