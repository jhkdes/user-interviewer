/**
 * ElevenLabs Conversational AI payload shapes we act on. Confirmed against a
 * real captured payload (2026-08-30), not just docs prose:
 * `post_call_transcription` carries `interviewId` at
 * `data.conversation_initiation_client_data.dynamic_variables.interviewId`
 * (also duplicated at `.custom_llm_extra_body.interviewId`) exactly as
 * assumed. `post_call_audio`, however, does NOT — its real payload is just
 * `{ agent_id, agent_name, conversation_id, user_id, full_audio }`, no
 * `conversation_initiation_client_data` at all. See
 * elevenlabs/webhook-handler.ts's `handleAudio` for how it resolves the
 * interview instead (via `conversation_id`, matched against
 * `elevenLabsConversationId` set by the earlier transcription webhook).
 */

import type { OpenAIChatMessage } from "../types";

/**
 * ElevenLabs' custom-LLM request body — OpenAI-compatible chat completions,
 * with `tools` including the `end_call` system tool when configured on the
 * agent. `elevenlabs_extra_body` carries whatever object the client SDK
 * passed as `customLlmExtraBody` at session start (elevenlabs-live-call.tsx
 * sets `{ interviewId }`).
 */
export interface ElevenLabsCustomLlmChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  tools?: unknown[];
  elevenlabs_extra_body?: Record<string, unknown> & { interviewId?: string };
}

export interface ElevenLabsTranscriptEntry {
  role: "agent" | "user";
  message?: string | null;
  time_in_call_secs?: number;
}

/** Custom data passed at session start via the client SDK's `dynamicVariables` — round-tripped back to us on both post-call webhook types. */
export interface ElevenLabsConversationInitiationClientData {
  dynamic_variables?: Record<string, string | number | boolean>;
}

export interface ElevenLabsPostCallTranscriptionPayload {
  type: "post_call_transcription";
  event_timestamp?: number;
  data: {
    agent_id?: string;
    conversation_id: string;
    transcript?: ElevenLabsTranscriptEntry[];
    conversation_initiation_client_data?: ElevenLabsConversationInitiationClientData;
    metadata?: { start_time_unix_secs?: number; call_duration_secs?: number };
    analysis?: { call_successful?: string };
  };
}

/** Confirmed real shape — no `conversation_initiation_client_data`/`dynamic_variables`, unlike the transcription payload. */
export interface ElevenLabsPostCallAudioPayload {
  type: "post_call_audio";
  data: {
    agent_id?: string;
    conversation_id: string;
    /** Base64-encoded MP3 of the full call recording. */
    full_audio: string;
  };
}

/** Any other ElevenLabs webhook type — informational, we don't act on it. */
export interface ElevenLabsOtherWebhookPayload {
  type: string;
}

export type ElevenLabsWebhookPayload =
  | ElevenLabsPostCallTranscriptionPayload
  | ElevenLabsPostCallAudioPayload
  | ElevenLabsOtherWebhookPayload;
