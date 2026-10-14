import type { Interview, Study } from "@/domain";
import type { FeedbackAgent } from "@/interview-agent/feedback-agent";
import type { InterviewAgent } from "@/interview-agent/interview-agent";
import {
  createOneQuestionLimiter,
  limitToOneQuestion,
  oneQuestionPerTurnEnabled,
} from "@/interview-agent/one-question";
import type { TerminationReason } from "@/interview-agent/termination";
import type { InterviewTurn } from "@/llm";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { InterviewNotFoundError, StudyNotFoundError } from "./errors";
import type { OpenAIChatMessage } from "./types";

function toConversationHistory(messages: OpenAIChatMessage[]): InterviewTurn[] {
  const history: InterviewTurn[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      history.push({ speaker: "interviewer", text: message.content ?? "" });
    } else if (message.role === "user") {
      history.push({ speaker: "participant", text: message.content ?? "" });
    }
    // system/tool/function_call/function_result entries aren't part of the
    // spoken conversation the agent reasons over — it builds its own system
    // prompt from the Interview/Study records instead (see below).
  }
  return history;
}

export interface GenerateTurnDeps {
  interviewAgent: InterviewAgent;
  feedbackAgent: FeedbackAgent;
  interviewRepo: InterviewRepository;
  studyRepo: StudyRepository;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

export interface GenerateTurnInput {
  interviewId: string;
  messages: OpenAIChatMessage[];
  /**
   * Pre-resolved Interview/Study, when the caller already validated
   * `interviewId` eagerly (e.g. `resolveElevenLabsStreamContext`, so a bad
   * request fails before an SSE stream opens) — skips the redundant DB
   * lookup this function would otherwise do itself.
   */
  preloaded?: { interview: Interview; study: Study };
}

export interface GenerateTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
}

export type GenerateTurnStreamEvent =
  | { type: "text-delta"; text: string }
  | {
      type: "done";
      utterance: string;
      isInterviewOver: boolean;
      /** Why the interview ended, when `isInterviewOver` — lets the text-mode caller record a specific `endedReason`. `null` when it didn't end. */
      terminationReason: TerminationReason;
    };

/** Resolves the Interview + Study behind `interviewId`, shared by `generateTurn` and `generateTurnStreaming`. */
export async function loadInterviewAndStudy(
  deps: GenerateTurnDeps,
  interviewId: string,
): Promise<{ interview: Interview; study: Study }> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) throw new InterviewNotFoundError(interviewId);

  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study) throw new StudyNotFoundError(interview.studyId);

  return { interview, study };
}

function buildDiscoveryAgentInput(
  interview: Interview,
  study: Study,
  messages: OpenAIChatMessage[],
  now: Date,
) {
  return {
    context: {
      participantFirstName: interview.firstName,
      participantRoleDescription: interview.roleDescription,
      studyTitle: study.title,
      studyDescription: study.description,
      researchTopic: study.researchTopic,
      customPrompt: study.customPrompt,
      screenerAnswers: interview.screenerAnswers,
      // Voice interviews keep today's spoken prompt; typed interviews (the
      // study's text link) get the written-chat variant (see system-prompt.ts).
      channel: interview.mode,
    },
    conversationHistory: toConversationHistory(messages),
    interviewStartedAt: interview.startedAt ?? interview.createdAt,
    extensionGranted: interview.extensionGranted,
    now,
  };
}

function buildFeedbackAgentInput(
  interview: Interview,
  study: Study,
  messages: OpenAIChatMessage[],
  now: Date,
) {
  return {
    context: {
      participantFirstName: interview.firstName,
      studyTitle: study.title,
      studyDescription: study.description,
      feedbackQuestions: study.feedbackQuestions,
      customPrompt: study.customPrompt,
      // Voice interviews keep today's spoken prompt; text-mode interviews get
      // the written-chat variant (see feedback-system-prompt.ts).
      channel: interview.mode,
    },
    conversationHistory: toConversationHistory(messages),
    interviewStartedAt: interview.startedAt ?? interview.createdAt,
    now,
  };
}

interface TurnSideEffects {
  timeCheckJustAsked?: boolean;
  secondTimeCheckJustAsked?: boolean;
  extensionDecision?: boolean;
  openFloorJustAsked?: boolean;
}

async function persistTurnSideEffects(
  deps: GenerateTurnDeps,
  interviewId: string,
  now: Date,
  result: TurnSideEffects,
): Promise<void> {
  if (result.timeCheckJustAsked) {
    await deps.interviewRepo.update(interviewId, { timeCheckAskedAt: now });
  }
  if (result.secondTimeCheckJustAsked) {
    await deps.interviewRepo.update(interviewId, { secondTimeCheckAskedAt: now });
  }
  if (result.extensionDecision !== undefined) {
    await deps.interviewRepo.update(interviewId, { extensionGranted: result.extensionDecision });
  }
  if (result.openFloorJustAsked) {
    await deps.interviewRepo.update(interviewId, { openFloorAskedAt: now });
  }
}

/**
 * Provider-agnostic core of the custom-LLM integration: resolves the
 * Interview + Study behind `interviewId`, replays the conversation so far
 * into whichever agent matches `study.type` — InterviewAgent for discovery
 * (owns the system prompt and, on every turn, the hard time cap: 15 min, or
 * 25 min once the participant has agreed to extend) or FeedbackAgent for
 * feedback (a single 7-minute hard cap, no extension) — and returns
 * `isInterviewOver` for the caller to encode however its provider's wire
 * format requires (Vapi: an appended exact-phrase; ElevenLabs: an
 * `end_call` tool call — see each provider's `custom-llm-handler.ts`).
 */
/**
 * Whether this interview's spoken replies are cut after their first question.
 * Discovery voice interviews only: a feedback interview appends its own
 * scripted "anything else you'd like to add?" question to the model's reply,
 * which a cut would remove, and a typed chat gets its one-question rule from
 * the prompt instead. Turned off by ONE_QUESTION_PER_TURN=false.
 */
function limitsToOneQuestion(study: Study, interview: Interview): boolean {
  return study.type !== "feedback" && interview.mode !== "text" && oneQuestionPerTurnEnabled();
}

export async function generateTurn(
  deps: GenerateTurnDeps,
  input: GenerateTurnInput,
): Promise<GenerateTurnOutput> {
  const { interview, study } =
    input.preloaded ?? (await loadInterviewAndStudy(deps, input.interviewId));
  const now = deps.now ?? new Date();

  const result =
    study.type === "feedback"
      ? await deps.feedbackAgent.generateNextTurn(
          buildFeedbackAgentInput(interview, study, input.messages, now),
        )
      : await deps.interviewAgent.generateNextTurn(
          buildDiscoveryAgentInput(interview, study, input.messages, now),
        );

  await persistTurnSideEffects(deps, input.interviewId, now, result);

  const utterance = limitsToOneQuestion(study, interview)
    ? limitToOneQuestion(result.utterance)
    : result.utterance;
  return { utterance, isInterviewOver: result.isInterviewOver };
}

/**
 * Streaming counterpart to `generateTurn`, used by the ElevenLabs
 * voice-session path — yields `text-delta` events as the utterance is
 * generated, then a terminal `done` event once the decision is known. The
 * DB side-effect writes happen at the same point as `generateTurn` (after
 * the decision is known), so they never delay any token the participant
 * hears — only the trailing finish/`end_call` SSE chunk.
 */
export async function* generateTurnStreaming(
  deps: GenerateTurnDeps,
  input: GenerateTurnInput,
): AsyncGenerator<GenerateTurnStreamEvent, void, unknown> {
  const { interview, study } =
    input.preloaded ?? (await loadInterviewAndStudy(deps, input.interviewId));
  const now = deps.now ?? new Date();
  // Spoken replies are cut after their first question (see one-question.ts).
  const limiter = limitsToOneQuestion(study, interview) ? createOneQuestionLimiter() : null;
  const speak = (piece: string) => (limiter ? limiter.push(piece) : piece);

  let final:
    | (TurnSideEffects & {
        utterance: string;
        isInterviewOver: boolean;
        terminationReason: TerminationReason;
      })
    | undefined;

  if (study.type === "feedback") {
    for await (const event of deps.feedbackAgent.generateNextTurnStreaming(
      buildFeedbackAgentInput(interview, study, input.messages, now),
    )) {
      if (event.type === "text-delta") {
        const text = speak(event.text);
        // An empty piece is still forwarded; only text after the first question is dropped.
        if (text || !event.text) yield { type: "text-delta", text };
      } else {
        final = event.result;
      }
    }
  } else {
    for await (const event of deps.interviewAgent.generateNextTurnStreaming(
      buildDiscoveryAgentInput(interview, study, input.messages, now),
    )) {
      if (event.type === "text-delta") {
        const text = speak(event.text);
        // An empty piece is still forwarded; only text after the first question is dropped.
        if (text || !event.text) yield { type: "text-delta", text };
      } else {
        final = event.result;
      }
    }
  }

  if (!final) {
    throw new Error("generateTurnStreaming: interview agent stream ended without a final result");
  }

  await persistTurnSideEffects(deps, input.interviewId, now, final);

  yield {
    type: "done",
    utterance: limiter ? limitToOneQuestion(final.utterance) : final.utterance,
    isInterviewOver: final.isInterviewOver,
    terminationReason: final.terminationReason,
  };
}
