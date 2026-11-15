export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

/** The one event the partner API sends. */
export const INTERVIEW_COMPLETED_EVENT = "interview.completed";

/** One event queued for a partner's webhook (partner-api-phase1/UI-PARTNER-API-SPEC.md, 3.8). */
export interface PartnerWebhookDelivery {
  id: string;
  partnerId: string;
  studyId: string;
  interviewId: string;
  event: string;
  /** The exact JSON body that is signed and sent. */
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  /** Sends actually tried (waiting for a recording to appear is not an attempt). */
  attempts: number;
  /** When the sweep should next try this one. */
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  lastStatusCode: number | null;
  /** Why the last attempt failed, in words that are safe to log. */
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  /** After this the delivery is given up on (24 hours after it was queued). */
  expiresAt: Date;
}
