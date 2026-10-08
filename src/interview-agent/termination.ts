import type { InterviewTurn } from "@/llm";

/** The length participants are told ("a 15-minute interview"). The check-in below happens at this mark. */
export const INTERVIEW_LENGTH_MINUTES = 15;

/**
 * Minutes of buffer between a check-in and the mechanical cutoff that follows
 * it. Without it, the cutoff forces `isInterviewOver` on whatever turn the LLM
 * happens to be mid-way through — including a brand-new question — and
 * custom-llm.ts bolts END_CALL_PHRASE onto it regardless, producing an
 * abrupt, incoherent close. The window gives the LLM room to acknowledge the
 * time, ask the participant if they can continue, and close gracefully on its
 * own before the mechanical cutoff ever has to fire.
 */
const CLOSE_OUT_BUFFER_MINUTES = 3;

/**
 * When the interviewer is warned it is out of time and asks the participant
 * whether they can keep going (see system-prompt.ts's "Time check" section):
 * at the advertised length, so participants get the full time they were promised.
 */
export const SOFT_CAP_MINUTES = INTERVIEW_LENGTH_MINUTES;
export const SOFT_CAP_MS = SOFT_CAP_MINUTES * 60 * 1000;

/**
 * The mechanical cutoff for an interview whose participant did not agree to
 * keep going: the close-out buffer after the check-in. Set the provider's own
 * maximum call duration (Vapi `maxDurationSeconds`, ElevenLabs agent max
 * duration) at or above EXTENDED_HARD_CAP_MINUTES, or the provider hangs up first.
 */
export const HARD_CAP_MINUTES = SOFT_CAP_MINUTES + CLOSE_OUT_BUFFER_MINUTES;
export const HARD_CAP_MS = HARD_CAP_MINUTES * 60 * 1000;

/**
 * The ceiling that applies once a participant has explicitly agreed, at the
 * HARD_CAP_MINUTES check-in, to keep going — see InterviewAgent's
 * TIME_CHECK_UTTERANCE decision turn and Interview.extensionGranted. Never
 * applies unless that agreement was actually given; an interview that never
 * reaches the check-in, or where the participant declines, is still capped
 * at HARD_CAP_MINUTES.
 */
/** Same rationale as SOFT_CAP_MINUTES, ten minutes later — see InterviewAgent's SECOND_TIME_CHECK_UTTERANCE. */
export const EXTENDED_SOFT_CAP_MINUTES = SOFT_CAP_MINUTES + 10;
export const EXTENDED_SOFT_CAP_MS = EXTENDED_SOFT_CAP_MINUTES * 60 * 1000;

export const EXTENDED_HARD_CAP_MINUTES = EXTENDED_SOFT_CAP_MINUTES + CLOSE_OUT_BUFFER_MINUTES;
export const EXTENDED_HARD_CAP_MS = EXTENDED_HARD_CAP_MINUTES * 60 * 1000;

/**
 * The LLM's own self-assessment (shouldEndInterview) is only honored once
 * the participant has had at least this many turns — guards against ending
 * after a single surface-level exchange, per REQUIREMENTS.md's depth
 * heuristic ("should not stop at a surface-level complaint").
 */
export const MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END = 4;

/**
 * Feedback-type studies (FEEDBACK_STUDY_TYPE.md decision 3): a single hard
 * cap, not a soft/extended two-tier system like Discovery. FEEDBACK_TARGET_MINUTES
 * is a *prompt-level* instruction only ("aim to wrap up in about 5
 * minutes") — never enforced here. FEEDBACK_HARD_CAP_MS is the actual
 * mechanical ceiling passed as `hardCapMs` for feedback-type interviews;
 * there is no feedback-specific soft-cap constant since there's no
 * scripted time-based check-in for this type (see FeedbackAgent's
 * model-triggered open-floor mechanism instead).
 */
export const FEEDBACK_TARGET_MINUTES = 5;
export const FEEDBACK_HARD_CAP_MINUTES = 7;
export const FEEDBACK_HARD_CAP_MS = FEEDBACK_HARD_CAP_MINUTES * 60 * 1000;

/**
 * Feedback interviews taken by typing get a longer hard cap than spoken ones:
 * participants compose answers more carefully and often multitask, so the
 * same wall-clock limit fits far fewer exchanges (see TEXT_INTERVIEW_MODE.md).
 * Spoken feedback interviews keep FEEDBACK_HARD_CAP_MS.
 */
export const FEEDBACK_TEXT_HARD_CAP_MINUTES = 15;
export const FEEDBACK_TEXT_HARD_CAP_MS = FEEDBACK_TEXT_HARD_CAP_MINUTES * 60 * 1000;

/** The hard cap for a feedback interview taken over the given channel. */
export function feedbackHardCapMs(channel: "voice" | "text"): number {
  return channel === "text" ? FEEDBACK_TEXT_HARD_CAP_MS : FEEDBACK_HARD_CAP_MS;
}

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
  /** The effective hard cap for this interview — HARD_CAP_MS unless the participant has agreed to extend (EXTENDED_HARD_CAP_MS, see Interview.extensionGranted), or FEEDBACK_HARD_CAP_MS for a feedback-type interview. Defaults to HARD_CAP_MS. */
  hardCapMs?: number;
  /** Overrides MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END — FeedbackAgent passes 0, since a fixed short feedback-question list is already naturally bounded (FEEDBACK_STUDY_TYPE.md decision 4). Defaults to MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END. */
  minParticipantTurnsBeforeLlmCanEnd?: number;
}

/** Pure predicate feeding system-prompt.ts's time-check guidance — see SOFT_CAP_MS. `softCapMs` defaults to SOFT_CAP_MS; pass EXTENDED_SOFT_CAP_MS to check against the extended cap's warning window instead. */
export function isApproachingTimeLimit(input: {
  interviewStartedAt: Date;
  now: Date;
  softCapMs?: number;
}): boolean {
  return (
    input.now.getTime() - input.interviewStartedAt.getTime() >= (input.softCapMs ?? SOFT_CAP_MS)
  );
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
  if (elapsedMs >= (input.hardCapMs ?? HARD_CAP_MS)) {
    return "time-cap";
  }

  if (input.participantRequestedEnd) {
    return "participant-requested";
  }

  const participantTurnCount = input.conversationHistory.filter(
    (turn) => turn.speaker === "participant",
  ).length;

  const minParticipantTurns =
    input.minParticipantTurnsBeforeLlmCanEnd ?? MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END;
  if (input.llmSuggestsEnd && participantTurnCount >= minParticipantTurns) {
    return "llm-self-assessed";
  }

  return null;
}
