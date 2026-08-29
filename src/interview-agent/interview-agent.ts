import type { InterviewTurn, LLMProviderAdapter } from "@/llm";
import { buildInterviewSystemPrompt, type InterviewPromptContext } from "./system-prompt";
import { checkTermination, isApproachingTimeLimit, type TerminationReason } from "./termination";

/**
 * Scripted, not LLM-generated — empirically, the LLM proved unreliable at
 * noticing the soft-cap cue on its own turn (verified against the real API:
 * it kept asking a fresh substantive question instead, even with the
 * instruction positioned first in the prompt). Injecting this deterministic
 * line the moment the soft cap is first crossed guarantees it actually gets
 * asked, and turns the LLM's job on the *next* turn into something it's
 * reliably good at: reacting to an answer already sitting in the transcript,
 * rather than noticing an out-of-band flag and initiating on its own.
 */
export const TIME_CHECK_UTTERANCE =
  "Hey, I want to flag that we're running a little low on time — are you able to keep going for a few more minutes?";

export interface InterviewAgentTurnInput {
  /** `timeRunningLow` is computed here from `interviewStartedAt`/`now`, not supplied by the caller. */
  context: Omit<InterviewPromptContext, "timeRunningLow">;
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  /** Whether TIME_CHECK_UTTERANCE has already been injected for this interview — from Interview.timeCheckAskedAt. Defaults to false. */
  timeCheckAlreadyAsked?: boolean;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

export interface InterviewAgentTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
  terminationReason: TerminationReason;
  /** True exactly on the turn TIME_CHECK_UTTERANCE was returned — the caller should persist Interview.timeCheckAskedAt so it's never asked twice. */
  timeCheckJustAsked: boolean;
}

/**
 * Drives one turn of a live interview: builds the system prompt, asks the
 * LLM for the next utterance, and applies the pure termination guardrails
 * on top of the LLM's self-assessment. Stateless — the caller (M6's Voice
 * Session Orchestrator) owns and persists conversationHistory between calls.
 */
export class InterviewAgent {
  constructor(private readonly llm: LLMProviderAdapter) {}

  async generateNextTurn(input: InterviewAgentTurnInput): Promise<InterviewAgentTurnOutput> {
    const now = input.now ?? new Date();
    const timeRunningLow = isApproachingTimeLimit({
      interviewStartedAt: input.interviewStartedAt,
      now,
    });

    if (timeRunningLow && !input.timeCheckAlreadyAsked) {
      // Still subject to the hard cap even on this scripted turn — an
      // unusually slow prior turn could mean we're already past it by the
      // time we get here, in which case the LLM path below closes things
      // out properly instead of asking a check-in question no one has time
      // to answer.
      const terminationReason = checkTermination({
        conversationHistory: input.conversationHistory,
        interviewStartedAt: input.interviewStartedAt,
        now,
        llmSuggestsEnd: false,
        participantRequestedEnd: false,
      });
      if (terminationReason === null) {
        return {
          utterance: TIME_CHECK_UTTERANCE,
          isInterviewOver: false,
          terminationReason: null,
          timeCheckJustAsked: true,
        };
      }
    }

    const systemPrompt = buildInterviewSystemPrompt({ ...input.context, timeRunningLow });

    const { utterance, shouldEndInterview, participantRequestedEnd } =
      await this.llm.generateInterviewerTurn({
        systemPrompt,
        conversationHistory: input.conversationHistory,
      });

    // On the turn right after TIME_CHECK_UTTERANCE, system-prompt.ts's Time
    // check guidance constrains the LLM to exactly one of two shapes: ask
    // one more question, or close. Empirically (verified against the real
    // API) the model sometimes produces a clearly closing utterance —
    // thanking the participant, no question — while still leaving
    // `shouldEndInterview: false`, which would leave the call hanging
    // instead of ending. Since we ourselves imposed that binary shape, we
    // can detect which one actually happened from the utterance itself
    // rather than trusting the flag alone: no trailing "?" on this specific
    // turn means it wasn't the "ask one more question" branch, so treat it
    // as a close regardless of what the flag says. Scoped tightly to this
    // one turn — elsewhere, a non-question utterance is normal and not a
    // signal of anything.
    const isReactiveTimeCheckTurn = timeRunningLow && input.timeCheckAlreadyAsked === true;
    const llmSuggestsEnd =
      isReactiveTimeCheckTurn && !utterance.trim().endsWith("?") ? true : shouldEndInterview;

    const terminationReason = checkTermination({
      conversationHistory: input.conversationHistory,
      interviewStartedAt: input.interviewStartedAt,
      now,
      llmSuggestsEnd,
      participantRequestedEnd: participantRequestedEnd ?? false,
    });

    return {
      utterance,
      isInterviewOver: terminationReason !== null,
      terminationReason,
      timeCheckJustAsked: false,
    };
  }
}
