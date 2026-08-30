import type { TranscriptEntry } from "@/domain";
import { completeInterview, startInterview, type CallLifecycleDeps } from "../call-lifecycle";
import { MissingInterviewIdError } from "../errors";
import type {
  VapiArtifactMessage,
  VapiEndOfCallReportMessage,
  VapiServerMessage,
  VapiStatusUpdateMessage,
} from "./types";

const SPEAKER_BY_ROLE: Partial<Record<VapiArtifactMessage["role"], TranscriptEntry["speaker"]>> = {
  assistant: "interviewer",
  bot: "interviewer",
  user: "participant",
};

function toTranscriptEntries(message: VapiEndOfCallReportMessage): TranscriptEntry[] {
  const rawMessages = message.artifact?.messages ?? message.messages ?? [];
  const entries: TranscriptEntry[] = [];

  for (const raw of rawMessages) {
    const speaker = SPEAKER_BY_ROLE[raw.role];
    if (!speaker || !raw.message) continue; // skip function_call/function_result/system entries
    entries.push({
      speaker,
      text: raw.message,
      timestampMs: Math.round((raw.secondsFromStart ?? raw.time ?? 0) * 1000),
    });
  }

  return entries;
}

function toRecordingUrl(message: VapiEndOfCallReportMessage): string | null {
  return (
    message.artifact?.recording?.stereoUrl ??
    message.artifact?.recording?.url ??
    message.recordingUrl ??
    null
  );
}

/**
 * Routes one Vapi Server URL message to the shared Interview status state
 * machine (T6.3, call-lifecycle.ts): pending -> in-progress on the first
 * "in-progress" status-update, in-progress -> completed on
 * end-of-call-report (the only event carrying the final transcript/
 * recording, so it's the sole source of truth for "completed" rather than
 * the "ended" status-update). Other event types (conversation-update,
 * transcript, speech-update, etc.) are informational and intentionally
 * no-ops here.
 */
export async function handleVapiWebhookMessage(
  deps: CallLifecycleDeps,
  message: VapiServerMessage,
): Promise<void> {
  // VapiOtherMessage's `type` is a plain `string` (it stands in for every
  // event shape we don't model), so a `message.type === "..."` check alone
  // can't fully narrow away that member — TS still sees it as possibly
  // matching the literal. The `as` casts below are safe: at this point the
  // discriminant is confirmed equal to the literal, so the value really is
  // shaped like the specific message type, not the untyped catch-all.
  if (message.type === "status-update") {
    const statusMessage = message as VapiStatusUpdateMessage;
    if (statusMessage.status !== "in-progress") return; // "ended" is handled by end-of-call-report, others are non-actionable
    const interviewId = statusMessage.call?.assistantOverrides?.metadata?.interviewId;
    if (!interviewId) throw new MissingInterviewIdError(`Vapi "${message.type}" event`);
    await startInterview(deps, interviewId);
    return;
  }

  if (message.type === "end-of-call-report") {
    const reportMessage = message as VapiEndOfCallReportMessage;
    const interviewId = reportMessage.call?.assistantOverrides?.metadata?.interviewId;
    if (!interviewId) throw new MissingInterviewIdError(`Vapi "${message.type}" event`);
    await completeInterview(deps, {
      interviewId,
      transcript: toTranscriptEntries(reportMessage),
      recordingUrl: toRecordingUrl(reportMessage),
      endedReason: reportMessage.endedReason,
      vapiCallId: reportMessage.call.id,
    });
  }
}
