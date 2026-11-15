import { describe, expect, it } from "vitest";
import {
  IDEMPOTENCY_IN_FLIGHT_MS,
  IDEMPOTENCY_TTL_MS,
  type PartnerIdempotencyRepository,
} from "../partner-idempotency-repository";

/**
 * Shared behavioral contract for any PartnerIdempotencyRepository (in-memory
 * and Supabase). The partner ids must exist in the real table, which
 * references api_partners.
 */
export function runPartnerIdempotencyRepositoryContractTests(
  make: () => Promise<{
    repo: PartnerIdempotencyRepository;
    partnerId: string;
    otherPartnerId: string;
  }>,
) {
  describe("PartnerIdempotencyRepository contract", () => {
    const t0 = new Date("2026-11-06T10:00:00.000Z");
    const later = (ms: number) => new Date(t0.getTime() + ms);
    const answer = { status: 201, body: '{"ok":true}', contentType: "application/json" };

    it("accepts a new key, then says the same request is in progress until it is answered", async () => {
      const { repo, partnerId } = await make();
      expect(await repo.begin(partnerId, "k1", "hash-a", t0)).toEqual({ state: "new" });
      expect(await repo.begin(partnerId, "k1", "hash-a", later(1000))).toEqual({
        state: "in_progress",
      });
    });

    it("replays the stored answer to the same request", async () => {
      const { repo, partnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      await repo.complete(partnerId, "k1", answer, t0);
      expect(await repo.begin(partnerId, "k1", "hash-a", later(5000))).toEqual({
        state: "replay",
        ...answer,
      });
    });

    it("stores an answer with no body", async () => {
      const { repo, partnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      await repo.complete(partnerId, "k1", { status: 204, body: null, contentType: null }, t0);
      expect(await repo.begin(partnerId, "k1", "hash-a", later(1))).toEqual({
        state: "replay",
        status: 204,
        body: null,
        contentType: null,
      });
    });

    it("reports a different request under the same key as a mismatch", async () => {
      const { repo, partnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      expect(await repo.begin(partnerId, "k1", "hash-b", later(1))).toEqual({ state: "mismatch" });
      await repo.complete(partnerId, "k1", answer, t0);
      expect(await repo.begin(partnerId, "k1", "hash-b", later(2))).toEqual({ state: "mismatch" });
    });

    it("keeps one partner's keys apart from another's", async () => {
      const { repo, partnerId, otherPartnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      expect(await repo.begin(otherPartnerId, "k1", "hash-b", t0)).toEqual({ state: "new" });
    });

    it("frees a released key so the request can run again", async () => {
      const { repo, partnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      await repo.release(partnerId, "k1");
      expect(await repo.begin(partnerId, "k1", "hash-a", later(1))).toEqual({ state: "new" });
    });

    it("lets a request that never finished be tried again after the in-flight allowance", async () => {
      const { repo, partnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      expect(
        await repo.begin(partnerId, "k1", "hash-a", later(IDEMPOTENCY_IN_FLIGHT_MS - 1000)),
      ).toEqual({ state: "in_progress" });
      expect(
        await repo.begin(partnerId, "k1", "hash-a", later(IDEMPOTENCY_IN_FLIGHT_MS + 1000)),
      ).toEqual({ state: "new" });
    });

    it("forgets an answer after 24 hours", async () => {
      const { repo, partnerId } = await make();
      await repo.begin(partnerId, "k1", "hash-a", t0);
      await repo.complete(partnerId, "k1", answer, t0);
      expect(
        await repo.begin(partnerId, "k1", "hash-a", later(IDEMPOTENCY_TTL_MS - 1000)),
      ).toMatchObject({ state: "replay" });
      expect(await repo.begin(partnerId, "k1", "hash-b", later(IDEMPOTENCY_TTL_MS + 1000))).toEqual(
        { state: "new" },
      );
    });
  });
}
