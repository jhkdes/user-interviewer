import type { InterviewTurn } from "@/llm";

export const HARD_CAP_MINUTES = 15;
export const HARD_CAP_MS = HARD_CAP_MINUTES * 60 * 1000;

/**
 * How long before the hard cap the interviewer gets warned it's running low
 * on time (see system-prompt.ts's "Time check" section). Without this
 * buffer, the hard cap forces `isInterviewOver` on whatever turn the LLM
 * happens to be mid-way through — including a brand-new question — and
 * custom-llm.ts bolts END_CALL_PHRASE onto it regardless, producing an
 * abrupt, incoherent close. The 3-minute window gives the LLM room to
 * acknowledge the time, ask the participant if they can continue, and close
 * gracefully on its own before the mechanical cutoff ever has to fire.
 */
export const SOFT_CAP_MINUTES = HARD_CAP_MINUTES - 3;
export const SOFT_CAP_MS = SOFT_CAP_MINUTES * 60 * 1000;

/**
 * The LLM's own self-assessment (shouldEndInterview) is only honored once
 * the participant has had at least this many turns — guards against ending
 * after a single surface-level exchange, per REQUIREMENTS.md's depth
 * heuristic ("should not stop at a surface-level complaint").
 */
export const MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END = 4;

export type TerminationReason = "time-cap" | "participant-requested" | "llm-self-assessed" | null;

export interface TerminationCheckInput {
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  now: Date;
  llmSuggestsEnd: boolean;
  /**
   * True when the LLM signaled the participant explicitly asked to end the
   * interview right now (see GenerateInterviewerTurnOutput.participantRequestedEnd)
   * — honored unconditionally, unlike `llmSuggestsEnd`. A real early-exit
   * request ("I have to go," "can you end this?") isn't the scenario
   * MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END exists to guard against — that
   * guardrail is about the AI not cutting a *shallow* interview short on its
   * own initiative, not about refusing to hang up when the participant
   * themselves asks to leave. Confirmed via a real transcript where a
   * participant asked to end three times in the first few exchanges and the
   * call never actually hung up, because this depth gate silently withheld
   * `isInterviewOver` every time despite the LLM saying so.
   */
  participantRequestedEnd: boolean;
}

/** Pure predicate feeding system-prompt.ts's time-check guidance — see SOFT_CAP_MS. */
export function isApproachingTimeLimit(input: { interviewStartedAt: Date; now: Date }): boolean {
  return input.now.getTime() - input.interviewStartedAt.getTime() >= SOFT_CAP_MS;
}

/**
 * Pure, deterministic termination guardrails on top of the LLM's own
 * judgment. Checks, in priority order: the hard time cap (always wins),
 * an explicit participant request to end (always honored, no depth
 * requirement), then the LLM's own self-assessment gated by a minimum-depth
 * floor. Not a full "keep probing / pivot / terminate" state machine:
 * distinguishing "still worth probing this thread" from "time to pivot to a
 * new one" is a genuine judgment call the system prompt's depth heuristic
 * (system-prompt.ts) already asks the LLM to make each turn. Re-deriving
 * that from transcript text with pure heuristics (e.g. topic clustering)
 * would be unreliable and out of scope — this function only enforces what
 * must never depend on the LLM getting it right: the hard cap, honoring an
 * explicit request to stop, and not ending too early otherwise.
 */
export function checkTermination(input: TerminationCheckInput): TerminationReason {
  const elapsedMs = input.now.getTime() - input.interviewStartedAt.getTime();
  if (elapsedMs >= HARD_CAP_MS) {
    return "time-cap";
  }

  if (input.participantRequestedEnd) {
    return "participant-requested";
  }

  const participantTurnCount = input.conversationHistory.filter(
    (turn) => turn.speaker === "participant",
  ).length;

  if (input.llmSuggestsEnd && participantTurnCount >= MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END) {
    return "llm-self-assessed";
  }

  return null;
}
