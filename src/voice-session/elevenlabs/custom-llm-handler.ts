import { randomUUID } from "node:crypto";
import type { Interview, Study } from "@/domain";
import { generateTurnStreaming, loadInterviewAndStudy, type GenerateTurnDeps } from "../generate-turn";
import { MissingInterviewIdError } from "../errors";
import { buildContentDeltaChunk, buildEndCallToolCallChunk, buildFinishChunk, DONE_CHUNK } from "./sse";
import type { ElevenLabsCustomLlmChatCompletionRequest } from "./types";

/**
 * Resolves everything that can be validated before opening the SSE stream —
 * `interviewId` presence plus the Interview/Study it points at — so the
 * route handler can `await` this and still return a clean JSON error for
 * those failure classes, exactly as before this change, instead of opening
 * a stream that immediately closes with no chunks. See
 * `streamElevenLabsCustomLlmResponse` for the part that can only fail once
 * the stream (and the Claude call) is already underway.
 */
export async function resolveElevenLabsStreamContext(
  deps: GenerateTurnDeps,
  request: ElevenLabsCustomLlmChatCompletionRequest,
): Promise<{ interviewId: string; interview: Interview; study: Study }> {
  const interviewId = request.elevenlabs_extra_body?.interviewId;
  if (!interviewId) {
    // TEMPORARY — logging the raw request while confirming the real wire
    // shape against a live agent. Remove once elevenlabs_extra_body's
    // location is confirmed (see types.ts's doc comment).
    console.error("ElevenLabs custom-llm request with no interviewId:", JSON.stringify(request));
    throw new MissingInterviewIdError("ElevenLabs custom-llm chat completion request");
  }

  const { interview, study } = await loadInterviewAndStudy(deps, interviewId);
  return { interviewId, interview, study };
}

/**
 * Streams one turn of ElevenLabs' custom-LLM integration as already
 * SSE-formatted strings: forwards each utterance text-delta from the
 * provider-agnostic `generateTurnStreaming` core live as a content-delta
 * chunk (so TTS can start speaking before the full utterance is known),
 * then closes with either a plain finish chunk or — since ElevenLabs
 * expects an explicit `end_call` tool call rather than Vapi's exact-phrase
 * matching — the tool-call-terminated chunk once the interview is over.
 */
export async function* streamElevenLabsCustomLlmResponse(
  deps: GenerateTurnDeps,
  request: ElevenLabsCustomLlmChatCompletionRequest,
  context: { interviewId: string; interview: Interview; study: Study },
): AsyncGenerator<string, void, unknown> {
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let includeRole = true;
  let isInterviewOver = false;

  for await (const event of generateTurnStreaming(deps, {
    interviewId: context.interviewId,
    messages: request.messages,
    preloaded: { interview: context.interview, study: context.study },
  })) {
    if (event.type === "text-delta") {
      yield buildContentDeltaChunk(id, created, request.model, event.text, includeRole);
      includeRole = false;
    } else {
      isInterviewOver = event.isInterviewOver;
    }
  }

  yield isInterviewOver
    ? buildEndCallToolCallChunk(id, created, request.model)
    : buildFinishChunk(id, created, request.model);
  yield DONE_CHUNK;
}
