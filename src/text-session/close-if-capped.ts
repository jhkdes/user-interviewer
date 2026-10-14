import { completeTextInterview } from "./complete-text-interview";
import { textLimitsFor } from "./constants";
import type { TextSessionDeps } from "./types";

/**
 * Ends a typed discovery interview whose time cap has passed. The idle sweep
 * does the same on a schedule; this lets a participant who still has the chat
 * open see the session close within seconds of the countdown reaching zero,
 * instead of waiting for the next scheduled run. Safe to call on every poll:
 * the shared completion guard makes a second completion a no-op.
 *
 * Feedback interviews are not touched: their cap is applied in the turn
 * itself, and an interview past it is ended for inactivity by the sweep.
 * Returns whether this call ended the interview.
 */
export async function closeIfCapped(deps: TextSessionDeps, interviewId: string): Promise<boolean> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview || interview.mode !== "text" || interview.status !== "in-progress") return false;

  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study || study.type !== "discovery") return false;

  const limits = textLimitsFor(study.type);
  const startedAt = interview.startedAt ?? interview.createdAt;
  const now = deps.now ?? new Date();
  if (now.getTime() - startedAt.getTime() < limits.maxInterviewAgeMs) return false;

  return completeTextInterview(deps, {
    interviewId,
    endedReason: limits.maxAgeEndedReason,
    source: "text-state",
  });
}
