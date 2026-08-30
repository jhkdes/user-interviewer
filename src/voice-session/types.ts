import type { TranscriptEntry } from "@/domain";

/** Shared OpenAI-compatible chat message shape — both Vapi's and ElevenLabs' custom-LLM integrations send this. */
export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "function_call" | "function_result";
  content?: string | null;
}

/**
 * A provider-agnostic view of "the call ended" — each provider's webhook
 * handler maps its own payload shape into this before calling
 * call-lifecycle.ts's `completeInterview`. `vapiCallId`/`elevenLabsConversationId`
 * are optional and mutually exclusive — only the field for the provider that
 * actually ran the call is set.
 */
export interface NormalizedCallEndedEvent {
  interviewId: string;
  transcript: TranscriptEntry[];
  recordingUrl: string | null;
  endedReason: string | null;
  vapiCallId?: string;
  elevenLabsConversationId?: string;
}
