import type { EmailClient } from "@/lib/email";
import type { LLMProviderAdapter } from "@/llm";
import { sendInterviewSummaryEmail } from "@/notification-service";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { SummaryRepository } from "@/repositories/summary-repository";
import { generateIndividualSummary } from "@/summary-service";
import type { NormalizedCallEndedEvent } from "./types";

export interface CallLifecycleDeps {
  interviewRepo: InterviewRepository;
  summaryRepo: SummaryRepository;
  llm: LLMProviderAdapter;
  emailClient: EmailClient;
  /** Defaults to `new Date()` — overridable so tests can assert on exact timestamps. */
  now?: Date;
}

/**
 * pending -> in-progress transition (T6.3), shared by every provider's
 * webhook handler. A no-op if the interview doesn't exist or has already
 * started, so a repeat "call started" event from any provider doesn't
 * clobber the original startedAt.
 */
export async function startInterview(deps: CallLifecycleDeps, interviewId: string): Promise<void> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview || interview.startedAt) return;

  await deps.interviewRepo.update(interviewId, {
    status: "in-progress",
    startedAt: deps.now ?? new Date(),
  });
}

/**
 * in-progress -> completed transition, plus the individual-summary and
 * summary-email side effects (T7.3, #6) — shared by every provider's webhook
 * handler once it has normalized its own payload shape into a
 * NormalizedCallEndedEvent.
 */
export async function completeInterview(
  deps: CallLifecycleDeps,
  event: NormalizedCallEndedEvent,
): Promise<void> {
  await deps.interviewRepo.update(event.interviewId, {
    status: "completed",
    transcript: event.transcript,
    recordingUrl: event.recordingUrl,
    ...(event.vapiCallId !== undefined ? { vapiCallId: event.vapiCallId } : {}),
    ...(event.elevenLabsConversationId !== undefined
      ? { elevenLabsConversationId: event.elevenLabsConversationId }
      : {}),
    completedAt: deps.now ?? new Date(),
    endedReason: event.endedReason,
  });

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
  if (summary) {
    try {
      await sendInterviewSummaryEmail(deps, event.interviewId, summary);
    } catch (error) {
      console.error(`Failed to send summary email for interview ${event.interviewId}:`, error);
    }
  }
}
