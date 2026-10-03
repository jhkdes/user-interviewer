import type { InterviewMessage } from "@/domain";
import type { OpenAIChatMessage } from "@/voice-session/types";

/**
 * Maps stored text-interview messages (ordered by `seq`) to the
 * OpenAI-style chat messages `generateTurn` / `generateTurnStreaming` take,
 * so text mode reuses the voice-session turn generation unchanged.
 */
export function messagesToOpenAI(
  messages: Pick<InterviewMessage, "speaker" | "text">[],
): OpenAIChatMessage[] {
  return messages.map((message) => ({
    role: message.speaker === "interviewer" ? "assistant" : "user",
    content: message.text,
  }));
}
