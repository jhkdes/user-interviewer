import type { TranscriptEntry } from "@/domain";
import type { EmailClient } from "@/lib/email";
import type { LLMProviderAdapter } from "@/llm";
import { sendInterviewSummaryEmail } from "@/notification-service";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { SummaryRepository } from "@/repositories/summary-repository";
import { generateIndividualSummary } from "@/summary-service";
import { MissingInterviewIdError } from "./errors";
import type {
  VapiArtifactMessage,
  VapiEndOfCallReportMessage,
  VapiServerMessage,
  VapiStatusUpdateMessage,
} from "./vapi-types";

export interface HandleVapiWebhookDeps {
  interviewRepo: InterviewRepository;
  summaryRepo: SummaryRepository;
  llm: LLMProviderAdapter;
  emailClient: EmailClient;
  /** Defaults to `new Date()` — overridable so tests can assert on exact timestamps. */
  now?: Date;
}

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

async function handleStatusUpdate(
  deps: HandleVapiWebhookDeps,
  message: VapiStatusUpdateMessage,
  interviewId: string,
): Promise<void> {
  if (message.status !== "in-progress") return; // "ended" is handled by end-of-call-report, others are non-actionable

  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview || interview.startedAt) return; // already started — don't clobber the original startedAt on a repeat event

  await deps.interviewRepo.update(interviewId, {
    status: "in-progress",
    startedAt: deps.now ?? new Date(),
  });
}

async function handleEndOfCallReport(
  deps: HandleVapiWebhookDeps,
  message: VapiEndOfCallReportMessage,
  interviewId: string,
): Promise<void> {
  await deps.interviewRepo.update(interviewId, {
    status: "completed",
    transcript: toTranscriptEntries(message),
    recordingUrl: toRecordingUrl(message),
    vapiCallId: message.call.id,
    completedAt: deps.now ?? new Date(),
    endedReason: message.endedReason,
  });

  // T7.3: trigger the individual summary automatically on completion. Not
  // fatal to the webhook if it fails — the interview is already correctly
  // marked completed above, and a missing/failed summary is a separate,
  // recoverable problem (no "regenerate summary" ticket exists yet, but
  // failing the whole webhook here would incorrectly suggest the call
  // itself didn't complete).
  let summary: Awaited<ReturnType<typeof generateIndividualSummary>> | undefined;
  try {
    summary = await generateIndividualSummary(deps, interviewId);
  } catch (error) {
    console.error(`Failed to generate individual summary for interview ${interviewId}:`, error);
  }

  // #6: email the participant their "here's what you told us" summary once
  // it exists. A separate try/catch from the summary generation above, on
  // the same non-fatal principle — a failed send shouldn't erase the fact
  // that the summary itself was generated successfully, or fail the webhook.
  if (summary) {
    try {
      await sendInterviewSummaryEmail(deps, interviewId, summary);
    } catch (error) {
      console.error(`Failed to send summary email for interview ${interviewId}:`, error);
    }
  }
}

/**
 * Routes one Vapi Server URL message to the Interview status state machine
 * (T6.3): pending → in-progress on the first "in-progress" status-update,
 * in-progress → completed on end-of-call-report (the only event carrying
 * the final transcript/recording, so it's the sole source of truth for
 * "completed" rather than the "ended" status-update). Other event types
 * (conversation-update, transcript, speech-update, etc.) are informational
 * and intentionally no-ops here.
 */
export async function handleVapiWebhookMessage(
  deps: HandleVapiWebhookDeps,
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
    const interviewId = statusMessage.call?.assistantOverrides?.metadata?.interviewId;
    if (!interviewId) throw new MissingInterviewIdError(`"${message.type}" event`);
    await handleStatusUpdate(deps, statusMessage, interviewId);
    return;
  }

  if (message.type === "end-of-call-report") {
    const reportMessage = message as VapiEndOfCallReportMessage;
    const interviewId = reportMessage.call?.assistantOverrides?.metadata?.interviewId;
    if (!interviewId) throw new MissingInterviewIdError(`"${message.type}" event`);
    await handleEndOfCallReport(deps, reportMessage, interviewId);
  }
}
