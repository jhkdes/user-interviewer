import type { TranscriptEntry } from "@/domain";
import { uploadCallRecording } from "@/lib/elevenlabs/client";
import { completeInterview, startInterview, type CallLifecycleDeps } from "../call-lifecycle";
import { MissingInterviewIdError } from "../errors";
import type {
  ElevenLabsConversationInitiationClientData,
  ElevenLabsPostCallAudioPayload,
  ElevenLabsPostCallTranscriptionPayload,
  ElevenLabsTranscriptEntry,
  ElevenLabsWebhookPayload,
} from "./types";

/** `dynamicVariables: { interviewId }` passed at session start (elevenlabs-live-call.tsx) — round-tripped back on `post_call_transcription` via `conversation_initiation_client_data.dynamic_variables`, confirmed against a real payload (2026-08-30). `post_call_audio` doesn't carry this at all — see handleAudio. */
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
    recordingUrl: null, // delivered separately via post_call_audio, see handleAudio
    endedReason: payload.data.analysis?.call_successful ?? null,
    elevenLabsConversationId: payload.data.conversation_id,
  });
}

/** Routes one ElevenLabs post-call webhook to the shared Interview status state machine (call-lifecycle.ts) or the recording upload. Other event types are informational no-ops. */
export async function handleElevenLabsWebhookMessage(
  deps: CallLifecycleDeps,
  payload: ElevenLabsWebhookPayload,
): Promise<void> {
  if (payload.type === "post_call_transcription") {
    await handleTranscription(deps, payload as ElevenLabsPostCallTranscriptionPayload);
    return;
  }
  if (payload.type === "post_call_audio") {
    // Unlike post_call_transcription, post_call_audio's real payload carries
    // no `conversation_initiation_client_data`/interviewId at all (confirmed
    // 2026-08-30) — just `conversation_id`. Rather than resolving an
    // interview here (which previously meant depending on
    // post_call_transcription having already landed — a real race we hit in
    // practice, made worse by ElevenLabs only retrying failed
    // *transcription* webhook deliveries, never audio ones), this just
    // uploads the recording keyed by ElevenLabs' own conversation id,
    // unconditionally, regardless of arrival order. The interview detail
    // page derives the storage path at read time from
    // `interview.elevenLabsConversationId` instead of anything stored here.
    const audioPayload = payload as ElevenLabsPostCallAudioPayload;
    await uploadCallRecording(audioPayload.data.conversation_id, audioPayload.data.full_audio);
  }
}
