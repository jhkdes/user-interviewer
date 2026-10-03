import type { Interview } from "@/domain";
import { FEEDBACK_HARD_CAP_MS } from "@/interview-agent/termination";
import { completeTextInterview } from "./complete-text-interview";
import {
  IDLE_END_AFTER_MS,
  IDLE_NUDGE_AFTER_MS,
  IDLE_NUDGE_TEXT,
  MAX_COMPLETIONS_PER_SWEEP,
  MAX_INTERVIEW_AGE_MS,
} from "./constants";
import type { TextSessionDeps } from "./types";

export interface IdleSweepResult {
  /** Running text interviews looked at. */
  checked: number;
  /** Interviews that got the "are you still there?" nudge. */
  nudged: string[];
  /** Interviews this sweep ended, with why. */
  completed: { interviewId: string; endedReason: string }[];
  /** Interviews that were due to end but were left for the next sweep (the per-sweep limit). */
  deferred: number;
  /** Completed interviews whose leftover raw messages were deleted. */
  cleanedUp: string[];
}

type IdleDecision =
  | { action: "none" }
  | { action: "nudge" }
  | { action: "complete"; endedReason: "participant-inactive" };

/**
 * What the sweep should do about one running text interview.
 *
 * "Active" means the participant sent a message or was typing, or the
 * interviewer just finished a reply (`lastActivityAt`). In priority order:
 *   1. Older than the absolute backstop: end it, however active it looks.
 *   2. No activity for 7 minutes: end it.
 *   3. No activity for 3 minutes and the time cap has already passed: end it
 *      without a nudge, since a nudge would only invite a reply that ends the
 *      interview anyway.
 *   4. No activity for 3 minutes, not nudged yet, and the participant has
 *      something to answer: send the nudge.
 *
 * Every ending decided here is `participant-inactive`, so the participant
 * sees the "ended due to inactivity" screen. An interview whose cap runs out
 * while the participant is still replying ends in the turn itself (with the
 * closing line and reason `time-cap`), never here. Because the cap (7
 * minutes) equals the inactivity limit, rules 2 and 3 overlap — anything idle
 * for 7 minutes is also past the cap — but both are kept so neither limit
 * silently depends on the other's value.
 */
export function decideIdleAction(
  interview: Interview,
  lastMessageSpeaker: "interviewer" | "participant" | null,
  now: Date,
): IdleDecision {
  const startedAt = interview.startedAt ?? interview.createdAt;
  const lastActivity = interview.lastActivityAt ?? startedAt;
  const idleMs = now.getTime() - lastActivity.getTime();
  const ageMs = now.getTime() - startedAt.getTime();
  const capPassed = ageMs >= FEEDBACK_HARD_CAP_MS;

  if (ageMs >= MAX_INTERVIEW_AGE_MS) {
    return { action: "complete", endedReason: "participant-inactive" };
  }
  if (idleMs >= IDLE_END_AFTER_MS || (idleMs >= IDLE_NUDGE_AFTER_MS && capPassed)) {
    return { action: "complete", endedReason: "participant-inactive" };
  }
  if (
    idleMs >= IDLE_NUDGE_AFTER_MS &&
    interview.idleNudgeSentAt === null &&
    // Not while the participant is waiting on a reply that never came: a
    // "still there?" would be wrong when they are the ones waiting.
    lastMessageSpeaker === "interviewer"
  ) {
    return { action: "nudge" };
  }
  return { action: "none" };
}

/**
 * Walks every running text interview and applies `decideIdleAction`, then
 * deletes any raw messages left behind by completed interviews (a failed
 * delete at completion time is not retried anywhere else). Failures on one
 * interview are logged and don't stop the rest. Meant to run about once a
 * minute from a scheduler (see the `text-idle-sweep` route).
 */
export async function runTextIdleSweep(
  deps: TextSessionDeps,
  now: Date = deps.now ?? new Date(),
): Promise<IdleSweepResult> {
  const result: IdleSweepResult = {
    checked: 0,
    nudged: [],
    completed: [],
    deferred: 0,
    cleanedUp: [],
  };
  const sweepDeps = { ...deps, now };

  const interviews = await deps.interviewRepo.listActiveTextInterviews();
  result.checked = interviews.length;

  for (const interview of interviews) {
    try {
      const messages = await deps.messageRepo.listByInterviewId(interview.id);
      const last = messages.length === 0 ? undefined : messages[messages.length - 1];
      const decision = decideIdleAction(interview, last?.speaker ?? null, now);

      if (decision.action === "nudge") {
        const appended = await deps.messageRepo.append({
          interviewId: interview.id,
          speaker: "interviewer",
          text: IDLE_NUDGE_TEXT,
          // Only if nothing was said since we looked: a participant reply that
          // just landed wins and the nudge is dropped.
          afterSeq: last?.seq ?? 0,
        });
        if (appended.outcome === "appended") {
          // Deliberately not touching lastActivityAt: the nudge is not activity.
          await deps.interviewRepo.update(interview.id, { idleNudgeSentAt: now });
          result.nudged.push(interview.id);
        }
      } else if (decision.action === "complete") {
        if (result.completed.length >= MAX_COMPLETIONS_PER_SWEEP) {
          result.deferred += 1;
          continue;
        }
        const completed = await completeTextInterview(sweepDeps, {
          interviewId: interview.id,
          endedReason: decision.endedReason,
          source: "idle-sweep",
        });
        if (completed) {
          result.completed.push({ interviewId: interview.id, endedReason: decision.endedReason });
        }
      }
    } catch (error) {
      console.error(`Idle sweep failed for text interview ${interview.id}:`, error);
    }
  }

  // Completed interviews that still have raw messages: finish the cleanup
  // that completeTextInterview couldn't.
  try {
    const withMessages = await deps.messageRepo.listInterviewIdsWithMessages(50);
    for (const interviewId of withMessages) {
      const interview = await deps.interviewRepo.getById(interviewId);
      if (interview && interview.status === "completed") {
        await deps.messageRepo.deleteByInterviewId(interviewId);
        result.cleanedUp.push(interviewId);
      }
    }
  } catch (error) {
    console.error("Idle sweep failed to clean up leftover messages:", error);
  }

  return result;
}
