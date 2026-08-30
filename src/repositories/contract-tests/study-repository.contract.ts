import { describe, expect, it } from "vitest";
import type { StudyRepository } from "../study-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

const sampleTargetProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

/**
 * Shared behavioral contract for any StudyRepository implementation.
 * Run this against both the in-memory fake and the Supabase-backed
 * implementation so they're proven to behave identically.
 */
export function runStudyRepositoryContractTests(
  makeRepository: () => StudyRepository | Promise<StudyRepository>,
) {
  describe("StudyRepository contract", () => {
    it("creates a study with open status and no closedAt", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        targetProfile: sampleTargetProfile,
        linkToken: "token-1",
      });

      expect(study.id).toBeTruthy();
      expect(study.targetProfile).toEqual(sampleTargetProfile);
      expect(study.linkToken).toBe("token-1");
      expect(study.status).toBe("open");
      expect(study.closedAt).toBeNull();
      expect(study.createdAt).toBeInstanceOf(Date);
      expect(study.researchTopic).toBeNull();
      expect(study.customPrompt).toBeNull();
      expect(study.voiceProvider).toBe("vapi");
    });

    it("creates a study with an explicit voiceProvider", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        targetProfile: sampleTargetProfile,
        linkToken: "token-elevenlabs",
        voiceProvider: "elevenlabs",
      });

      expect(study.voiceProvider).toBe("elevenlabs");
    });

    it("creates a study with a research topic when provided", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        targetProfile: sampleTargetProfile,
        researchTopic: "How AI actually shows up in a PM's day",
        linkToken: "token-with-topic",
      });

      expect(study.researchTopic).toBe("How AI actually shows up in a PM's day");
    });

    it("creates a study with a custom prompt when provided", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        targetProfile: sampleTargetProfile,
        customPrompt: "You are a research interviewer for {{participant_name}}...",
        linkToken: "token-with-custom-prompt",
      });

      expect(study.customPrompt).toBe("You are a research interviewer for {{participant_name}}...");
    });

    it("getById returns the created study", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        targetProfile: sampleTargetProfile,
        linkToken: "token-2",
      });

      const found = await repo.getById(created.id);
      expect(found).toEqual(created);
    });

    it("getById returns null for an unknown id", async () => {
      const repo = await makeRepository();
      expect(await repo.getById(NONEXISTENT_ID)).toBeNull();
    });

    it("getByLinkToken finds a study by its link token", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        targetProfile: sampleTargetProfile,
        linkToken: "unique-token",
      });

      const found = await repo.getByLinkToken("unique-token");
      expect(found?.id).toBe(created.id);
    });

    it("getByLinkToken returns null for an unknown token", async () => {
      const repo = await makeRepository();
      expect(await repo.getByLinkToken("nope")).toBeNull();
    });

    it("list returns all created studies", async () => {
      const repo = await makeRepository();
      await repo.create({ targetProfile: sampleTargetProfile, linkToken: "a" });
      await repo.create({ targetProfile: sampleTargetProfile, linkToken: "b" });

      const studies = await repo.list();
      expect(studies).toHaveLength(2);
      expect(studies.map((s) => s.linkToken).sort()).toEqual(["a", "b"]);
    });

    it("updateStatus closes a study and returns the updated record", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        targetProfile: sampleTargetProfile,
        linkToken: "to-close",
      });

      const closed = await repo.updateStatus(created.id, "closed");
      expect(closed.status).toBe("closed");

      const reloaded = await repo.getById(created.id);
      expect(reloaded?.status).toBe("closed");
    });

    it("updateStatus rejects an unknown id", async () => {
      const repo = await makeRepository();
      await expect(repo.updateStatus(NONEXISTENT_ID, "closed")).rejects.toThrow();
    });
  });
}
