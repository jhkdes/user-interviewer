import { describe, expect, it } from "vitest";
import type { PartnerRateLimitRepository } from "../partner-rate-limit-repository";

/** Shared behavioral contract for any PartnerRateLimitRepository (in-memory and Supabase). */
export function runPartnerRateLimitRepositoryContractTests(
  make: () => Promise<{
    repo: PartnerRateLimitRepository;
    partnerId: string;
    otherPartnerId: string;
  }>,
) {
  describe("PartnerRateLimitRepository contract", () => {
    const minute = new Date("2026-11-06T10:00:00.000Z");
    const nextMinute = new Date("2026-11-06T10:01:00.000Z");

    it("counts requests within a minute", async () => {
      const { repo, partnerId } = await make();
      expect(await repo.hit(partnerId, minute)).toBe(1);
      expect(await repo.hit(partnerId, minute)).toBe(2);
      expect(await repo.hit(partnerId, minute)).toBe(3);
    });

    it("starts again in the next minute", async () => {
      const { repo, partnerId } = await make();
      await repo.hit(partnerId, minute);
      await repo.hit(partnerId, minute);
      expect(await repo.hit(partnerId, nextMinute)).toBe(1);
    });

    it("counts each partner separately", async () => {
      const { repo, partnerId, otherPartnerId } = await make();
      await repo.hit(partnerId, minute);
      expect(await repo.hit(otherPartnerId, minute)).toBe(1);
    });

    it("counts every request when many arrive at once", async () => {
      const { repo, partnerId } = await make();
      const counts = await Promise.all(
        Array.from({ length: 10 }, () => repo.hit(partnerId, minute)),
      );
      expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });
}
