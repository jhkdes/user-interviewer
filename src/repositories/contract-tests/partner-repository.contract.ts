import { describe, expect, it } from "vitest";
import type { PartnerRepository } from "../partner-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

/** Shared behavioral contract for any PartnerRepository implementation (in-memory and Supabase). */
export function runPartnerRepositoryContractTests(
  makeRepository: () => PartnerRepository | Promise<PartnerRepository>,
) {
  describe("PartnerRepository contract", () => {
    it("creates an active partner and finds it by id, name and key hash", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        name: "pfa-preview",
        keyHash: "a".repeat(64),
        webhookUrl: "https://example.com/hook",
        webhookSecret: "whsec_x",
      });

      expect(created).toMatchObject({
        name: "pfa-preview",
        keyHash: "a".repeat(64),
        webhookUrl: "https://example.com/hook",
        webhookSecret: "whsec_x",
        revokedAt: null,
      });
      expect(created.createdAt).toBeInstanceOf(Date);
      expect((await repo.getById(created.id))?.name).toBe("pfa-preview");
      expect((await repo.getByName("pfa-preview"))?.id).toBe(created.id);
      expect((await repo.getByKeyHash("a".repeat(64)))?.id).toBe(created.id);
    });

    it("leaves the webhook unset when none is given", async () => {
      const repo = await makeRepository();
      const created = await repo.create({ name: "bare", keyHash: "b".repeat(64) });

      expect(created.webhookUrl).toBeNull();
      expect(created.webhookSecret).toBeNull();
    });

    it("returns null for an unknown id, name or key hash", async () => {
      const repo = await makeRepository();

      expect(await repo.getById(NONEXISTENT_ID)).toBeNull();
      expect(await repo.getByName("nobody")).toBeNull();
      expect(await repo.getByKeyHash("c".repeat(64))).toBeNull();
    });

    it("refuses a name or a key hash that is already taken", async () => {
      const repo = await makeRepository();
      await repo.create({ name: "one", keyHash: "d".repeat(64) });

      await expect(repo.create({ name: "one", keyHash: "e".repeat(64) })).rejects.toThrow();
      await expect(repo.create({ name: "two", keyHash: "d".repeat(64) })).rejects.toThrow();
    });

    it("lists partners oldest first", async () => {
      const repo = await makeRepository();
      const first = await repo.create({ name: "first", keyHash: "1".repeat(64) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await repo.create({ name: "second", keyHash: "2".repeat(64) });

      expect((await repo.list()).map((p) => p.id)).toEqual([first.id, second.id]);
    });

    it("revokes a partner, keeping the first revocation time if revoked again", async () => {
      const repo = await makeRepository();
      const created = await repo.create({ name: "gone", keyHash: "f".repeat(64) });

      const revoked = await repo.revoke(created.id);
      const again = await repo.revoke(created.id);

      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(again.revokedAt?.getTime()).toBe(revoked.revokedAt?.getTime());
      expect((await repo.getByKeyHash("f".repeat(64)))?.revokedAt).toBeInstanceOf(Date);
    });

    it("rejects revoking an unknown partner", async () => {
      const repo = await makeRepository();

      await expect(repo.revoke(NONEXISTENT_ID)).rejects.toThrow();
    });
  });
}
