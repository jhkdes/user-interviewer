import type { InterviewTurn, LLMProviderAdapter } from "@/llm";
import { buildInterviewSystemPrompt, type InterviewPromptContext } from "./system-prompt";
import { checkTermination, type TerminationReason } from "./termination";

export interface InterviewAgentTurnInput {
  context: InterviewPromptContext;
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

export interface InterviewAgentTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
  terminationReason: TerminationReason;
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
    const systemPrompt = buildInterviewSystemPrompt(input.context);

    const { utterance, shouldEndInterview } = await this.llm.generateInterviewerTurn({
      systemPrompt,
      conversationHistory: input.conversationHistory,
    });

    const terminationReason = checkTermination({
      conversationHistory: input.conversationHistory,
      interviewStartedAt: input.interviewStartedAt,
      now,
      llmSuggestsEnd: shouldEndInterview,
    });

    return {
      utterance,
      isInterviewOver: terminationReason !== null,
      terminationReason,
    };
  }
}
