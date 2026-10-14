import type { Interview } from "@/domain";
import { completeTextInterview } from "./complete-text-interview";
import {
  IDLE_NUDGE_TEXT,
  MAX_COMPLETIONS_PER_SWEEP,
  textLimitsFor,
  type TextLimits,
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
  | { action: "complete"; endedReason: TextLimits["maxAgeEndedReason"] };

/**
 * What the sweep should do about one running text interview.
 *
 * "Active" means the participant sent a message or was typing, or the
 * interviewer just finished a reply (`lastActivityAt`). The limits come from
 * the study type (see `textLimitsFor`). In priority order:
 *   1. Older than the absolute backstop: end it, however active it looks.
 *      Feedback: 30 minutes, recorded as `participant-inactive`. Discovery:
 *      the 60-minute cap, recorded as `time-cap` (the participant is shown a
 *      countdown to it, so it is the expected end of a long session).
 *   2. No activity for the inactivity limit (feedback: 10 minutes; discovery
 *      has none): end it as `participant-inactive`.
 *   3. No activity for the nudge delay (5 minutes) and the time cap has
 *      already passed: end it without a nudge, since a nudge would only invite
 *      a reply that ends the interview anyway.
 *   4. No activity for the nudge delay, not nudged yet, and the participant
 *      has something to answer: send the nudge.
 *
 * An interview whose cap runs out while the participant is still replying ends
 * in the turn itself (with the closing line and reason `time-cap`), never here.
 */
export function decideIdleAction(
  interview: Interview,
  lastMessageSpeaker: "interviewer" | "participant" | null,
  now: Date,
  limits: TextLimits = textLimitsFor("feedback"),
): IdleDecision {
  const startedAt = interview.startedAt ?? interview.createdAt;
  const lastActivity = interview.lastActivityAt ?? startedAt;
  const idleMs = now.getTime() - lastActivity.getTime();
  const ageMs = now.getTime() - startedAt.getTime();
  const capPassed = ageMs >= limits.hardCapMs;

  if (ageMs >= limits.maxInterviewAgeMs) {
    return { action: "complete", endedReason: limits.maxAgeEndedReason };
  }
  if (
    (limits.idleEndAfterMs !== null && idleMs >= limits.idleEndAfterMs) ||
    (idleMs >= limits.nudgeAfterMs && capPassed)
  ) {
    return { action: "complete", endedReason: "participant-inactive" };
  }
  if (
    idleMs >= limits.nudgeAfterMs &&
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
      const study = await deps.studyRepo.getById(interview.studyId);
      if (!study) {
        console.error(
          `Idle sweep: study ${interview.studyId} of interview ${interview.id} not found`,
        );
        continue;
      }
      const decision = decideIdleAction(
        interview,
        last?.speaker ?? null,
        now,
        textLimitsFor(study.type),
      );

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
