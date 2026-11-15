import type { PartnerWebhookDelivery, WebhookDeliveryStatus } from "@/domain";

export interface EnqueueDeliveryInput {
  partnerId: string;
  studyId: string;
  interviewId: string;
  event: string;
  payload: Record<string, unknown>;
  nextAttemptAt: Date;
  expiresAt: Date;
}

export interface DeliveryResultPatch {
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
}

export interface PartnerWebhookDeliveryRepository {
  /** Queues an event once per (interview, event): a second call returns the one already there with `created: false`. */
  enqueue(
    input: EnqueueDeliveryInput,
  ): Promise<{ delivery: PartnerWebhookDelivery; created: boolean }>;
  getById(id: string): Promise<PartnerWebhookDelivery | null>;
  getByInterview(interviewId: string, event: string): Promise<PartnerWebhookDelivery | null>;
  /** Pending deliveries whose time has come, oldest first. */
  listDue(now: Date, limit: number): Promise<PartnerWebhookDelivery[]>;
  /**
   * Takes a delivery for sending: only if it is still pending and due, and in
   * that one step pushes its next attempt to `leaseUntil`, so a second worker
   * (the sweep and the completion hook at once) does not send the same event.
   * Returns null when someone else holds it or it is no longer due.
   */
  claim(id: string, now: Date, leaseUntil: Date): Promise<PartnerWebhookDelivery | null>;
  recordResult(id: string, patch: DeliveryResultPatch): Promise<PartnerWebhookDelivery>;
  /** Moves a claimed delivery's next attempt without counting an attempt (e.g. while a recording is not ready). */
  reschedule(
    id: string,
    nextAttemptAt: Date,
    reason: string | null,
  ): Promise<PartnerWebhookDelivery>;
}
