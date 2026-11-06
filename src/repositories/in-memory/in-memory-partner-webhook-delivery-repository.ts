import { randomUUID } from "node:crypto";
import type { PartnerWebhookDelivery } from "@/domain";
import type {
  DeliveryResultPatch,
  EnqueueDeliveryInput,
  PartnerWebhookDeliveryRepository,
} from "../partner-webhook-delivery-repository";

export class InMemoryPartnerWebhookDeliveryRepository implements PartnerWebhookDeliveryRepository {
  private deliveries = new Map<string, PartnerWebhookDelivery>();

  async enqueue(input: EnqueueDeliveryInput) {
    const existing = await this.getByInterview(input.interviewId, input.event);
    if (existing) return { delivery: existing, created: false };
    const delivery: PartnerWebhookDelivery = {
      id: randomUUID(),
      partnerId: input.partnerId,
      studyId: input.studyId,
      interviewId: input.interviewId,
      event: input.event,
      payload: structuredClone(input.payload),
      status: "pending",
      attempts: 0,
      nextAttemptAt: input.nextAttemptAt,
      lastAttemptAt: null,
      lastStatusCode: null,
      lastError: null,
      createdAt: new Date(),
      deliveredAt: null,
      expiresAt: input.expiresAt,
    };
    this.deliveries.set(delivery.id, delivery);
    return { delivery: this.copy(delivery), created: true };
  }

  async getById(id: string) {
    const delivery = this.deliveries.get(id);
    return delivery ? this.copy(delivery) : null;
  }

  async getByInterview(interviewId: string, event: string) {
    for (const delivery of this.deliveries.values()) {
      if (delivery.interviewId === interviewId && delivery.event === event) {
        return this.copy(delivery);
      }
    }
    return null;
  }

  async listDue(now: Date, limit: number) {
    return [...this.deliveries.values()]
      .filter((d) => d.status === "pending" && d.nextAttemptAt.getTime() <= now.getTime())
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
      .slice(0, limit)
      .map((d) => this.copy(d));
  }

  async claim(id: string, now: Date, leaseUntil: Date) {
    const delivery = this.deliveries.get(id);
    if (!delivery || delivery.status !== "pending") return null;
    if (delivery.nextAttemptAt.getTime() > now.getTime()) return null;
    delivery.nextAttemptAt = leaseUntil;
    return this.copy(delivery);
  }

  async recordResult(id: string, patch: DeliveryResultPatch) {
    const delivery = this.deliveries.get(id);
    if (!delivery) throw new Error(`Delivery not found: ${id}`);
    Object.assign(delivery, patch);
    return this.copy(delivery);
  }

  async reschedule(id: string, nextAttemptAt: Date, reason: string | null) {
    const delivery = this.deliveries.get(id);
    if (!delivery) throw new Error(`Delivery not found: ${id}`);
    delivery.nextAttemptAt = nextAttemptAt;
    delivery.lastError = reason;
    return this.copy(delivery);
  }

  /** For tests: forget everything about an interview, as deleting it would. */
  removeForInterview(interviewId: string) {
    for (const [id, d] of this.deliveries)
      if (d.interviewId === interviewId) this.deliveries.delete(id);
  }

  private copy(delivery: PartnerWebhookDelivery): PartnerWebhookDelivery {
    return { ...delivery, payload: structuredClone(delivery.payload) };
  }
}
