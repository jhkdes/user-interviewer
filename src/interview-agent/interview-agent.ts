import type { InterviewerTurnStreamEvent, InterviewTurn, LLMProviderAdapter } from "@/llm";
import { buildInterviewSystemPrompt, type InterviewPromptContext } from "./system-prompt";
import {
  checkTermination,
  EXTENDED_HARD_CAP_MS,
  EXTENDED_SOFT_CAP_MS,
  HARD_CAP_MS,
  isApproachingTimeLimit,
  type TerminationReason,
} from "./termination";

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

/** Same rationale as TIME_CHECK_UTTERANCE, for the extended interview's final wrap-up — see EXTENDED_SOFT_CAP_MS. */
export const SECOND_TIME_CHECK_UTTERANCE =
  "We're almost at the end of our time together — let's use these last couple minutes to wrap up. Is there anything else important you want to make sure I know before we close?";

export interface InterviewAgentTurnInput {
  context: Omit<InterviewPromptContext, "isDecisionTurn" | "isFinalWrapTurn">;
  conversationHistory: InterviewTurn[];
  interviewStartedAt: Date;
  /**
   * Whether the participant has already agreed (`true`) or declined
   * (`false`) to extend past the base HARD_CAP_MINUTES cap — decided on the
   * turn immediately following TIME_CHECK_UTTERANCE and persisted by the
   * caller as `Interview.extensionGranted` (see `extensionDecision` on the
   * output). `null`/undefined before that decision turn resolves it.
   */
  extensionGranted?: boolean | null;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

export type InterviewAgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "done"; result: InterviewAgentTurnOutput };

export interface InterviewAgentTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
  terminationReason: TerminationReason;
  /** True exactly on the turn TIME_CHECK_UTTERANCE was returned. */
  timeCheckJustAsked: boolean;
  /** True exactly on the turn SECOND_TIME_CHECK_UTTERANCE was returned. */
  secondTimeCheckJustAsked: boolean;
  /** Set exactly on the turn that just resolved the extension decision — the caller should persist this as `Interview.extensionGranted`. `undefined` on every other turn. */
  extensionDecision?: boolean;
}

/**
 * Distinctive fragments of each scripted line, robust to the minor
 * rewording some providers introduce when replaying "what the assistant
 * said" back to us on the next turn. Confirmed via a real Vapi call
 * (2026-09-02): our exact TIME_CHECK_UTTERANCE ("Hey, I want to flag...")
 * came back in the next request's conversation history as "Hey. I wanna
 * flag..." — contractions and punctuation changed, but the substance
 * didn't. Exact string equality never matched, so `firstCheckInAsked`
 * stayed permanently false, the decision turn never triggered, and the
 * interview ran to the un-extended hard cap and got cut off mid-turn.
 * Matching on stable substrings instead survives that kind of rewording.
 */
const TIME_CHECK_FRAGMENTS = ["running a little low on time", "keep going for a few more minutes"];
const SECOND_TIME_CHECK_FRAGMENTS = ["almost at the end of our time together", "wrap up"];

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
 * Drives one turn of a live interview: builds the system prompt, asks the
 * LLM for the next utterance, and applies the pure termination guardrails
 * on top of the LLM's self-assessment. Stateless — the caller (M6's Voice
 * Session Orchestrator) owns and persists conversationHistory between calls.
 *
 * Whether the check-ins have actually been asked is derived from
 * `conversationHistory` itself (the provider's own confirmed record of what
 * was said) rather than a separately-persisted flag — a flag set the moment
 * a scripted line is *generated* can end up permanently "stuck on" for an
 * utterance that was never actually delivered (e.g. the provider retried or
 * dropped that specific turn), leaving every later turn reacting to an
 * exchange the participant never had. Reading it back from history instead
 * is self-correcting: if the line never actually made it into the
 * conversation, this will still be false next turn, and the check-in gets
 * offered again.
 */
export class InterviewAgent {
  constructor(private readonly llm: LLMProviderAdapter) {}

  /**
   * Returns the scripted check-in turn to short-circuit on (never calling
   * the LLM), or `null` if neither applies and the caller should proceed to
   * a normal LLM-driven turn. Shared by both `generateNextTurn` and
   * `generateNextTurnStreaming` — the scripted turns are identical either
   * way, just delivered as one immediate text-delta on the streaming path.
   */
  private resolveScriptedTurn(
    input: InterviewAgentTurnInput,
    history: InterviewTurn[],
    now: Date,
    interviewStartedAt: Date,
  ): InterviewAgentTurnOutput | null {
    const firstCheckInAsked = wasUtteranceSpoken(history, TIME_CHECK_FRAGMENTS);
    const secondCheckInAsked = wasUtteranceSpoken(history, SECOND_TIME_CHECK_FRAGMENTS);

    // ---- First check-in: inject once the soft cap is reached, if not already asked ----
    if (!firstCheckInAsked && isApproachingTimeLimit({ interviewStartedAt, now })) {
      // Still subject to the hard cap even on this scripted turn — an
      // unusually slow prior turn could mean we're already past it by the
      // time we get here, in which case the LLM path below closes things
      // out properly instead of asking a check-in question no one has time
      // to answer. Extension is never granted yet at this point, so the
      // base cap always applies here.
      const terminationReason = checkTermination({
        conversationHistory: history,
        interviewStartedAt,
        now,
        llmSuggestsEnd: false,
        participantRequestedEnd: false,
        hardCapMs: HARD_CAP_MS,
      });
      if (terminationReason === null) {
        return {
          utterance: TIME_CHECK_UTTERANCE,
          isInterviewOver: false,
          terminationReason: null,
          timeCheckJustAsked: true,
          secondTimeCheckJustAsked: false,
        };
      }
    }

    // ---- Second check-in: only once the participant has agreed to extend ----
    if (
      input.extensionGranted === true &&
      !secondCheckInAsked &&
      isApproachingTimeLimit({ interviewStartedAt, now, softCapMs: EXTENDED_SOFT_CAP_MS })
    ) {
      const terminationReason = checkTermination({
        conversationHistory: history,
        interviewStartedAt,
        now,
        llmSuggestsEnd: false,
        participantRequestedEnd: false,
        hardCapMs: EXTENDED_HARD_CAP_MS,
      });
      if (terminationReason === null) {
        return {
          utterance: SECOND_TIME_CHECK_UTTERANCE,
          isInterviewOver: false,
          terminationReason: null,
          timeCheckJustAsked: false,
          secondTimeCheckJustAsked: true,
        };
      }
    }

    return null;
  }

  private computeTurnFlags(
    history: InterviewTurn[],
    extensionGranted: boolean | null | undefined,
  ): { isDecisionTurn: boolean; isFinalWrapTurn: boolean } {
    const firstCheckInAsked = wasUtteranceSpoken(history, TIME_CHECK_FRAGMENTS);
    const secondCheckInAsked = wasUtteranceSpoken(history, SECOND_TIME_CHECK_FRAGMENTS);

    // A decision turn only exists while no decision has been recorded yet —
    // once extensionGranted is persisted, this never fires again, even if a
    // later turn happens to match TIME_CHECK_FRAGMENTS for some reason.
    const isDecisionTurn =
      firstCheckInAsked &&
      extensionGranted == null &&
      lastInterviewerUtteranceMatches(history, TIME_CHECK_FRAGMENTS);
    const isFinalWrapTurn =
      secondCheckInAsked && lastInterviewerUtteranceMatches(history, SECOND_TIME_CHECK_FRAGMENTS);

    return { isDecisionTurn, isFinalWrapTurn };
  }

  /**
   * Combines the LLM's raw output with the pure termination heuristics
   * (extension-decision-from-utterance-shape, `checkTermination`) into the
   * final turn output. Shared, unmodified logic for both call paths — the
   * streaming path calls this only once the underlying stream has fully
   * resolved (utterance text and decision flags both known).
   */
  private finalizeTurn(
    input: InterviewAgentTurnInput,
    history: InterviewTurn[],
    interviewStartedAt: Date,
    now: Date,
    isDecisionTurn: boolean,
    isFinalWrapTurn: boolean,
    llmOutput: { utterance: string; shouldEndInterview: boolean; participantRequestedEnd?: boolean },
  ): InterviewAgentTurnOutput {
    const { utterance, shouldEndInterview, participantRequestedEnd } = llmOutput;
    let llmSuggestsEnd = shouldEndInterview;
    let extensionDecision: boolean | undefined;

    // On both reactive turns, the model is constrained to exactly two
    // shapes by the guidance above: a genuine follow-up question (ends with
    // "?") or a closing statement (doesn't). Empirically (verified against
    // the real API) the model sometimes produces a clearly closing utterance
    // while still leaving shouldEndInterview: false — detecting from the
    // utterance shape itself is more reliable than trusting the flag alone,
    // scoped tightly to these two turns; elsewhere a non-question utterance
    // is normal and not a signal of anything.
    if (isDecisionTurn) {
      extensionDecision = utterance.trim().endsWith("?");
      if (!extensionDecision) llmSuggestsEnd = true;
    } else if (isFinalWrapTurn) {
      if (!utterance.trim().endsWith("?")) llmSuggestsEnd = true;
    }

    // Re-derive the cap for *this* turn's termination check using the
    // decision just made, not the value read from the DB at the top of the
    // request. input.extensionGranted reflects only what a *previous* turn
    // persisted — on the decision turn itself, the participant's "yes, I can
    // keep going" is being processed right now, so checking against the
    // stale un-extended cap could force an immediate cutoff on the very
    // question meant to confirm the extension worked (confirmed via a real
    // ElevenLabs call, 2026-09-02: the interviewer asked one more question
    // and `end_call` fired before the participant could ever answer).
    const grantedForThisTurn = extensionDecision ?? input.extensionGranted;
    const hardCapMs = grantedForThisTurn === true ? EXTENDED_HARD_CAP_MS : HARD_CAP_MS;

    const terminationReason = checkTermination({
      conversationHistory: history,
      interviewStartedAt,
      now,
      llmSuggestsEnd,
      participantRequestedEnd: participantRequestedEnd ?? false,
      hardCapMs,
    });

    return {
      utterance,
      isInterviewOver: terminationReason !== null,
      terminationReason,
      timeCheckJustAsked: false,
      secondTimeCheckJustAsked: false,
      extensionDecision,
    };
  }

  async generateNextTurn(input: InterviewAgentTurnInput): Promise<InterviewAgentTurnOutput> {
    const now = input.now ?? new Date();
    const history = input.conversationHistory;
    const interviewStartedAt = input.interviewStartedAt;

    const scripted = this.resolveScriptedTurn(input, history, now, interviewStartedAt);
    if (scripted) return scripted;

    const { isDecisionTurn, isFinalWrapTurn } = this.computeTurnFlags(
      history,
      input.extensionGranted,
    );
    const systemPrompt = buildInterviewSystemPrompt({
      ...input.context,
      isDecisionTurn,
      isFinalWrapTurn,
    });

    const llmOutput = await this.llm.generateInterviewerTurn({ systemPrompt, conversationHistory: history });

    return this.finalizeTurn(
      input,
      history,
      interviewStartedAt,
      now,
      isDecisionTurn,
      isFinalWrapTurn,
      llmOutput,
    );
  }

  /**
   * Streaming counterpart to `generateNextTurn`, used by the ElevenLabs
   * voice-session path. Yields `text-delta` events as the utterance is
   * generated (or, for the scripted check-in turns, immediately as a single
   * chunk — those never call the LLM, so there's nothing to stream), then a
   * terminal `done` event carrying the same `InterviewAgentTurnOutput` that
   * `generateNextTurn` would return. Termination heuristics are shared via
   * `finalizeTurn`/`resolveScriptedTurn` — no duplicated logic.
   */
  async *generateNextTurnStreaming(
    input: InterviewAgentTurnInput,
  ): AsyncGenerator<InterviewAgentStreamEvent, void, unknown> {
    const now = input.now ?? new Date();
    const history = input.conversationHistory;
    const interviewStartedAt = input.interviewStartedAt;

    const scripted = this.resolveScriptedTurn(input, history, now, interviewStartedAt);
    if (scripted) {
      yield { type: "text-delta", text: scripted.utterance };
      yield { type: "done", result: scripted };
      return;
    }

    const { isDecisionTurn, isFinalWrapTurn } = this.computeTurnFlags(
      history,
      input.extensionGranted,
    );
    const systemPrompt = buildInterviewSystemPrompt({
      ...input.context,
      isDecisionTurn,
      isFinalWrapTurn,
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

    yield {
      type: "done",
      result: this.finalizeTurn(
        input,
        history,
        interviewStartedAt,
        now,
        isDecisionTurn,
        isFinalWrapTurn,
        llmOutput,
      ),
    };
  }
}
