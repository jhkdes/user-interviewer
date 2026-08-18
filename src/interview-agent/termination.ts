import type { InterviewTurn } from "@/llm";

export const HARD_CAP_MINUTES = 20;
export const HARD_CAP_MS = HARD_CAP_MINUTES * 60 * 1000;

/**
 * The LLM's own self-assessment (shouldEndInterview) is only honored once
 * the participant has had at least this many turns — guards against ending
 * after a single surface-level exchange, per REQUIREMENTS.md's depth
 * heuristic ("should not stop at a surface-level complaint").
 */
export const MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END = 4;

export type TerminationReason = "time-cap" | "llm-self-assessed" | null;

export interface TerminationCheckInput {
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  now: Date;
  llmSuggestsEnd: boolean;
}

/**
 * Pure, deterministic termination guardrails on top of the LLM's own
 * judgment. Two checks only — the hard time cap and a minimum-depth floor —
 * not a full "keep probing / pivot / terminate" state machine: distinguishing
 * "still worth probing this thread" from "time to pivot to a new one" is a
 * genuine judgment call the system prompt's depth heuristic (system-prompt.ts)
 * already asks the LLM to make each turn. Re-deriving that from transcript
 * text with pure heuristics (e.g. topic clustering) would be unreliable and
 * out of scope — this function only enforces what must never depend on the
 * LLM getting it right: the hard cap, and not ending too early.
 */
export function checkTermination(input: TerminationCheckInput): TerminationReason {
  const elapsedMs = input.now.getTime() - input.interviewStartedAt.getTime();
  if (elapsedMs >= HARD_CAP_MS) {
    return "time-cap";
  }

  const participantTurnCount = input.conversationHistory.filter(
    (turn) => turn.speaker === "participant",
  ).length;

  if (input.llmSuggestsEnd && participantTurnCount >= MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END) {
    return "llm-self-assessed";
  }

  return null;
}
