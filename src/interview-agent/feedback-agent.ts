import type { InterviewerTurnStreamEvent, InterviewTurn, LLMProviderAdapter } from "@/llm";
import { buildFeedbackSystemPrompt, type FeedbackPromptContext } from "./feedback-system-prompt";
import { checkTermination, FEEDBACK_HARD_CAP_MS, type TerminationReason } from "./termination";

/**
 * Scripted, not LLM-generated — same rationale as discovery-type's
 * TIME_CHECK_UTTERANCE: guarantees the open-floor closer (FEEDBACK_STUDY_TYPE.md
 * decision 11) actually gets asked verbatim, rather than trusting the model
 * to remember it once it believes the feedback-questions list is covered.
 * Unlike TIME_CHECK_UTTERANCE, this isn't triggered by elapsed time — it's
 * triggered by the model's own `shouldEndInterview: true` signal on an
 * ordinary turn. It is *appended* to that turn's utterance rather than
 * replacing it (see `finalizeTurn`) — for the ElevenLabs streaming path,
 * the model's text is forwarded live as it's generated, before
 * `shouldEndInterview` is even known, so by the time this fires the
 * participant has already heard the model's own words; there's no way to
 * retract already-spoken audio. Appending instead of substituting keeps
 * both the streaming and non-streaming paths behaviorally identical.
 */
export const OPEN_FLOOR_UTTERANCE =
  "Before we wrap up, is there anything else on your mind about today's session?";

const OPEN_FLOOR_FRAGMENTS = ["anything else on your mind", "today's session"];

export interface FeedbackAgentTurnInput {
  context: Omit<FeedbackPromptContext, "isClosingTurn">;
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

export type FeedbackAgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "done"; result: FeedbackAgentTurnOutput };

export interface FeedbackAgentTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
  terminationReason: TerminationReason;
  /** True exactly on the turn OPEN_FLOOR_UTTERANCE was appended. */
  openFloorJustAsked: boolean;
}

function utteranceContainsAllFragments(text: string, fragments: string[]): boolean {
  return fragments.every((fragment) => text.includes(fragment));
}

function wasUtteranceSpoken(history: InterviewTurn[], fragments: string[]): boolean {
  return history.some(
    (turn) => turn.speaker === "interviewer" && utteranceContainsAllFragments(turn.text, fragments),
  );
}

function lastInterviewerUtteranceMatches(history: InterviewTurn[], fragments: string[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].speaker === "interviewer") {
      return utteranceContainsAllFragments(history[i].text, fragments);
    }
  }
  return false;
}

/**
 * Drives one turn of a live feedback-type session — see FEEDBACK_STUDY_TYPE.md
 * for the full design. Deliberately a separate, parallel class to
 * InterviewAgent rather than branches inside it: the two types' turn logic
 * diverges enough (no scripted time-based check-ins, no extension state
 * machine, a model-triggered rather than time-triggered scripted line, no
 * minimum-turns depth floor) that keeping them independent is clearer than
 * threading a `studyType` branch through every method.
 *
 * Unlike InterviewAgent's `resolveScriptedTurn`, there's no pre-call
 * short-circuit here — the open-floor trigger is the model's own
 * `shouldEndInterview` signal on an ordinary turn, not elapsed time, so the
 * LLM must always be called first to know whether to append it.
 */
export class FeedbackAgent {
  constructor(private readonly llm: LLMProviderAdapter) {}

  private finalizeTurn(
    history: InterviewTurn[],
    interviewStartedAt: Date,
    now: Date,
    isClosingTurn: boolean,
    openFloorAsked: boolean,
    llmOutput: { utterance: string; shouldEndInterview: boolean; participantRequestedEnd?: boolean },
  ): FeedbackAgentTurnOutput {
    const { utterance, shouldEndInterview, participantRequestedEnd } = llmOutput;

    // Hard cap (and an explicit participant request to leave) always wins,
    // checked before any of the open-floor logic below — same priority
    // order as discovery-type's checkTermination usage.
    const timeCapReason = checkTermination({
      conversationHistory: history,
      interviewStartedAt,
      now,
      llmSuggestsEnd: false,
      participantRequestedEnd: participantRequestedEnd ?? false,
      hardCapMs: FEEDBACK_HARD_CAP_MS,
      minParticipantTurnsBeforeLlmCanEnd: 0,
    });
    if (timeCapReason !== null) {
      return { utterance, isInterviewOver: true, terminationReason: timeCapReason, openFloorJustAsked: false };
    }

    if (isClosingTurn) {
      // The turn immediately after the open-floor question is a
      // deterministic close — never trusted from the model, same
      // non-negotiable-close principle discovery-type's finalizeTurn
      // applies to its own reactive turns.
      return { utterance, isInterviewOver: true, terminationReason: "llm-self-assessed", openFloorJustAsked: false };
    }

    if (shouldEndInterview && !openFloorAsked) {
      // The model believes the feedback-question list is covered. Don't
      // trust it to remember the open-floor closer itself — append the
      // scripted line to whatever it just said, rather than ending.
      // Appended, not substituted: see OPEN_FLOOR_UTTERANCE's doc comment
      // for why substitution can't work on the streaming path.
      return {
        utterance: `${utterance} ${OPEN_FLOOR_UTTERANCE}`,
        isInterviewOver: false,
        terminationReason: null,
        openFloorJustAsked: true,
      };
    }

    return { utterance, isInterviewOver: false, terminationReason: null, openFloorJustAsked: false };
  }

  async generateNextTurn(input: FeedbackAgentTurnInput): Promise<FeedbackAgentTurnOutput> {
    const now = input.now ?? new Date();
    const history = input.conversationHistory;
    const openFloorAsked = wasUtteranceSpoken(history, OPEN_FLOOR_FRAGMENTS);
    const isClosingTurn =
      openFloorAsked && lastInterviewerUtteranceMatches(history, OPEN_FLOOR_FRAGMENTS);

    const systemPrompt = buildFeedbackSystemPrompt({ ...input.context, isClosingTurn });
    const llmOutput = await this.llm.generateInterviewerTurn({ systemPrompt, conversationHistory: history });

    return this.finalizeTurn(history, input.interviewStartedAt, now, isClosingTurn, openFloorAsked, llmOutput);
  }

  /**
   * Streaming counterpart, used by the ElevenLabs voice-session path — same
   * shape as InterviewAgent's. Forwards the model's own text-deltas live as
   * they arrive (unchanged), then — only once the stream is fully resolved
   * and `shouldEndInterview` is known — yields one more text-delta chunk for
   * the appended open-floor question when it applies, before the terminal
   * `done` event. The participant hears the model's real words followed
   * immediately by the scripted question in the same turn; nothing already
   * spoken is ever retracted or replaced.
   */
  async *generateNextTurnStreaming(
    input: FeedbackAgentTurnInput,
  ): AsyncGenerator<FeedbackAgentStreamEvent, void, unknown> {
    const now = input.now ?? new Date();
    const history = input.conversationHistory;
    const openFloorAsked = wasUtteranceSpoken(history, OPEN_FLOOR_FRAGMENTS);
    const isClosingTurn =
      openFloorAsked && lastInterviewerUtteranceMatches(history, OPEN_FLOOR_FRAGMENTS);

    const systemPrompt = buildFeedbackSystemPrompt({ ...input.context, isClosingTurn });

    let llmOutput: Extract<InterviewerTurnStreamEvent, { type: "done" }> | undefined;
    for await (const event of this.llm.generateInterviewerTurnStreaming({
      systemPrompt,
      conversationHistory: history,
    })) {
      if (event.type === "text-delta") {
        yield { type: "text-delta", text: event.text };
      } else {
        llmOutput = event;
      }
    }
    if (!llmOutput) {
      throw new Error("generateNextTurnStreaming: LLM stream ended without a done event");
    }

    const result = this.finalizeTurn(
      history,
      input.interviewStartedAt,
      now,
      isClosingTurn,
      openFloorAsked,
      llmOutput,
    );
    if (result.openFloorJustAsked) {
      yield { type: "text-delta", text: ` ${OPEN_FLOOR_UTTERANCE}` };
    }

    yield { type: "done", result };
  }
}
