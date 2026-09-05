import { randomUUID } from "node:crypto";

/**
 * Small, incremental OpenAI-compatible SSE chunk builders for ElevenLabs'
 * custom-LLM streaming protocol — each function returns one already-`data:
 * ...\n\n`-formatted chunk, called repeatedly as text arrives live rather
 * than building one complete body up front (see
 * `elevenlabs/custom-llm-handler.ts`'s `streamElevenLabsCustomLlmResponse`).
 */

function chunkEnvelope(id: string, created: number, model: string, choice: Record<string, unknown>) {
  return { id, object: "chat.completion.chunk", created, model, choices: [choice] };
}

/** A single incremental content delta. `includeRole` should be true only for the very first chunk of a turn. */
export function buildContentDeltaChunk(
  id: string,
  created: number,
  model: string,
  text: string,
  includeRole: boolean,
): string {
  const chunk = chunkEnvelope(id, created, model, {
    index: 0,
    delta: includeRole ? { role: "assistant", content: text } : { content: text },
    finish_reason: null,
  });
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/** Closes out a normal (non-terminal) turn. */
export function buildFinishChunk(id: string, created: number, model: string): string {
  const chunk = chunkEnvelope(id, created, model, { index: 0, delta: {}, finish_reason: "stop" });
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Closes out a turn that ends the interview by invoking ElevenLabs' `end_call`
 * system tool — ElevenLabs hangs up on this tool call rather than Vapi's
 * exact-phrase matching (see vapi/custom-llm-handler.ts). `message` is
 * intentionally omitted from the tool call's arguments since the closing
 * utterance was already streamed as content — passing it too would risk the
 * agent re-speaking a farewell.
 */
export function buildEndCallToolCallChunk(id: string, created: number, model: string): string {
  const chunk = chunkEnvelope(id, created, model, {
    index: 0,
    delta: {
      tool_calls: [
        {
          index: 0,
          id: `call_${randomUUID()}`,
          type: "function",
          function: { name: "end_call", arguments: JSON.stringify({ reason: "interview_complete" }) },
        },
      ],
    },
    finish_reason: "tool_calls",
  });
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export const DONE_CHUNK = "data: [DONE]\n\n";
