import { describe, expect, it } from "vitest";
import type { InterviewRepository } from "../interview-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

/**
 * Shared behavioral contract for any InterviewRepository implementation.
 * `getStudyId` must resolve to a study that already exists in whatever backing
 * store the repository under test uses (foreign key constraints on Supabase).
 * It's a getter rather than a plain string because for the Supabase suite the
 * fixture study is created in `beforeAll`, after this function has already
 * run to register the `it()` blocks.
 */
export function runInterviewRepositoryContractTests(
  makeRepository: () => InterviewRepository | Promise<InterviewRepository>,
  getStudyId: () => string,
) {
  describe("InterviewRepository contract", () => {
    it("creates an interview with pending status, null roleDescription (not collected at intake — M13), and null timestamps/artifacts", async () => {
      const repo = await makeRepository();
      const studyId = getStudyId();
      const interview = await repo.create({
        studyId,
        firstName: "Alex",
        email: "alex@example.com",
      });

      expect(interview.id).toBeTruthy();
      expect(interview.studyId).toBe(studyId);
      expect(interview.status).toBe("pending");
      expect(interview.roleDescription).toBeNull();
      expect(interview.consentGivenAt).toBeNull();
      expect(interview.transcript).toBeNull();
      expect(interview.recordingUrl).toBeNull();
      expect(interview.vapiCallId).toBeNull();
      expect(interview.voiceProvider).toBe("vapi");
      expect(interview.elevenLabsConversationId).toBeNull();
      expect(interview.startedAt).toBeNull();
      expect(interview.completedAt).toBeNull();
      expect(interview.summaryEmailSentAt).toBeNull();
      expect(interview.createdAt).toBeInstanceOf(Date);
      expect(interview.deviceType).toBeNull();
      expect(interview.endedReason).toBeNull();
      expect(interview.backgroundedAt).toBeNull();
      expect(interview.screenerAnswers).toBeNull();
      expect(interview.timeCheckAskedAt).toBeNull();
    });

    it("creates an interview with screener answers when provided, round-tripping single and multi-select values", async () => {
      const repo = await makeRepository();
      const screenerAnswers = {
        level: "Senior Product Manager",
        aiToolsUsed: ["ChatGPT", "Claude", "Other: an internal tool"],
      };
      const interview = await repo.create({
        studyId: getStudyId(),
        firstName: "Alex",
        email: "alex@example.com",
        screenerAnswers,
      });

      expect(interview.screenerAnswers).toEqual(screenerAnswers);
      expect((await repo.getById(interview.id))?.screenerAnswers).toEqual(screenerAnswers);
    });

    it("creates an interview with a device type when provided", async () => {
      const repo = await makeRepository();
      const interview = await repo.create({
        studyId: getStudyId(),
        firstName: "Alex",
        email: "alex@example.com",
        deviceType: "mobile",
      });

      expect(interview.deviceType).toBe("mobile");
    });

    it("creates an interview with an explicit voiceProvider", async () => {
      const repo = await makeRepository();
      const interview = await repo.create({
        studyId: getStudyId(),
        firstName: "Alex",
        email: "alex@example.com",
        voiceProvider: "elevenlabs",
      });

      expect(interview.voiceProvider).toBe("elevenlabs");
    });

    it("update can record elevenLabsConversationId", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
        voiceProvider: "elevenlabs",
      });

      const updated = await repo.update(created.id, { elevenLabsConversationId: "conv-abc-123" });

      expect(updated.elevenLabsConversationId).toBe("conv-abc-123");
      const reloaded = await repo.getById(created.id);
      expect(reloaded?.elevenLabsConversationId).toBe("conv-abc-123");
    });

    it("getById returns the created interview", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Jordan",
        email: "jordan@example.com",
      });

      const found = await repo.getById(created.id);
      expect(found).toEqual(created);
    });

    it("getById returns null for an unknown id", async () => {
      const repo = await makeRepository();
      expect(await repo.getById(NONEXISTENT_ID)).toBeNull();
    });

    it("listByStudyId returns only interviews for that study", async () => {
      const repo = await makeRepository();
      const studyId = getStudyId();
      await repo.create({ studyId, firstName: "A", email: "a@example.com" });
      await repo.create({ studyId, firstName: "B", email: "b@example.com" });

      const interviews = await repo.listByStudyId(studyId);
      expect(interviews).toHaveLength(2);
      expect(interviews.every((i) => i.studyId === studyId)).toBe(true);
    });

    it("update patches only the given fields and persists them", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });

      const consentTime = new Date("2026-01-01T00:00:00.000Z");
      const updated = await repo.update(created.id, {
        status: "in-progress",
        consentGivenAt: consentTime,
        startedAt: consentTime,
        vapiCallId: "call-abc-123",
      });

      expect(updated.status).toBe("in-progress");
      expect(updated.consentGivenAt).toEqual(consentTime);
      expect(updated.startedAt).toEqual(consentTime);
      expect(updated.vapiCallId).toBe("call-abc-123");
      // Untouched fields survive the partial update
      expect(updated.firstName).toBe("Sam");
      expect(updated.email).toBe("sam@example.com");

      const reloaded = await repo.getById(created.id);
      expect(reloaded?.status).toBe("in-progress");
    });

    it("update can backfill roleDescription (#4)", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });

      const updated = await repo.update(created.id, { roleDescription: "Engineering manager" });

      expect(updated.roleDescription).toBe("Engineering manager");
      expect((await repo.getById(created.id))?.roleDescription).toBe("Engineering manager");
    });

    it("update rejects an unknown id", async () => {
      const repo = await makeRepository();
      await expect(repo.update(NONEXISTENT_ID, { status: "completed" })).rejects.toThrow();
    });

    it("update can record summaryEmailSentAt (#6)", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      const sentAt = new Date("2026-01-01T00:00:00.000Z");

      const updated = await repo.update(created.id, { summaryEmailSentAt: sentAt });

      expect(updated.summaryEmailSentAt).toEqual(sentAt);
      expect((await repo.getById(created.id))?.summaryEmailSentAt).toEqual(sentAt);
    });

    it("update can record endedReason and backgroundedAt", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      const backgroundedAt = new Date("2026-01-01T00:05:00.000Z");

      const updated = await repo.update(created.id, {
        endedReason: "silence-timeout",
        backgroundedAt,
      });

      expect(updated.endedReason).toBe("silence-timeout");
      expect(updated.backgroundedAt).toEqual(backgroundedAt);
      const reloaded = await repo.getById(created.id);
      expect(reloaded?.endedReason).toBe("silence-timeout");
      expect(reloaded?.backgroundedAt).toEqual(backgroundedAt);
    });

    it("update can record timeCheckAskedAt", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      const timeCheckAskedAt = new Date("2026-01-01T00:12:00.000Z");

      const updated = await repo.update(created.id, { timeCheckAskedAt });

      expect(updated.timeCheckAskedAt).toEqual(timeCheckAskedAt);
      expect((await repo.getById(created.id))?.timeCheckAskedAt).toEqual(timeCheckAskedAt);
    });

    it("delete removes the interview (#5)", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });

      await repo.delete(created.id);

      expect(await repo.getById(created.id)).toBeNull();
    });

    it("delete rejects an unknown id", async () => {
      const repo = await makeRepository();
      await expect(repo.delete(NONEXISTENT_ID)).rejects.toThrow();
    });
  });
}
