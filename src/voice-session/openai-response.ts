import { randomUUID } from "node:crypto";

/**
 * Builds a single-chunk OpenAI-compatible streaming chat-completion body
 * (SSE), the format Vapi's custom-LLM integration expects back. We don't
 * token-stream — InterviewAgent's structured-output call to Claude (M2/M3,
 * needed to reliably get `shouldEndInterview` and reject degenerate
 * responses) isn't naturally streamable — so the whole utterance is sent as
 * one content delta chunk, immediately followed by the finish chunk. This
 * trades away incremental TTS start latency for the structured-output
 * reliability M2/M3 already chose; see PROGRESS.md's M6 entry.
 */
export function buildStreamingCompletionBody(utterance: string, model: string): string {
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  const contentChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant", content: utterance }, finish_reason: null }],
  };
  const finalChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };

  return `data: ${JSON.stringify(contentChunk)}\n\ndata: ${JSON.stringify(finalChunk)}\n\ndata: [DONE]\n\n`;
}
