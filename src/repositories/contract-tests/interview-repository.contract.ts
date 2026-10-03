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
      expect(interview.extensionGranted).toBeNull();
      expect(interview.secondTimeCheckAskedAt).toBeNull();
      expect(interview.trackingId).toBeNull();
      expect(interview.redactedTranscript).toBeNull();
      expect(interview.redactedAt).toBeNull();
      expect(interview.mode).toBe("voice");
      expect(interview.lastActivityAt).toBeNull();
      expect(interview.idleNudgeSentAt).toBeNull();
      expect(interview.switchedToTextAt).toBeNull();
    });

    it("creates an interview with an explicit text mode", async () => {
      const repo = await makeRepository();
      const interview = await repo.create({
        studyId: getStudyId(),
        firstName: "Alex",
        email: "alex@example.com",
        mode: "text",
      });

      expect(interview.mode).toBe("text");
      expect((await repo.getById(interview.id))?.mode).toBe("text");
    });

    it("update can set and round-trip mode, lastActivityAt, idleNudgeSentAt, and switchedToTextAt", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      const lastActivityAt = new Date("2026-01-01T00:03:00.000Z");
      const idleNudgeSentAt = new Date("2026-01-01T00:06:00.000Z");
      const switchedToTextAt = new Date("2026-01-01T00:00:20.000Z");

      const updated = await repo.update(created.id, {
        mode: "text",
        lastActivityAt,
        idleNudgeSentAt,
        switchedToTextAt,
      });

      expect(updated.mode).toBe("text");
      expect(updated.lastActivityAt).toEqual(lastActivityAt);
      expect(updated.idleNudgeSentAt).toEqual(idleNudgeSentAt);
      expect(updated.switchedToTextAt).toEqual(switchedToTextAt);
      const reloaded = await repo.getById(created.id);
      expect(reloaded?.mode).toBe("text");
      expect(reloaded?.lastActivityAt).toEqual(lastActivityAt);
      expect(reloaded?.idleNudgeSentAt).toEqual(idleNudgeSentAt);
      expect(reloaded?.switchedToTextAt).toEqual(switchedToTextAt);
    });

    it("update can clear lastActivityAt and idleNudgeSentAt back to null", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      await repo.update(created.id, {
        lastActivityAt: new Date("2026-01-01T00:03:00.000Z"),
        idleNudgeSentAt: new Date("2026-01-01T00:06:00.000Z"),
      });

      const updated = await repo.update(created.id, {
        lastActivityAt: null,
        idleNudgeSentAt: null,
      });

      expect(updated.lastActivityAt).toBeNull();
      expect(updated.idleNudgeSentAt).toBeNull();
    });

    it("creates an interview with a tracking id when provided", async () => {
      const repo = await makeRepository();
      const interview = await repo.create({
        studyId: getStudyId(),
        firstName: "Alex",
        email: "alex@example.com",
        trackingId: "third-party-abc-123",
      });

      expect(interview.trackingId).toBe("third-party-abc-123");
      expect((await repo.getById(interview.id))?.trackingId).toBe("third-party-abc-123");
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

    it("listActiveTextInterviews returns only in-progress text interviews, oldest first", async () => {
      const repo = await makeRepository();
      const studyId = getStudyId();
      const first = await repo.create({
        studyId,
        firstName: "A",
        email: "a@example.com",
        mode: "text",
      });
      const second = await repo.create({
        studyId,
        firstName: "B",
        email: "b@example.com",
        mode: "text",
      });
      const pendingText = await repo.create({
        studyId,
        firstName: "C",
        email: "c@example.com",
        mode: "text",
      });
      const completedText = await repo.create({
        studyId,
        firstName: "D",
        email: "d@example.com",
        mode: "text",
      });
      const voice = await repo.create({ studyId, firstName: "E", email: "e@example.com" });
      await repo.update(first.id, { status: "in-progress" });
      await repo.update(second.id, { status: "in-progress" });
      await repo.update(completedText.id, { status: "completed" });
      await repo.update(voice.id, { status: "in-progress" });

      const active = await repo.listActiveTextInterviews();

      expect(active.map((i) => i.id)).toEqual([first.id, second.id]);
      expect(active.every((i) => i.mode === "text" && i.status === "in-progress")).toBe(true);
      expect(active.map((i) => i.id)).not.toContain(pendingText.id);
    });

    it("listActiveTextInterviews is empty when there are none", async () => {
      const repo = await makeRepository();
      await repo.create({ studyId: getStudyId(), firstName: "A", email: "a@example.com" });

      expect(await repo.listActiveTextInterviews()).toEqual([]);
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

    it("update can record extensionGranted and secondTimeCheckAskedAt", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      const secondTimeCheckAskedAt = new Date("2026-01-01T00:22:00.000Z");

      const updated = await repo.update(created.id, {
        extensionGranted: true,
        secondTimeCheckAskedAt,
      });

      expect(updated.extensionGranted).toBe(true);
      expect(updated.secondTimeCheckAskedAt).toEqual(secondTimeCheckAskedAt);
      const reloaded = await repo.getById(created.id);
      expect(reloaded?.extensionGranted).toBe(true);
      expect(reloaded?.secondTimeCheckAskedAt).toEqual(secondTimeCheckAskedAt);
    });

    it("update can record extensionGranted: false", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });

      const updated = await repo.update(created.id, { extensionGranted: false });

      expect(updated.extensionGranted).toBe(false);
      expect((await repo.getById(created.id))?.extensionGranted).toBe(false);
    });

    it("update can set and round-trip redactedTranscript/redactedAt", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        studyId: getStudyId(),
        firstName: "Sam",
        email: "sam@example.com",
      });
      const redactedTranscript = [
        { speaker: "interviewer" as const, text: "Hi there.", timestampMs: 0 },
        { speaker: "participant" as const, text: "Hi, I'm [Participant].", timestampMs: 2000 },
      ];
      const redactedAt = new Date("2026-01-01T00:05:00.000Z");

      const updated = await repo.update(created.id, { redactedTranscript, redactedAt });

      expect(updated.redactedTranscript).toEqual(redactedTranscript);
      expect(updated.redactedAt).toEqual(redactedAt);
      const reloaded = await repo.getById(created.id);
      expect(reloaded?.redactedTranscript).toEqual(redactedTranscript);
      expect(reloaded?.redactedAt).toEqual(redactedAt);
    });

    describe("updateIfNotCompleted", () => {
      it("applies the patch and returns the updated interview when it is not completed", async () => {
        const repo = await makeRepository();
        const created = await repo.create({
          studyId: getStudyId(),
          firstName: "Sam",
          email: "sam@example.com",
        });
        await repo.update(created.id, { status: "in-progress" });
        const completedAt = new Date("2026-01-01T00:10:00.000Z");

        const result = await repo.updateIfNotCompleted(created.id, {
          status: "completed",
          completedAt,
          endedReason: "assistant-said-end-call-phrase",
        });

        expect(result?.status).toBe("completed");
        expect(result?.completedAt).toEqual(completedAt);
        expect(result?.endedReason).toBe("assistant-said-end-call-phrase");
        const reloaded = await repo.getById(created.id);
        expect(reloaded?.status).toBe("completed");
        expect(reloaded?.endedReason).toBe("assistant-said-end-call-phrase");
      });

      it("also applies to a pending interview (completion can arrive before a start event)", async () => {
        const repo = await makeRepository();
        const created = await repo.create({
          studyId: getStudyId(),
          firstName: "Sam",
          email: "sam@example.com",
        });

        const result = await repo.updateIfNotCompleted(created.id, { status: "completed" });

        expect(result?.status).toBe("completed");
      });

      it("returns null and changes nothing when the interview is already completed", async () => {
        const repo = await makeRepository();
        const created = await repo.create({
          studyId: getStudyId(),
          firstName: "Sam",
          email: "sam@example.com",
        });
        const firstTranscript = [{ speaker: "interviewer" as const, text: "Hi.", timestampMs: 0 }];
        await repo.updateIfNotCompleted(created.id, {
          status: "completed",
          transcript: firstTranscript,
          endedReason: "first",
        });

        const result = await repo.updateIfNotCompleted(created.id, {
          status: "completed",
          transcript: [{ speaker: "interviewer" as const, text: "Overwritten.", timestampMs: 0 }],
          endedReason: "second",
        });

        expect(result).toBeNull();
        const reloaded = await repo.getById(created.id);
        expect(reloaded?.transcript).toEqual(firstTranscript);
        expect(reloaded?.endedReason).toBe("first");
      });

      it("lets only one of two concurrent completions win", async () => {
        const repo = await makeRepository();
        const created = await repo.create({
          studyId: getStudyId(),
          firstName: "Sam",
          email: "sam@example.com",
        });
        await repo.update(created.id, { status: "in-progress" });

        const results = await Promise.all([
          repo.updateIfNotCompleted(created.id, { status: "completed", endedReason: "a" }),
          repo.updateIfNotCompleted(created.id, { status: "completed", endedReason: "b" }),
        ]);

        expect(results.filter((r) => r !== null)).toHaveLength(1);
        const winner = results.find((r) => r !== null);
        expect((await repo.getById(created.id))?.endedReason).toBe(winner?.endedReason);
      });

      it("rejects an unknown id", async () => {
        const repo = await makeRepository();
        await expect(
          repo.updateIfNotCompleted(NONEXISTENT_ID, { status: "completed" }),
        ).rejects.toThrow();
      });
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
