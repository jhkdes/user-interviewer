import { randomUUID } from "node:crypto";

/**
 * Builds the SSE body ElevenLabs' custom-LLM integration expects when the
 * interview is over: a normal content chunk carrying the closing utterance
 * (so it gets spoken), followed by a `tool_calls` chunk invoking the
 * `end_call` system tool — ElevenLabs hangs up on that tool call rather than
 * Vapi's exact-phrase matching (see vapi/custom-llm-handler.ts). `message`
 * is intentionally omitted from the tool call's arguments since the
 * utterance was already spoken as content — passing it too would risk the
 * agent re-speaking a farewell. NOT yet verified against a real ElevenLabs
 * call (see elevenlabs/types.ts's doc comment) — confirm this round-trips
 * before trusting it with real traffic.
 */
export function buildEndCallStreamingCompletionBody(utterance: string, model: string): string {
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  const contentChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant", content: utterance }, finish_reason: null }],
  };
  const toolCallChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: `call_${randomUUID()}`,
              type: "function",
              function: {
                name: "end_call",
                arguments: JSON.stringify({ reason: "interview_complete" }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };

  return `data: ${JSON.stringify(contentChunk)}\n\ndata: ${JSON.stringify(toolCallChunk)}\n\ndata: [DONE]\n\n`;
}
