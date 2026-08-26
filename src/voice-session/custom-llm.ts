import type { InterviewAgent } from "@/interview-agent";
import type { InterviewTurn } from "@/llm";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { InterviewNotFoundError, MissingInterviewIdError, StudyNotFoundError } from "./errors";
import type { CustomLLMChatCompletionRequest, OpenAIChatMessage } from "./vapi-types";

/**
 * Appended to the interviewer's final utterance, and must be configured as
 * an `endCallPhrases` entry on the live Vapi assistant (see PROGRESS.md's M6
 * entry) — Vapi hangs up once the assistant says this exact phrase. We
 * append fixed text ourselves rather than relying on the LLM to phrase a
 * consistent sign-off every time, since exact-phrase matching needs exact
 * text.
 */
export const END_CALL_PHRASE = "This concludes our interview session.";

const INTERVIEW_NOUN = /\b(?:interview|call|session)\b/i;
const ENDING_VERB = /\b(?:concludes?|is (?:over|complete|finished)|has (?:ended|concluded))\b/i;

/**
 * Strips any sentence where the LLM's own closing turn already says the
 * interview is ending/over/concluding, despite system-prompt.ts telling it
 * not to. Left in place, wording like this sits directly adjacent to the
 * appended END_CALL_PHRASE and can merge with it into a garbled, non-matching
 * string — which means Vapi's exact-phrase `endCallPhrases` detection never
 * fires and the call never actually hangs up. Requiring both an interview
 * noun and an ending verb in the same sentence (rather than matching either
 * alone) avoids false positives on unrelated sentences that happen to use
 * one of these common words. Applied unconditionally so the phrase Vapi
 * listens for always reaches it as a single, clean sentence, regardless of
 * what the LLM said.
 */
function stripSelfClosingSentences(utterance: string): string {
  const sentences = utterance.match(/[^.!?]*[.!?]|[^.!?]+$/g) ?? [];
  return sentences
    .filter((sentence) => !(INTERVIEW_NOUN.test(sentence) && ENDING_VERB.test(sentence)))
    .join("")
    .trim();
}

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

export interface GenerateTurnOutput {
  utterance: string;
  isInterviewOver: boolean;
}

/**
 * Handles one turn of Vapi's custom-LLM integration (T6.2): resolves the
 * Interview + Study behind the call's `metadata.interviewId`, replays the
 * conversation so far into InterviewAgent (M3) — which owns the system
 * prompt and, on every turn, the hard 15-minute cap (T6.4) via its own
 * termination check — and appends END_CALL_PHRASE once it decides to end.
 */
export async function generateTurn(
  deps: GenerateTurnDeps,
  request: CustomLLMChatCompletionRequest,
): Promise<GenerateTurnOutput> {
  // Top-level `metadata` is where Vapi sends it by default (metadataSendMode:
  // "variable") — `call.assistantOverrides.metadata` is a defensive fallback
  // in case that mode is ever configured differently. See VapiCallMetadata's
  // doc comment in vapi-types.ts.
  const interviewId =
    request.metadata?.interviewId ?? request.call?.assistantOverrides?.metadata?.interviewId;
  if (!interviewId) throw new MissingInterviewIdError("custom-llm chat completion request");

  // TEMPORARY — turn-latency diagnostics (7-10s opening-greeting delay investigation).
  // Remove once the bottleneck is identified and addressed.
  const t0 = Date.now();

  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) throw new InterviewNotFoundError(interviewId);
  const t1 = Date.now();

  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study) throw new StudyNotFoundError(interview.studyId);
  const t2 = Date.now();

  const now = deps.now ?? new Date();
  const { utterance, isInterviewOver } = await deps.interviewAgent.generateNextTurn({
    context: {
      participantFirstName: interview.firstName,
      participantRoleDescription: interview.roleDescription,
      targetProfile: study.targetProfile,
      researchTopic: study.researchTopic,
      customPrompt: study.customPrompt,
    },
    conversationHistory: toConversationHistory(request.messages),
    interviewStartedAt: interview.startedAt ?? interview.createdAt,
    now,
  });
  const t3 = Date.now();

  console.log(
    `[timing] interviewId=${interviewId} interviewLookupMs=${t1 - t0} studyLookupMs=${t2 - t1} generateNextTurnMs=${t3 - t2} totalMs=${t3 - t0}`,
  );

  return {
    utterance: isInterviewOver
      ? `${stripSelfClosingSentences(utterance)} ${END_CALL_PHRASE}`.trim()
      : utterance,
    isInterviewOver,
  };
}
