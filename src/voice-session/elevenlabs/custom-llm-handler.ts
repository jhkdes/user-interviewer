import { generateTurn, type GenerateTurnDeps } from "../generate-turn";
import { MissingInterviewIdError } from "../errors";
import { buildStreamingCompletionBody } from "../openai-response";
import { buildEndCallStreamingCompletionBody } from "./sse";
import type { ElevenLabsCustomLlmChatCompletionRequest } from "./types";

/**
 * Handles one turn of ElevenLabs' custom-LLM integration: extracts
 * `interviewId` from `elevenlabs_extra_body` (see types.ts's doc comment on
 * why this is assumed rather than confirmed), delegates to the
 * provider-agnostic generate-turn.ts core, and — since ElevenLabs expects an
 * explicit `end_call` tool call rather than Vapi's exact-phrase matching —
 * builds the tool-call-terminated SSE body once the interview is over.
 */
export async function handleElevenLabsCustomLlmRequest(
  deps: GenerateTurnDeps,
  request: ElevenLabsCustomLlmChatCompletionRequest,
): Promise<string> {
  const interviewId = request.elevenlabs_extra_body?.interviewId;
  if (!interviewId) {
    // TEMPORARY — logging the raw request while confirming the real wire
    // shape against a live agent. Remove once elevenlabs_extra_body's
    // location is confirmed (see types.ts's doc comment).
    console.error("ElevenLabs custom-llm request with no interviewId:", JSON.stringify(request));
    throw new MissingInterviewIdError("ElevenLabs custom-llm chat completion request");
  }

  const { utterance, isInterviewOver } = await generateTurn(deps, {
    interviewId,
    messages: request.messages,
  });

  return isInterviewOver
    ? buildEndCallStreamingCompletionBody(utterance, request.model)
    : buildStreamingCompletionBody(utterance, request.model);
}
