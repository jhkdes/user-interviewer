import {
  IDEMPOTENCY_IN_FLIGHT_MS,
  IDEMPOTENCY_TTL_MS,
  type IdempotencyBegin,
  type PartnerIdempotencyRepository,
  type StoredResponse,
} from "../partner-idempotency-repository";

interface Entry {
  requestHash: string;
  createdAt: Date;
  response: StoredResponse | null;
}

export class InMemoryPartnerIdempotencyRepository implements PartnerIdempotencyRepository {
  private entries = new Map<string, Entry>();

  private id = (partnerId: string, key: string) => `${partnerId}:${key}`;

  async begin(
    partnerId: string,
    key: string,
    requestHash: string,
    now: Date,
  ): Promise<IdempotencyBegin> {
    const id = this.id(partnerId, key);
    const existing = this.entries.get(id);
    const age = existing ? now.getTime() - existing.createdAt.getTime() : 0;

    const expired =
      existing && (existing.response ? age >= IDEMPOTENCY_TTL_MS : age >= IDEMPOTENCY_IN_FLIGHT_MS);
    if (!existing || expired) {
      this.entries.set(id, { requestHash, createdAt: now, response: null });
      return { state: "new" };
    }
    if (existing.requestHash !== requestHash) return { state: "mismatch" };
    if (existing.response) return { state: "replay", ...existing.response };
    return { state: "in_progress" };
  }

  async complete(partnerId: string, key: string, response: StoredResponse) {
    const entry = this.entries.get(this.id(partnerId, key));
    if (entry) entry.response = { ...response };
  }

  async release(partnerId: string, key: string) {
    this.entries.delete(this.id(partnerId, key));
  }
}
