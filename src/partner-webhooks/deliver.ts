import type { PartnerWebhookDelivery } from "@/domain";
import type { ConversationAudioState } from "@/lib/elevenlabs/client";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { PartnerRepository } from "@/repositories/partner-repository";
import type { PartnerWebhookDeliveryRepository } from "@/repositories/partner-webhook-delivery-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { signBody } from "./sign";

export interface WebhookDeps {
  deliveries: PartnerWebhookDeliveryRepository;
  partners: PartnerRepository;
  interviews: InterviewRepository;
  studies: StudyRepository;
  /** Whether an interview's recording can be read yet. */
  audioState: (conversationId: string) => Promise<ConversationAudioState>;
  /** Defaults to the global `fetch`; tests pass a fake. */
  fetch?: typeof fetch;
  /** Defaults to `new Date()`; tests fix the time. */
  now?: () => Date;
}

/** A delivery is given up on this long after it was queued. */
export const DELIVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The wait before each retry; the last one repeats until the window closes. */
export const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 120, 240, 360];
/** How long a taken delivery stays reserved while it is being sent. */
export const LEASE_MS = 2 * 60 * 1000;
/** How long to wait for a finished call's recording to appear before sending without it. */
export const AUDIO_WAIT_MS = 10 * 60 * 1000;
const AUDIO_RECHECK_MS = 30 * 1000;
export const REQUEST_TIMEOUT_MS = 10 * 1000;

export type DeliveryOutcome = "delivered" | "retry" | "failed" | "waiting";

export function retryDelayMs(attemptsSoFar: number): number {
  const minutes =
    RETRY_DELAYS_MINUTES[Math.min(attemptsSoFar - 1, RETRY_DELAYS_MINUTES.length - 1)];
  return minutes * 60 * 1000;
}

const clock = (deps: WebhookDeps) => (deps.now ? deps.now() : new Date());

/**
 * Sends one claimed delivery. Never throws: whatever happens is recorded on the
 * delivery, and the outcome says what to expect next.
 *
 * - The event is held back while the interview's recording is not readable yet
 *   (so a receiver that fetches the audio on the event finds it), for up to
 *   ten minutes; after that it is sent anyway.
 * - A `2xx` answer is success. Anything else (another status, a redirect, a
 *   timeout, a network error) is a failure and is retried with growing delays
 *   until the 24-hour window closes.
 */
export async function attemptDelivery(
  deps: WebhookDeps,
  delivery: PartnerWebhookDelivery,
): Promise<DeliveryOutcome> {
  const now = clock(deps);
  const giveUp = (reason: string) =>
    deps.deliveries
      .recordResult(delivery.id, {
        status: "failed",
        attempts: delivery.attempts,
        nextAttemptAt: delivery.nextAttemptAt,
        lastAttemptAt: delivery.lastAttemptAt,
        lastStatusCode: delivery.lastStatusCode,
        lastError: reason,
        deliveredAt: null,
      })
      .then(() => "failed" as const);

  const partner = await deps.partners.getById(delivery.partnerId);
  if (!partner || partner.revokedAt) return giveUp("the partner is revoked or missing");

  const interview = await deps.interviews.getById(delivery.interviewId);
  if (!interview) return giveUp("the interview no longer exists");

  const retryOrGiveUp = async (statusCode: number | null, reason: string) => {
    const attempts = delivery.attempts + 1;
    const next = new Date(now.getTime() + retryDelayMs(attempts));
    const expired = now.getTime() >= delivery.expiresAt.getTime();
    // Make the last try land on the edge of the window rather than being skipped.
    const nextAttemptAt = next.getTime() > delivery.expiresAt.getTime() ? delivery.expiresAt : next;
    await deps.deliveries.recordResult(delivery.id, {
      status: expired ? "failed" : "pending",
      attempts,
      nextAttemptAt: expired ? delivery.nextAttemptAt : nextAttemptAt,
      lastAttemptAt: now,
      lastStatusCode: statusCode,
      lastError: reason,
      deliveredAt: null,
    });
    return expired ? ("failed" as const) : ("retry" as const);
  };

  if (!partner.webhookUrl || !partner.webhookSecret) {
    return retryOrGiveUp(null, "the partner has no webhook configured");
  }

  if (interview.mode === "voice" && interview.elevenLabsConversationId) {
    const state = await deps.audioState(interview.elevenLabsConversationId);
    const waited = now.getTime() - (interview.completedAt ?? delivery.createdAt).getTime();
    if ((state === "pending" || state === "unknown") && waited < AUDIO_WAIT_MS) {
      await deps.deliveries.reschedule(
        delivery.id,
        new Date(now.getTime() + AUDIO_RECHECK_MS),
        "waiting for the recording",
      );
      return "waiting";
    }
  }

  const body = JSON.stringify(delivery.payload);
  const fetchFn = deps.fetch ?? fetch;
  try {
    const response = await fetchFn(partner.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "user-interviewer-webhooks/1",
        "X-UI-Signature": signBody(partner.webhookSecret, body),
        "X-UI-Timestamp": String(Math.floor(now.getTime() / 1000)),
        "X-UI-Event": delivery.event,
        "X-UI-Delivery": delivery.id,
      },
      body,
      // A redirect is a failure: the partner's address should answer itself.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status >= 200 && response.status < 300) {
      await deps.deliveries.recordResult(delivery.id, {
        status: "delivered",
        attempts: delivery.attempts + 1,
        nextAttemptAt: delivery.nextAttemptAt,
        lastAttemptAt: now,
        lastStatusCode: response.status,
        lastError: null,
        deliveredAt: now,
      });
      return "delivered";
    }
    return retryOrGiveUp(response.status, `the partner answered HTTP ${response.status}`);
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return retryOrGiveUp(
      null,
      timedOut ? "the request timed out" : "the request could not be made",
    );
  }
}

/** Takes a delivery (so no one else sends it at the same moment) and sends it. Null if someone else has it or it is not due. */
export async function claimAndAttempt(
  deps: WebhookDeps,
  delivery: PartnerWebhookDelivery,
): Promise<DeliveryOutcome | null> {
  const now = clock(deps);
  const claimed = await deps.deliveries.claim(delivery.id, now, new Date(now.getTime() + LEASE_MS));
  return claimed ? attemptDelivery(deps, claimed) : null;
}

export interface SweepResult {
  checked: number;
  delivered: number;
  retried: number;
  failed: number;
  waiting: number;
  /** Due deliveries left for the next run because of the time or count limit. */
  deferred: number;
}

/**
 * Sends what is due. Run every few minutes by a scheduler. Bounded in count and
 * time, so a partner that is down cannot make one run overrun; what is left is
 * picked up by the next run.
 */
export async function runPartnerWebhookSweep(
  deps: WebhookDeps,
  options: { limit?: number; budgetMs?: number } = {},
): Promise<SweepResult> {
  const limit = options.limit ?? 10;
  const budgetMs = options.budgetMs ?? 40_000;
  const startedAt = Date.now();
  const due = await deps.deliveries.listDue(clock(deps), limit + 1);
  const result: SweepResult = {
    checked: 0,
    delivered: 0,
    retried: 0,
    failed: 0,
    waiting: 0,
    deferred: 0,
  };

  for (const [index, delivery] of due.entries()) {
    if (index >= limit || Date.now() - startedAt >= budgetMs) {
      result.deferred = due.length - index;
      break;
    }
    result.checked++;
    try {
      const outcome = await claimAndAttempt(deps, delivery);
      if (outcome === "delivered") result.delivered++;
      else if (outcome === "retry") result.retried++;
      else if (outcome === "failed") result.failed++;
      else if (outcome === "waiting") result.waiting++;
    } catch (error) {
      console.error(`Partner webhook delivery ${delivery.id} failed unexpectedly:`, error);
    }
  }
  return result;
}
