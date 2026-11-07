import type { PartnerRateLimitRepository } from "../partner-rate-limit-repository";

export class InMemoryPartnerRateLimitRepository implements PartnerRateLimitRepository {
  private counts = new Map<string, number>();

  async hit(partnerId: string, windowStart: Date) {
    const key = `${partnerId}:${windowStart.getTime()}`;
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }
}
