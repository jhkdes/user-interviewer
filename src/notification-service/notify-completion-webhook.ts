import type { CompletionWebhookClient } from "@/lib/webhook";
import type { InterviewRepository } from "@/repositories/interview-repository";
import { InterviewNotFoundError } from "./errors";

export interface NotifyCompletionWebhookDeps {
  interviewRepo: InterviewRepository;
  webhookClient: CompletionWebhookClient;
  /** Defaults to `new Date()` — overridable so tests can assert on exact timestamps. */
  now?: Date;
}

export interface NotifyCompletionWebhookResult {
  /** False when skipped because the participant never supplied a tracking id — not an error. */
  sent: boolean;
}

/**
 * Tells a third-party tool that a participant has completed their
 * interview, via a single globally-configured webhook URL (see
 * HttpCompletionWebhookClient). Skips (without erroring) when the
 * interview has no `trackingId` — most interviews won't, since the third
 * party's tracking id is an optional URL param on the interview link.
 *
 * Callers (call-lifecycle.ts's completeInterview) are responsible for
 * treating a thrown error here as non-fatal, same as summary generation and
 * the summary email: a failed webhook call shouldn't fail the provider
 * webhook or suggest the interview didn't complete.
 */
export async function notifyCompletionWebhook(
  deps: NotifyCompletionWebhookDeps,
  interviewId: string,
): Promise<NotifyCompletionWebhookResult> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) throw new InterviewNotFoundError(interviewId);
  if (!interview.trackingId) return { sent: false };

  await deps.webhookClient.send({
    participantTrackingId: interview.trackingId,
    interviewId: interview.id,
    studyId: interview.studyId,
    status: "completed",
    completedAt: (interview.completedAt ?? deps.now ?? new Date()).toISOString(),
  });
  return { sent: true };
}
