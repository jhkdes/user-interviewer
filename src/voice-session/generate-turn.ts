import type { Interview, Study } from "@/domain";
import type { InterviewAgent } from "@/interview-agent";
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
    // spoken conversation InterviewAgent reasons over — it builds its own
    // system prompt from the Interview/Study records instead (see below).
  }
  return history;
}

export interface GenerateTurnDeps {
  interviewAgent: InterviewAgent;
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
  | { type: "done"; utterance: string; isInterviewOver: boolean };

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

function buildAgentInput(
  interview: Interview,
  study: Study,
  messages: OpenAIChatMessage[],
  now: Date,
) {
  return {
    context: {
      participantFirstName: interview.firstName,
      participantRoleDescription: interview.roleDescription,
      targetProfile: study.targetProfile,
      researchTopic: study.researchTopic,
      customPrompt: study.customPrompt,
      screenerAnswers: interview.screenerAnswers,
    },
    conversationHistory: toConversationHistory(messages),
    interviewStartedAt: interview.startedAt ?? interview.createdAt,
    extensionGranted: interview.extensionGranted,
    now,
  };
}

async function persistTurnSideEffects(
  deps: GenerateTurnDeps,
  interviewId: string,
  now: Date,
  result: {
    timeCheckJustAsked: boolean;
    secondTimeCheckJustAsked: boolean;
    extensionDecision?: boolean;
  },
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
}

/**
 * Provider-agnostic core of the custom-LLM integration: resolves the
 * Interview + Study behind `interviewId`, replays the conversation so far
 * into InterviewAgent (M3) — which owns the system prompt and, on every
 * turn, the hard time cap (15 min, or 25 min once the participant has
 * agreed to extend — see interview-agent's termination check) — and returns
 * `isInterviewOver` for the caller to encode however its provider's wire
 * format requires (Vapi: an appended exact-phrase; ElevenLabs: an
 * `end_call` tool call — see each provider's `custom-llm-handler.ts`).
 */
export async function generateTurn(
  deps: GenerateTurnDeps,
  input: GenerateTurnInput,
): Promise<GenerateTurnOutput> {
  const { interview, study } = input.preloaded ?? (await loadInterviewAndStudy(deps, input.interviewId));
  const now = deps.now ?? new Date();

  const result = await deps.interviewAgent.generateNextTurn(
    buildAgentInput(interview, study, input.messages, now),
  );

  await persistTurnSideEffects(deps, input.interviewId, now, result);

  return { utterance: result.utterance, isInterviewOver: result.isInterviewOver };
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
  const { interview, study } = input.preloaded ?? (await loadInterviewAndStudy(deps, input.interviewId));
  const now = deps.now ?? new Date();

  let final: Awaited<ReturnType<InterviewAgent["generateNextTurn"]>> | undefined;
  for await (const event of deps.interviewAgent.generateNextTurnStreaming(
    buildAgentInput(interview, study, input.messages, now),
  )) {
    if (event.type === "text-delta") {
      yield { type: "text-delta", text: event.text };
    } else {
      final = event.result;
    }
  }
  if (!final) {
    throw new Error("generateTurnStreaming: interview agent stream ended without a final result");
  }

  await persistTurnSideEffects(deps, input.interviewId, now, final);

  yield { type: "done", utterance: final.utterance, isInterviewOver: final.isInterviewOver };
}
