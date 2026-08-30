import type { TranscriptEntry } from "@/domain";
import { completeInterview, startInterview, type CallLifecycleDeps } from "../call-lifecycle";
import { MissingInterviewIdError } from "../errors";
import type {
  ElevenLabsConversationInitiationClientData,
  ElevenLabsPostCallTranscriptionPayload,
  ElevenLabsTranscriptEntry,
  ElevenLabsWebhookPayload,
} from "./types";

/** `dynamicVariables: { interviewId }` passed at session start (elevenlabs-live-call.tsx) — round-tripped back on `post_call_transcription` via `conversation_initiation_client_data.dynamic_variables`, confirmed against a real payload (2026-08-30). `post_call_audio` doesn't carry this at all, but that event is ignored here regardless — see handleElevenLabsWebhookMessage. */
function extractInterviewId(
  clientData: ElevenLabsConversationInitiationClientData | undefined,
): string | undefined {
  const value = clientData?.dynamic_variables?.interviewId;
  return typeof value === "string" ? value : undefined;
}

function toTranscriptEntries(entries: ElevenLabsTranscriptEntry[] | undefined): TranscriptEntry[] {
  const result: TranscriptEntry[] = [];
  for (const entry of entries ?? []) {
    if (!entry.message) continue;
    result.push({
      speaker: entry.role === "agent" ? "interviewer" : "participant",
      text: entry.message,
      timestampMs: Math.round((entry.time_in_call_secs ?? 0) * 1000),
    });
  }
  return result;
}

/**
 * ElevenLabs doesn't document a separate mid-call "call started" webhook the
 * way Vapi's status-update does, so the pending -> in-progress transition
 * (call-lifecycle.ts's startInterview) happens here, immediately before the
 * in-progress -> completed one — both driven off the same post-call event.
 * startInterview is idempotent (no-ops if already started), so this is safe
 * even though it's really "the call already ended" information.
 */
async function handleTranscription(
  deps: CallLifecycleDeps,
  payload: ElevenLabsPostCallTranscriptionPayload,
): Promise<void> {
  const interviewId = extractInterviewId(payload.data.conversation_initiation_client_data);
  if (!interviewId) throw new MissingInterviewIdError(`ElevenLabs "${payload.type}" event`);

  await startInterview(deps, interviewId);
  await completeInterview(deps, {
    interviewId,
    transcript: toTranscriptEntries(payload.data.transcript),
    // Recording is fetched on demand from ElevenLabs' API using
    // elevenLabsConversationId (see src/lib/elevenlabs/client.ts's
    // fetchConversationAudio) rather than delivered via webhook — the
    // post_call_audio webhook's base64 payload gets rejected by Vercel's
    // request-body size limit for any interview of meaningful length.
    recordingUrl: null,
    endedReason: payload.data.analysis?.call_successful ?? null,
    elevenLabsConversationId: payload.data.conversation_id,
  });
}

/**
 * Routes one ElevenLabs post-call webhook to the shared Interview status
 * state machine (call-lifecycle.ts). `post_call_audio` is deliberately
 * ignored here — see handleTranscription's recordingUrl comment — as are any
 * other event types; all are informational no-ops from this handler's
 * perspective.
 */
export async function handleElevenLabsWebhookMessage(
  deps: CallLifecycleDeps,
  payload: ElevenLabsWebhookPayload,
): Promise<void> {
  if (payload.type === "post_call_transcription") {
    await handleTranscription(deps, payload as ElevenLabsPostCallTranscriptionPayload);
  }
}
