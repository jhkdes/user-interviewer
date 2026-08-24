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
      expect(interview.startedAt).toBeNull();
      expect(interview.completedAt).toBeNull();
      expect(interview.createdAt).toBeInstanceOf(Date);
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

    it("update rejects an unknown id", async () => {
      const repo = await makeRepository();
      await expect(repo.update(NONEXISTENT_ID, { status: "completed" })).rejects.toThrow();
    });
  });
}
