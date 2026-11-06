import type { InterviewerTurnStreamEvent, InterviewTurn, LLMProviderAdapter } from "@/llm";
import { interpolate } from "./shared-prompt-parts";
import { buildFeedbackSystemPrompt, type FeedbackPromptContext } from "./feedback-system-prompt";
import { checkTermination, feedbackHardCapMs, type TerminationReason } from "./termination";

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

/**
 * The scripted closing question a study uses: its own wording
 * (Study.closingQuestion, which may use `{{participant_name}}`) or, when it
 * has none, OPEN_FLOOR_UTTERANCE.
 */
export function resolveClosingQuestion(
  custom: string | null | undefined,
  participantFirstName: string,
): { utterance: string; isCustom: boolean } {
  const trimmed = custom?.trim();
  if (!trimmed) return { utterance: OPEN_FLOOR_UTTERANCE, isCustom: false };
  return {
    utterance: interpolate(trimmed, { participant_name: participantFirstName }),
    isCustom: true,
  };
}

/** Lower-case, punctuation (including curly quotes) removed, spacing collapsed: so a provider's re-transcription of the same sentence still matches. */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Text channel only. Appended to the model's reply on the turn the time cap
 * ends the interview, so a written chat doesn't just stop after a reply that
 * may look like an unanswered question. Same append-not-substitute approach
 * as OPEN_FLOOR_UTTERANCE, so the streaming and non-streaming paths behave
 * identically. Voice interviews are unaffected.
 */
export const TEXT_TIME_CAP_UTTERANCE =
  "We're out of time, so we'll wrap up here. Thank you for your feedback!";

export interface FeedbackAgentTurnInput {
  context: Omit<FeedbackPromptContext, "isClosingTurn" | "timeUp">;
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  /** The study's own closing question (Study.closingQuestion); omit or null for the standard one. */
  closingQuestion?: string | null;
  /** A voice call's hard stop in milliseconds, for a study with its own timing; omit for the standard 7 minutes. Typed chats keep their own cap. */
  hardCapMs?: number;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

export type FeedbackAgentStreamEvent =
  { type: "text-delta"; text: string } | { type: "done"; result: FeedbackAgentTurnOutput };

export interface FeedbackAgentTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
  terminationReason: TerminationReason;
  /** True exactly on the turn OPEN_FLOOR_UTTERANCE was appended. */
  openFloorJustAsked: boolean;
}

const channelOf = (input: FeedbackAgentTurnInput): "voice" | "text" =>
  input.context.channel ?? "voice";

/** What marks a turn as containing the closing question: the standard question's key phrases, or a custom question's whole text (ignoring case and spacing). */
type ClosingMatcher = (text: string) => boolean;

function closingMatcher(closing: { utterance: string; isCustom: boolean }): ClosingMatcher {
  if (!closing.isCustom) {
    return (text) => OPEN_FLOOR_FRAGMENTS.every((fragment) => text.includes(fragment));
  }
  const wanted = normalize(closing.utterance);
  const words = wanted.split(" ");
  // A long question also counts as asked when both its opening and ending words are there,
  // in case the provider's transcript words something slightly differently in the middle.
  const head = words.slice(0, 4).join(" ");
  const tail = words.slice(-4).join(" ");
  return (text) => {
    const heard = normalize(text);
    if (heard.includes(wanted)) return true;
    return words.length >= 10 && heard.includes(head) && heard.includes(tail);
  };
}

function wasUtteranceSpoken(history: InterviewTurn[], matches: ClosingMatcher): boolean {
  return history.some((turn) => turn.speaker === "interviewer" && matches(turn.text));
}

function lastInterviewerUtteranceMatches(
  history: InterviewTurn[],
  matches: ClosingMatcher,
): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].speaker === "interviewer") return matches(history[i].text);
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

  /** Text channel only: true once the hard cap has already passed when the turn starts — see FeedbackPromptContext.timeUp. */
  private isTimeUp(input: FeedbackAgentTurnInput, now: Date): boolean {
    return (
      input.context.channel === "text" &&
      now.getTime() - input.interviewStartedAt.getTime() >= feedbackHardCapMs("text")
    );
  }

  /** The cap that applies to this turn: a voice call uses the study's own hard stop when it has one. */
  private hardCapFor(input: FeedbackAgentTurnInput, channel: "voice" | "text"): number {
    return channel === "voice" && input.hardCapMs ? input.hardCapMs : feedbackHardCapMs(channel);
  }

  private finalizeTurn(
    history: InterviewTurn[],
    interviewStartedAt: Date,
    now: Date,
    channel: "voice" | "text",
    isClosingTurn: boolean,
    openFloorAsked: boolean,
    closingUtterance: string,
    hardCapMs: number,
    llmOutput: {
      utterance: string;
      shouldEndInterview: boolean;
      participantRequestedEnd?: boolean;
    },
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
      hardCapMs,
      minParticipantTurnsBeforeLlmCanEnd: 0,
    });
    if (timeCapReason !== null) {
      return {
        utterance:
          timeCapReason === "time-cap" && channel === "text"
            ? `${utterance} ${TEXT_TIME_CAP_UTTERANCE}`
            : utterance,
        isInterviewOver: true,
        terminationReason: timeCapReason,
        openFloorJustAsked: false,
      };
    }

    if (isClosingTurn) {
      // The turn immediately after the open-floor question is a
      // deterministic close — never trusted from the model, same
      // non-negotiable-close principle discovery-type's finalizeTurn
      // applies to its own reactive turns.
      return {
        utterance,
        isInterviewOver: true,
        terminationReason: "llm-self-assessed",
        openFloorJustAsked: false,
      };
    }

    if (shouldEndInterview && !openFloorAsked) {
      // The model believes the feedback-question list is covered. Don't
      // trust it to remember the open-floor closer itself — append the
      // scripted line to whatever it just said, rather than ending.
      // Appended, not substituted: see OPEN_FLOOR_UTTERANCE's doc comment
      // for why substitution can't work on the streaming path.
      return {
        utterance: `${utterance} ${closingUtterance}`,
        isInterviewOver: false,
        terminationReason: null,
        openFloorJustAsked: true,
      };
    }

    return {
      utterance,
      isInterviewOver: false,
      terminationReason: null,
      openFloorJustAsked: false,
    };
  }

  async generateNextTurn(input: FeedbackAgentTurnInput): Promise<FeedbackAgentTurnOutput> {
    const now = input.now ?? new Date();
    const history = input.conversationHistory;
    const closing = resolveClosingQuestion(
      input.closingQuestion,
      input.context.participantFirstName,
    );
    const matches = closingMatcher(closing);
    const openFloorAsked = wasUtteranceSpoken(history, matches);
    const isClosingTurn = openFloorAsked && lastInterviewerUtteranceMatches(history, matches);

    const systemPrompt = buildFeedbackSystemPrompt({
      ...input.context,
      isClosingTurn,
      timeUp: this.isTimeUp(input, now),
      hasCustomClosingQuestion: closing.isCustom,
    });
    const llmOutput = await this.llm.generateInterviewerTurn({
      systemPrompt,
      conversationHistory: history,
    });

    return this.finalizeTurn(
      history,
      input.interviewStartedAt,
      now,
      input.context.channel ?? "voice",
      isClosingTurn,
      openFloorAsked,
      closing.utterance,
      this.hardCapFor(input, channelOf(input)),
      llmOutput,
    );
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
    const closing = resolveClosingQuestion(
      input.closingQuestion,
      input.context.participantFirstName,
    );
    const matches = closingMatcher(closing);
    const openFloorAsked = wasUtteranceSpoken(history, matches);
    const isClosingTurn = openFloorAsked && lastInterviewerUtteranceMatches(history, matches);

    const systemPrompt = buildFeedbackSystemPrompt({
      ...input.context,
      isClosingTurn,
      timeUp: this.isTimeUp(input, now),
      hasCustomClosingQuestion: closing.isCustom,
    });

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

    const channel = input.context.channel ?? "voice";
    const result = this.finalizeTurn(
      history,
      input.interviewStartedAt,
      now,
      channel,
      isClosingTurn,
      openFloorAsked,
      closing.utterance,
      this.hardCapFor(input, channelOf(input)),
      llmOutput,
    );
    if (result.openFloorJustAsked) {
      yield { type: "text-delta", text: ` ${closing.utterance}` };
    }
    if (channel === "text" && result.terminationReason === "time-cap") {
      yield { type: "text-delta", text: ` ${TEXT_TIME_CAP_UTTERANCE}` };
    }

    yield { type: "done", result };
  }
}
