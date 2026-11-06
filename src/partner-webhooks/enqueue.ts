import { INTERVIEW_COMPLETED_EVENT, type PartnerWebhookDelivery } from "@/domain";
import { DELIVERY_WINDOW_MS, claimAndAttempt, type WebhookDeps } from "./deliver";

/**
 * Queues the `interview.completed` event for an interview that has ended, if
 * it belongs to a partner study and the partner has a webhook. Returns null
 * when there is nothing to send. Queuing twice is harmless: the event exists
 * once per interview.
 */
export async function enqueueInterviewCompleted(
  deps: WebhookDeps,
  interviewId: string,
): Promise<{ delivery: PartnerWebhookDelivery; created: boolean } | null> {
  const interview = await deps.interviews.getById(interviewId);
  if (!interview || interview.status !== "completed") return null;

  const study = await deps.studies.getById(interview.studyId);
  if (!study?.partnerId) return null;

  const partner = await deps.partners.getById(study.partnerId);
  if (!partner || partner.revokedAt || !partner.webhookUrl || !partner.webhookSecret) {
    console.log(
      `No webhook queued for interview ${interviewId}: the partner has no active webhook`,
    );
    return null;
  }

  const now = deps.now ? deps.now() : new Date();
  return deps.deliveries.enqueue({
    partnerId: partner.id,
    studyId: study.id,
    interviewId: interview.id,
    event: INTERVIEW_COMPLETED_EVENT,
    payload: {
      event: INTERVIEW_COMPLETED_EVENT,
      studyId: study.id,
      invitationId: interview.invitationId,
      trackingId: interview.trackingId,
      interviewId: interview.id,
      status: "completed",
      endCause: interview.endCause,
      occurredAt: (interview.completedAt ?? now).toISOString(),
    },
    nextAttemptAt: now,
    expiresAt: new Date(now.getTime() + DELIVERY_WINDOW_MS),
  });
}

/**
 * What runs when a partner interview ends: queue the event, then try to send
 * it straight away. If that does not work (the recording is not ready, the
 * partner is down), the scheduled sweep picks it up. Failures here never fail
 * the interview's completion; the caller treats a throw as non-fatal.
 */
export function createPartnerCompletionHook(deps: WebhookDeps) {
  return async (interviewId: string): Promise<void> => {
    const queued = await enqueueInterviewCompleted(deps, interviewId);
    if (queued?.created) await claimAndAttempt(deps, queued.delivery);
  };
}
