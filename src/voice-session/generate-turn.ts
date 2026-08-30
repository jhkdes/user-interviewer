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
}

export interface GenerateTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
}

/**
 * Provider-agnostic core of the custom-LLM integration: resolves the
 * Interview + Study behind `interviewId`, replays the conversation so far
 * into InterviewAgent (M3) — which owns the system prompt and, on every
 * turn, the hard 15-minute cap (T6.4) via its own termination check — and
 * returns `isInterviewOver` for the caller to encode however its provider's
 * wire format requires (Vapi: an appended exact-phrase; ElevenLabs: an
 * `end_call` tool call — see each provider's `custom-llm-handler.ts`).
 */
export async function generateTurn(
  deps: GenerateTurnDeps,
  input: GenerateTurnInput,
): Promise<GenerateTurnOutput> {
  const { interviewId } = input;

  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) throw new InterviewNotFoundError(interviewId);

  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study) throw new StudyNotFoundError(interview.studyId);

  const now = deps.now ?? new Date();
  const { utterance, isInterviewOver, timeCheckJustAsked } =
    await deps.interviewAgent.generateNextTurn({
      context: {
        participantFirstName: interview.firstName,
        participantRoleDescription: interview.roleDescription,
        targetProfile: study.targetProfile,
        researchTopic: study.researchTopic,
        customPrompt: study.customPrompt,
        screenerAnswers: interview.screenerAnswers,
      },
      conversationHistory: toConversationHistory(input.messages),
      interviewStartedAt: interview.startedAt ?? interview.createdAt,
      timeCheckAlreadyAsked: interview.timeCheckAskedAt !== null,
      now,
    });

  if (timeCheckJustAsked) {
    await deps.interviewRepo.update(interviewId, { timeCheckAskedAt: now });
  }

  return { utterance, isInterviewOver };
}
