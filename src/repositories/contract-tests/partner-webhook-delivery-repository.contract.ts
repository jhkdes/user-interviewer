import { describe, expect, it } from "vitest";
import type { PartnerWebhookDeliveryRepository } from "../partner-webhook-delivery-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

export interface DeliveryContractHarness {
  deliveries: PartnerWebhookDeliveryRepository;
  /** A partner, study and interview to attach a delivery to (real rows for Supabase, which has foreign keys). */
  newTarget: () => Promise<{ partnerId: string; studyId: string; interviewId: string }>;
}

const T0 = new Date("2026-11-06T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Shared behavioral contract for any PartnerWebhookDeliveryRepository implementation. */
export function runPartnerWebhookDeliveryRepositoryContractTests(
  makeHarness: () => DeliveryContractHarness | Promise<DeliveryContractHarness>,
) {
  async function queue(
    h: DeliveryContractHarness,
    nextAttemptAt = T0,
    event = "interview.completed",
  ) {
    const target = await h.newTarget();
    const { delivery, created } = await h.deliveries.enqueue({
      ...target,
      event,
      payload: { event, interviewId: target.interviewId },
      nextAttemptAt,
      expiresAt: at(24 * 3600_000),
    });
    return { target, delivery, created };
  }

  describe("PartnerWebhookDeliveryRepository contract", () => {
    it("queues a pending delivery with its payload", async () => {
      const h = await makeHarness();

      const { delivery, created, target } = await queue(h);

      expect(created).toBe(true);
      expect(delivery).toMatchObject({
        ...target,
        event: "interview.completed",
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastStatusCode: null,
        lastError: null,
        deliveredAt: null,
      });
      expect(delivery.payload).toEqual({
        event: "interview.completed",
        interviewId: target.interviewId,
      });
      expect(delivery.expiresAt.getTime()).toBe(at(24 * 3600_000).getTime());
    });

    it("queues an event once per interview: a second enqueue returns the first", async () => {
      const h = await makeHarness();
      const first = await queue(h);

      const again = await h.deliveries.enqueue({
        ...first.target,
        event: "interview.completed",
        payload: { different: true },
        nextAttemptAt: at(60_000),
        expiresAt: at(3600_000),
      });

      expect(again.created).toBe(false);
      expect(again.delivery.id).toBe(first.delivery.id);
      expect(again.delivery.payload).toEqual(first.delivery.payload);
    });

    it("finds a delivery by id and by interview and event", async () => {
      const h = await makeHarness();
      const { delivery, target } = await queue(h);

      expect((await h.deliveries.getById(delivery.id))?.id).toBe(delivery.id);
      expect(
        (await h.deliveries.getByInterview(target.interviewId, "interview.completed"))?.id,
      ).toBe(delivery.id);
      expect(await h.deliveries.getById(NONEXISTENT_ID)).toBeNull();
      expect(await h.deliveries.getByInterview(target.interviewId, "other.event")).toBeNull();
    });

    it("lists only pending deliveries that are due, oldest first, up to the limit", async () => {
      const h = await makeHarness();
      const later = await queue(h, at(60_000));
      const earlier = await queue(h, at(10_000));
      const notYet = await queue(h, at(10 * 60_000));

      const due = await h.deliveries.listDue(at(2 * 60_000), 10);

      const ids = due.map((d) => d.id);
      expect(ids.indexOf(earlier.delivery.id)).toBeLessThan(ids.indexOf(later.delivery.id));
      expect(ids).toContain(later.delivery.id);
      expect(ids).not.toContain(notYet.delivery.id);
      expect(await h.deliveries.listDue(at(2 * 60_000), 1)).toHaveLength(1);
    });

    it("lets only one worker claim a delivery, and pushes its next attempt to the end of the lease", async () => {
      const h = await makeHarness();
      const { delivery } = await queue(h);

      const first = await h.deliveries.claim(delivery.id, at(1000), at(1000 + 120_000));
      const second = await h.deliveries.claim(delivery.id, at(2000), at(2000 + 120_000));

      expect(first?.id).toBe(delivery.id);
      expect(second).toBeNull();
      expect((await h.deliveries.getById(delivery.id))?.nextAttemptAt.getTime()).toBe(
        at(1000 + 120_000).getTime(),
      );
      // Once the lease has run out, it can be taken again (the first worker died).
      expect(await h.deliveries.claim(delivery.id, at(200_000), at(320_000))).not.toBeNull();
    });

    it("does not claim a delivery that is not due, is delivered, or does not exist", async () => {
      const h = await makeHarness();
      const future = await queue(h, at(3600_000));
      const sent = await queue(h);
      await h.deliveries.recordResult(sent.delivery.id, {
        status: "delivered",
        attempts: 1,
        nextAttemptAt: T0,
        lastAttemptAt: at(1000),
        lastStatusCode: 200,
        lastError: null,
        deliveredAt: at(1000),
      });

      expect(await h.deliveries.claim(future.delivery.id, T0, at(120_000))).toBeNull();
      expect(await h.deliveries.claim(sent.delivery.id, at(5000), at(125_000))).toBeNull();
      expect(await h.deliveries.claim(NONEXISTENT_ID, T0, at(120_000))).toBeNull();
    });

    it("records an attempt's result, and a delivered or failed one stops being due", async () => {
      const h = await makeHarness();
      const retry = await queue(h);
      const done = await queue(h);
      const gaveUp = await queue(h);

      const afterRetry = await h.deliveries.recordResult(retry.delivery.id, {
        status: "pending",
        attempts: 1,
        nextAttemptAt: at(60_000),
        lastAttemptAt: at(1000),
        lastStatusCode: 503,
        lastError: "HTTP 503",
        deliveredAt: null,
      });
      await h.deliveries.recordResult(done.delivery.id, {
        status: "delivered",
        attempts: 1,
        nextAttemptAt: T0,
        lastAttemptAt: at(1000),
        lastStatusCode: 200,
        lastError: null,
        deliveredAt: at(1000),
      });
      await h.deliveries.recordResult(gaveUp.delivery.id, {
        status: "failed",
        attempts: 9,
        nextAttemptAt: T0,
        lastAttemptAt: at(1000),
        lastStatusCode: 500,
        lastError: "HTTP 500",
        deliveredAt: null,
      });

      expect(afterRetry).toMatchObject({
        status: "pending",
        attempts: 1,
        lastStatusCode: 503,
        lastError: "HTTP 503",
      });
      const due = (await h.deliveries.listDue(at(10 * 60_000), 50)).map((d) => d.id);
      expect(due).toContain(retry.delivery.id);
      expect(due).not.toContain(done.delivery.id);
      expect(due).not.toContain(gaveUp.delivery.id);
      expect((await h.deliveries.getById(done.delivery.id))?.deliveredAt).toBeInstanceOf(Date);
    });

    it("reschedules without counting an attempt", async () => {
      const h = await makeHarness();
      const { delivery } = await queue(h);

      const moved = await h.deliveries.reschedule(
        delivery.id,
        at(30_000),
        "waiting for the recording",
      );

      expect(moved.attempts).toBe(0);
      expect(moved.nextAttemptAt.getTime()).toBe(at(30_000).getTime());
      expect(moved.lastError).toBe("waiting for the recording");
    });

    it("rejects recording or rescheduling an unknown delivery", async () => {
      const h = await makeHarness();

      await expect(h.deliveries.reschedule(NONEXISTENT_ID, T0, null)).rejects.toThrow();
      await expect(
        h.deliveries.recordResult(NONEXISTENT_ID, {
          status: "failed",
          attempts: 1,
          nextAttemptAt: T0,
          lastAttemptAt: T0,
          lastStatusCode: null,
          lastError: null,
          deliveredAt: null,
        }),
      ).rejects.toThrow();
    });
  });
}
