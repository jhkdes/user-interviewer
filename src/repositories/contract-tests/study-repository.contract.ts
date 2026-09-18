import { describe, expect, it } from "vitest";
import type { PreInterviewQuestion } from "@/domain";
import type { StudyRepository } from "../study-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

const sampleTitle = "How Controller Keeps Financial Clean";
const sampleDescription = "challenges in keeping financial statements clean and reconciled";
const sampleQuestions: PreInterviewQuestion[] = [
  {
    id: "role",
    label: "What's your current role?",
    type: "single",
    options: ["Controller", "Assistant Controller", "Accounting Manager"],
    allowOther: true,
  },
];

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
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "token-1",
      });

      expect(study.id).toBeTruthy();
      expect(study.title).toBe(sampleTitle);
      expect(study.description).toBe(sampleDescription);
      expect(study.preInterviewQuestions).toEqual(sampleQuestions);
      expect(study.linkToken).toBe("token-1");
      expect(study.status).toBe("open");
      expect(study.closedAt).toBeNull();
      expect(study.createdAt).toBeInstanceOf(Date);
      expect(study.researchTopic).toBeNull();
      expect(study.customPrompt).toBeNull();
      expect(study.voiceProvider).toBe("vapi");
    });

    it("defaults type to 'discovery' with empty feedbackQuestions when omitted", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "token-default-type",
      });

      expect(study.type).toBe("discovery");
      expect(study.feedbackQuestions).toEqual([]);
    });

    it("creates a feedback-type study with feedbackQuestions and empty preInterviewQuestions", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        title: "Post-webinar feedback",
        description: "quick check-in after today's session",
        type: "feedback",
        preInterviewQuestions: [],
        feedbackQuestions: ["What did you think of the content?"],
        linkToken: "token-feedback-type",
      });

      expect(study.type).toBe("feedback");
      expect(study.feedbackQuestions).toEqual(["What did you think of the content?"]);
      expect(study.preInterviewQuestions).toEqual([]);

      const reloaded = await repo.getById(study.id);
      expect(reloaded?.type).toBe("feedback");
      expect(reloaded?.feedbackQuestions).toEqual(["What did you think of the content?"]);
    });

    it("creates a study with an empty preInterviewQuestions list", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: [],
        linkToken: "token-no-questions",
      });

      expect(study.preInterviewQuestions).toEqual([]);
    });

    it("creates a study with an explicit voiceProvider", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "token-elevenlabs",
        voiceProvider: "elevenlabs",
      });

      expect(study.voiceProvider).toBe("elevenlabs");
    });

    it("creates a study with a research topic when provided", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        researchTopic: "How AI actually shows up in a PM's day",
        linkToken: "token-with-topic",
      });

      expect(study.researchTopic).toBe("How AI actually shows up in a PM's day");
    });

    it("creates a study with a custom prompt when provided", async () => {
      const repo = await makeRepository();
      const study = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        customPrompt: "You are a research interviewer for {{participant_name}}...",
        linkToken: "token-with-custom-prompt",
      });

      expect(study.customPrompt).toBe("You are a research interviewer for {{participant_name}}...");
    });

    it("getById returns the created study", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
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
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
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
      await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "a",
      });
      await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "b",
      });

      const studies = await repo.list();
      expect(studies).toHaveLength(2);
      expect(studies.map((s) => s.linkToken).sort()).toEqual(["a", "b"]);
    });

    it("updateStatus closes a study and returns the updated record", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
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

    it("extendLink sets linkExtendedAt and returns the updated record", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "to-extend",
      });
      expect(created.linkExtendedAt).toBeNull();

      const extended = await repo.extendLink(created.id);
      expect(extended.linkExtendedAt).toBeInstanceOf(Date);

      const reloaded = await repo.getById(created.id);
      expect(reloaded?.linkExtendedAt).toBeInstanceOf(Date);
    });

    it("extendLink rejects an unknown id", async () => {
      const repo = await makeRepository();
      await expect(repo.extendLink(NONEXISTENT_ID)).rejects.toThrow();
    });

    it("updateDetails patches only the given fields and returns the updated record", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "to-update-details",
      });

      const newQuestions: PreInterviewQuestion[] = [
        { id: "years", label: "Years in the role?", type: "single", options: ["<1", "1-3", "3+"] },
      ];
      const updated = await repo.updateDetails(created.id, { preInterviewQuestions: newQuestions });

      expect(updated.preInterviewQuestions).toEqual(newQuestions);
      expect(updated.title).toBe(sampleTitle);
      expect(updated.description).toBe(sampleDescription);

      const reloaded = await repo.getById(created.id);
      expect(reloaded?.preInterviewQuestions).toEqual(newQuestions);
    });

    it("updateDetails can update title and description together", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "to-update-title-desc",
      });

      const updated = await repo.updateDetails(created.id, {
        title: "New Title",
        description: "new description",
      });

      expect(updated.title).toBe("New Title");
      expect(updated.description).toBe("new description");
      expect(updated.preInterviewQuestions).toEqual(sampleQuestions);
    });

    it("updateDetails rejects an unknown id", async () => {
      const repo = await makeRepository();
      await expect(repo.updateDetails(NONEXISTENT_ID, { title: "New Title" })).rejects.toThrow();
    });

    it("updateDetails can set researchTopic and customPrompt", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "to-update-research-topic",
      });

      const updated = await repo.updateDetails(created.id, {
        researchTopic: "dig into reconciliation breakdowns",
        customPrompt: "You are talking with {{participant_name}}.",
      });

      expect(updated.researchTopic).toBe("dig into reconciliation breakdowns");
      expect(updated.customPrompt).toBe("You are talking with {{participant_name}}.");

      const reloaded = await repo.getById(created.id);
      expect(reloaded?.researchTopic).toBe("dig into reconciliation breakdowns");
      expect(reloaded?.customPrompt).toBe("You are talking with {{participant_name}}.");
    });

    it("updateDetails can clear researchTopic and customPrompt back to null", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        researchTopic: "some topic",
        customPrompt: "some prompt",
        linkToken: "to-clear-research-topic",
      });

      const updated = await repo.updateDetails(created.id, {
        researchTopic: null,
        customPrompt: null,
      });

      expect(updated.researchTopic).toBeNull();
      expect(updated.customPrompt).toBeNull();
    });

    it("updateDetails can update feedbackQuestions without touching preInterviewQuestions", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: "Post-webinar feedback",
        description: "quick check-in after today's session",
        type: "feedback",
        preInterviewQuestions: [],
        feedbackQuestions: ["Original question"],
        linkToken: "to-update-feedback-questions",
      });

      const updated = await repo.updateDetails(created.id, {
        feedbackQuestions: ["What worked well?", "What could be improved?"],
      });

      expect(updated.feedbackQuestions).toEqual(["What worked well?", "What could be improved?"]);
      expect(updated.preInterviewQuestions).toEqual([]);
      expect(updated.type).toBe("feedback");

      const reloaded = await repo.getById(created.id);
      expect(reloaded?.feedbackQuestions).toEqual(["What worked well?", "What could be improved?"]);
    });

    it("delete removes the study", async () => {
      const repo = await makeRepository();
      const created = await repo.create({
        title: sampleTitle,
        description: sampleDescription,
        preInterviewQuestions: sampleQuestions,
        linkToken: "to-delete",
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
