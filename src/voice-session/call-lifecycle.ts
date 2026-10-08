import type { EmailClient } from "@/lib/email";
import type { CompletionWebhookClient } from "@/lib/webhook";
import type { LLMProviderAdapter } from "@/llm";
import { notifyCompletionWebhook, sendInterviewSummaryEmail } from "@/notification-service";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import type { SummaryRepository } from "@/repositories/summary-repository";
import { generateIndividualSummary } from "@/summary-service";
import type { NormalizedCallEndedEvent } from "./types";

/**
 * Best-effort deletion of a voice call's recording at the provider. Used only
 * for a call whose interview was restarted as a typing interview, so the
 * discarded audio doesn't linger. Optional: omitted in tests and anywhere
 * that doesn't care, in which case nothing is deleted.
 */
export interface ProviderRecordingCleanup {
  deleteVapiCall?: (vapiCallId: string) => Promise<boolean>;
  deleteElevenLabsConversation?: (conversationId: string) => Promise<boolean>;
}

export interface CallLifecycleDeps {
  interviewRepo: InterviewRepository;
  studyRepo: StudyRepository;
  summaryRepo: SummaryRepository;
  llm: LLMProviderAdapter;
  emailClient: EmailClient;
  /** Optional — omitted in most existing tests/call sites that don't care about the completion webhook. The webhook itself is skipped anyway for the (common) case of an interview with no `trackingId`, so this is a second, coarser skip: no client wired up at all means the feature isn't in play here. */
  webhookClient?: CompletionWebhookClient;
  /** Defaults to `new Date()` — overridable so tests can assert on exact timestamps. */
  now?: Date;
  /** See `ProviderRecordingCleanup`. */
  providerCleanup?: ProviderRecordingCleanup;
  /**
   * Called once when an interview in a study with a report pipeline completes,
   * to start that pipeline. Optional and non-fatal, like the other side effects.
   */
  onReportPipelineInterviewCompleted?: (interviewId: string) => Promise<void>;
}

/**
 * Called by each provider's webhook handler before it touches an interview.
 * Returns true — "ignore this event" — when the interview has been restarted
 * as a typing interview: the event belongs to the voice call that was
 * discarded, and letting it through would start or complete the new typing
 * interview with the old call's data (and send a summary email for it).
 *
 * Events for unknown interviews and for voice interviews return false, so
 * their existing handling (including its errors) is untouched.
 *
 * For the end-of-call events, which carry the provider's call id, this also
 * deletes the discarded call's recording at the provider, best-effort: a
 * failure is logged and never fails the webhook.
 */
export async function shouldIgnoreEventForTypingInterview(
  deps: CallLifecycleDeps,
  interviewId: string,
  call: { vapiCallId?: string; elevenLabsConversationId?: string } = {},
): Promise<boolean> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview || interview.mode !== "text") return false;

  const callDescription =
    call.vapiCallId !== undefined
      ? `Vapi call ${call.vapiCallId}`
      : call.elevenLabsConversationId !== undefined
        ? `ElevenLabs conversation ${call.elevenLabsConversationId}`
        : "a voice event";
  console.log(
    `Ignoring ${callDescription} for interview ${interviewId}: it was restarted as a typing interview.`,
  );

  // Only a call the participant actually discarded (switchedToTextAt is set
  // when they restarted from voice) is ours to delete.
  if (interview.switchedToTextAt) {
    try {
      if (call.vapiCallId !== undefined) {
        await deps.providerCleanup?.deleteVapiCall?.(call.vapiCallId);
      }
      if (call.elevenLabsConversationId !== undefined) {
        await deps.providerCleanup?.deleteElevenLabsConversation?.(call.elevenLabsConversationId);
      }
    } catch (error) {
      console.error(
        `Failed to delete the discarded recording for interview ${interviewId}:`,
        error,
      );
    }
  }
  return true;
}

/**
 * pending -> in-progress transition (T6.3), shared by every provider's
 * webhook handler. A no-op if the interview doesn't exist or has already
 * started, so a repeat "call started" event from any provider doesn't
 * clobber the original startedAt.
 *
 * `startedAt` lets a caller supply the call's real start time when the
 * provider's own webhook reports one (see ElevenLabs' `handleTranscription`,
 * which passes `metadata.start_time_unix_secs`) — ElevenLabs has no separate
 * real-time "call started" event the way Vapi's status-update does, so
 * without this the only timestamp available is "whenever the single
 * post-call webhook happened to arrive," which made `startedAt` and
 * `completedAt` land within milliseconds of each other and every interview
 * duration show as 0:00 regardless of how long the call actually ran.
 * Defaults to `deps.now ?? new Date()` for Vapi's case, where that "now" IS
 * the real start time.
 */
export async function startInterview(
  deps: CallLifecycleDeps,
  interviewId: string,
  startedAt?: Date,
): Promise<void> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview || interview.startedAt) return;

  await deps.interviewRepo.update(interviewId, {
    status: "in-progress",
    startedAt: startedAt ?? deps.now ?? new Date(),
  });
}

/** Names where a completion event came from, for the duplicate-completion warning. */
function describeCompletionSource(event: NormalizedCallEndedEvent): string {
  if (event.source !== undefined) return event.source;
  if (event.vapiCallId !== undefined) return `vapi call ${event.vapiCallId}`;
  if (event.elevenLabsConversationId !== undefined) {
    return `elevenlabs conversation ${event.elevenLabsConversationId}`;
  }
  return "an unidentified source";
}

/**
 * in-progress -> completed transition, plus the individual-summary and
 * summary-email side effects (T7.3, #6) — shared by every provider's webhook
 * handler once it has normalized its own payload shape into a
 * NormalizedCallEndedEvent.
 *
 * Idempotent: the transition is one atomic "update unless already completed"
 * (`updateIfNotCompleted`). If the interview was already completed — a
 * provider re-delivering the same webhook, or two completion paths racing —
 * this logs a warning and returns `false` without rewriting the transcript or
 * re-running the summary, email, and completion webhook. Returns `true` when
 * this call is the one that completed the interview.
 */
export async function completeInterview(
  deps: CallLifecycleDeps,
  event: NormalizedCallEndedEvent,
): Promise<boolean> {
  const completed = await deps.interviewRepo.updateIfNotCompleted(event.interviewId, {
    status: "completed",
    transcript: event.transcript,
    recordingUrl: event.recordingUrl,
    ...(event.vapiCallId !== undefined ? { vapiCallId: event.vapiCallId } : {}),
    ...(event.elevenLabsConversationId !== undefined
      ? { elevenLabsConversationId: event.elevenLabsConversationId }
      : {}),
    completedAt: event.completedAt ?? deps.now ?? new Date(),
    endedReason: event.endedReason,
  });

  if (!completed) {
    const existing = await deps.interviewRepo.getById(event.interviewId);
    console.warn(
      `Ignoring duplicate completion for interview ${event.interviewId}: it is already completed ` +
        `(completedAt=${existing?.completedAt?.toISOString() ?? "unknown"}, ` +
        `original endedReason=${existing?.endedReason ?? "none"}). ` +
        `Incoming event from ${describeCompletionSource(event)}: ` +
        `endedReason=${event.endedReason ?? "none"}. ` +
        `No transcript was written and no summary, email, or completion webhook was triggered.`,
    );
    return false;
  }

  // T7.3: trigger the individual summary automatically on completion. Not
  // fatal to the webhook if it fails — the interview is already correctly
  // marked completed above, and a missing/failed summary is a separate,
  // recoverable problem (no "regenerate summary" ticket exists yet, but
  // failing the whole webhook here would incorrectly suggest the call
  // itself didn't complete).
  let summary: Awaited<ReturnType<typeof generateIndividualSummary>> | undefined;
  try {
    summary = await generateIndividualSummary(deps, event.interviewId);
  } catch (error) {
    console.error(
      `Failed to generate individual summary for interview ${event.interviewId}:`,
      error,
    );
  }

  // #6: email the participant their "here's what you told us" summary once
  // it exists. A separate try/catch from the summary generation above, on
  // the same non-fatal principle — a failed send shouldn't erase the fact
  // that the summary itself was generated successfully, or fail the webhook.
  // Studies with a report pipeline send the participant their report instead,
  // so the generic summary email is skipped for them.
  let reportPipeline = false;
  try {
    const interview = await deps.interviewRepo.getById(event.interviewId);
    const study = interview ? await deps.studyRepo.getById(interview.studyId) : null;
    reportPipeline = Boolean(study?.reportPipeline);
  } catch (error) {
    console.error(
      `Failed to look up the report pipeline for interview ${event.interviewId}:`,
      error,
    );
  }

  if (summary && !reportPipeline) {
    try {
      await sendInterviewSummaryEmail(deps, event.interviewId, summary);
    } catch (error) {
      console.error(`Failed to send summary email for interview ${event.interviewId}:`, error);
    }
  }

  if (reportPipeline && deps.onReportPipelineInterviewCompleted) {
    try {
      await deps.onReportPipelineInterviewCompleted(event.interviewId);
    } catch (error) {
      console.error(
        `Failed to start the report pipeline for interview ${event.interviewId}:`,
        error,
      );
    }
  }

  // Tells a third-party tool (if one registered a webhook URL and this
  // participant's link carried its tracking id) that the interview is done.
  // Same non-fatal posture as the summary/email side effects above.
  if (deps.webhookClient) {
    try {
      const result = await notifyCompletionWebhook(
        { interviewRepo: deps.interviewRepo, webhookClient: deps.webhookClient, now: deps.now },
        event.interviewId,
      );
      console.log(
        result.sent
          ? `Called completion webhook for interview ${event.interviewId}`
          : `Skipped completion webhook for interview ${event.interviewId}: no tracking id`,
      );
    } catch (error) {
      console.error(`Failed to call completion webhook for interview ${event.interviewId}:`, error);
    }
  } else {
    console.log(
      `Skipped completion webhook for interview ${event.interviewId}: no client wired up`,
    );
  }

  return true;
}
