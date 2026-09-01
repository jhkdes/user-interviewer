import type { InterviewTurn, LLMProviderAdapter } from "@/llm";
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

function wasUtteranceSpoken(history: InterviewTurn[], utterance: string): boolean {
  return history.some((turn) => turn.speaker === "interviewer" && turn.text === utterance);
}

function lastInterviewerUtterance(history: InterviewTurn[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].speaker === "interviewer") return history[i].text;
  }
  return undefined;
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

  async generateNextTurn(input: InterviewAgentTurnInput): Promise<InterviewAgentTurnOutput> {
    const now = input.now ?? new Date();
    const history = input.conversationHistory;
    const interviewStartedAt = input.interviewStartedAt;

    const firstCheckInAsked = wasUtteranceSpoken(history, TIME_CHECK_UTTERANCE);
    const secondCheckInAsked = wasUtteranceSpoken(history, SECOND_TIME_CHECK_UTTERANCE);
    const lastUtterance = lastInterviewerUtterance(history);

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

    const effectiveHardCapMs = input.extensionGranted === true ? EXTENDED_HARD_CAP_MS : HARD_CAP_MS;

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

    // A decision turn only exists while no decision has been recorded yet —
    // once extensionGranted is persisted, this never fires again, even if a
    // later turn happens to end with TIME_CHECK_UTTERANCE for some reason.
    const isDecisionTurn =
      firstCheckInAsked && input.extensionGranted == null && lastUtterance === TIME_CHECK_UTTERANCE;
    const isFinalWrapTurn = secondCheckInAsked && lastUtterance === SECOND_TIME_CHECK_UTTERANCE;

    const systemPrompt = buildInterviewSystemPrompt({
      ...input.context,
      isDecisionTurn,
      isFinalWrapTurn,
    });

    const { utterance, shouldEndInterview, participantRequestedEnd } =
      await this.llm.generateInterviewerTurn({ systemPrompt, conversationHistory: history });

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

    const terminationReason = checkTermination({
      conversationHistory: history,
      interviewStartedAt,
      now,
      llmSuggestsEnd,
      participantRequestedEnd: participantRequestedEnd ?? false,
      hardCapMs: effectiveHardCapMs,
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
}
