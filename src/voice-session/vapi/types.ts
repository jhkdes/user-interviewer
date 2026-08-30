/**
 * Subset of Vapi's payload shapes we actually act on, modeled from
 * https://docs.vapi.ai/server-url/events (Server URL webhooks) and
 * https://docs.vapi.ai/customization/custom-llm/using-your-server (custom
 * LLM requests) as of 2026-08. Other event/field shapes exist on the real
 * payloads (speech-update, function-call, etc.) — we only type what we read,
 * and every object here is otherwise treated as `unknown`/optional so an
 * unfamiliar or slightly different real field doesn't crash parsing. See
 * PROGRESS.md's M6 entry for what's still pending live-call verification.
 */

import type { OpenAIChatMessage } from "../types";

/**
 * Set by us at Vapi call-creation time (M11) via `vapi.start(assistantId, {
 * metadata: { interviewId } })`, so every webhook/custom-LLM request
 * round-trips back to the Interview it belongs to.
 *
 * Where this shows up differs by request type — verified against the real
 * generated types in `@vapi-ai/web`'s `api.d.ts` (`Call`, `CustomLLMModel`),
 * not just docs prose:
 *   - Server URL webhooks (status-update, end-of-call-report): nested at
 *     `call.assistantOverrides.metadata` — `Call` itself has no `metadata`
 *     field, only `assistantOverrides?: AssistantOverrides`.
 *   - Custom-LLM chat-completions requests: a top-level `metadata` field on
 *     the request body (`CustomLLMModel.metadataSendMode` defaults to
 *     `"variable"`, which sends `{ messages, metadata }`), *not* nested
 *     under `call`.
 */
export interface VapiCallMetadata {
  interviewId: string;
}

export interface VapiCall {
  id: string;
  assistantOverrides?: {
    metadata?: VapiCallMetadata;
  };
}

export type VapiCallStatus = "queued" | "ringing" | "in-progress" | "forwarding" | "ended";

export interface VapiStatusUpdateMessage {
  type: "status-update";
  call: VapiCall;
  status: VapiCallStatus;
}

/** A single turn in Vapi's end-of-call artifact. Some Vapi versions include `time`/`secondsFromStart`; neither is guaranteed, so consumers must tolerate their absence. */
export interface VapiArtifactMessage {
  role: "assistant" | "user" | "system" | "bot" | "function_call" | "function_result";
  message?: string;
  secondsFromStart?: number;
  time?: number;
}

export interface VapiEndOfCallReportMessage {
  type: "end-of-call-report";
  call: VapiCall;
  endedReason: string;
  // Current docs nest these under `artifact`; some example integrations put
  // them at the top level instead. We read both — see toTranscriptEntries.
  artifact?: {
    recording?: { stereoUrl?: string; url?: string };
    transcript?: string;
    messages?: VapiArtifactMessage[];
  };
  recordingUrl?: string;
  transcript?: string;
  messages?: VapiArtifactMessage[];
}

/** Any other Vapi server message (conversation-update, transcript, speech-update, etc.) — informational, we don't act on it. */
export interface VapiOtherMessage {
  type: string;
  call?: VapiCall;
}

export type VapiServerMessage =
  VapiStatusUpdateMessage | VapiEndOfCallReportMessage | VapiOtherMessage;

export interface VapiWebhookPayload {
  message: VapiServerMessage;
}

/**
 * The request Vapi sends to our custom-LLM endpoint each turn — an
 * OpenAI-compatible chat completions request. `metadata` carries our
 * `interviewId` at the top level (see VapiCallMetadata's doc comment for
 * why it's not nested under `call` here, unlike the webhook payloads).
 */
export interface VapiCustomLlmChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  stream?: boolean;
  call?: VapiCall;
  metadata?: VapiCallMetadata;
}
