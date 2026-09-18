import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { InvalidStudyInputError } from "../create-study";
import { updateStudyQuestions } from "../update-study-questions";

const newQuestions = [
  {
    id: "years",
    label: "How many years in the role?",
    type: "single" as const,
    options: ["<1", "1-3", "3+"],
  },
];

async function setup() {
  const repo = new InMemoryStudyRepository();
  const study = await repo.create({
    title: "How Controllers Keep Financial Clean",
    description: "reconciliation challenges",
    preInterviewQuestions: [],
    linkToken: "token",
  });
  return { repo, study };
}

describe("updateStudyQuestions", () => {
  it("updates the study's pre-interview questions", async () => {
    const { repo, study } = await setup();

    const updated = await updateStudyQuestions(repo, study.id, {
      preInterviewQuestions: newQuestions,
    });

    expect(updated.preInterviewQuestions).toEqual(newQuestions);
    expect(updated.title).toBe(study.title);
    expect(updated.description).toBe(study.description);
  });

  it("also updates title and description when provided", async () => {
    const { repo, study } = await setup();

    const updated = await updateStudyQuestions(repo, study.id, {
      title: "New Title",
      description: "new description",
      preInterviewQuestions: newQuestions,
    });

    expect(updated.title).toBe("New Title");
    expect(updated.description).toBe("new description");
  });

  it("rejects blank title/description when patching only questions", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({
      title: "",
      description: "",
      preInterviewQuestions: [],
      linkToken: "token-blank",
    });

    await expect(
      updateStudyQuestions(repo, study.id, { preInterviewQuestions: newQuestions }),
    ).rejects.toThrow(InvalidStudyInputError);
  });

  it("rejects a question with fewer than 2 options", async () => {
    const { repo, study } = await setup();

    await expect(
      updateStudyQuestions(repo, study.id, {
        preInterviewQuestions: [{ ...newQuestions[0], options: ["Only one"] }],
      }),
    ).rejects.toThrow(InvalidStudyInputError);
  });

  it("rejects an unknown study id", async () => {
    const repo = new InMemoryStudyRepository();

    await expect(
      updateStudyQuestions(repo, NONEXISTENT_ID, { preInterviewQuestions: newQuestions }),
    ).rejects.toThrow();
  });

  it("sets researchTopic and customPrompt when provided", async () => {
    const { repo, study } = await setup();

    const updated = await updateStudyQuestions(repo, study.id, {
      preInterviewQuestions: newQuestions,
      researchTopic: "dig into reconciliation breakdowns",
      customPrompt: "You are talking with {{participant_name}}.",
    });

    expect(updated.researchTopic).toBe("dig into reconciliation breakdowns");
    expect(updated.customPrompt).toBe("You are talking with {{participant_name}}.");
  });

  it("leaves researchTopic/customPrompt untouched when omitted", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({
      title: "How Controllers Keep Financial Clean",
      description: "reconciliation challenges",
      preInterviewQuestions: [],
      researchTopic: "existing topic",
      customPrompt: "existing prompt",
      linkToken: "token-existing",
    });

    const updated = await updateStudyQuestions(repo, study.id, {
      preInterviewQuestions: newQuestions,
    });

    expect(updated.researchTopic).toBe("existing topic");
    expect(updated.customPrompt).toBe("existing prompt");
  });

  it("clears researchTopic/customPrompt back to null when explicitly passed null", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({
      title: "How Controllers Keep Financial Clean",
      description: "reconciliation challenges",
      preInterviewQuestions: [],
      researchTopic: "existing topic",
      customPrompt: "existing prompt",
      linkToken: "token-to-clear",
    });

    const updated = await updateStudyQuestions(repo, study.id, {
      preInterviewQuestions: newQuestions,
      researchTopic: null,
      customPrompt: null,
    });

    expect(updated.researchTopic).toBeNull();
    expect(updated.customPrompt).toBeNull();
  });

  describe("feedback-type studies", () => {
    async function setupFeedback() {
      const repo = new InMemoryStudyRepository();
      const study = await repo.create({
        title: "Post-webinar feedback",
        description: "quick check-in after today's session",
        type: "feedback",
        preInterviewQuestions: [],
        feedbackQuestions: ["What did you think of the content?"],
        linkToken: "feedback-token",
      });
      return { repo, study };
    }

    it("updates feedbackQuestions without requiring preInterviewQuestions", async () => {
      const { repo, study } = await setupFeedback();

      const updated = await updateStudyQuestions(repo, study.id, {
        feedbackQuestions: ["What worked well?", "What could be improved?"],
      });

      expect(updated.feedbackQuestions).toEqual(["What worked well?", "What could be improved?"]);
      expect(updated.type).toBe("feedback");
    });

    it("rejects an empty feedbackQuestions list", async () => {
      const { repo, study } = await setupFeedback();

      await expect(
        updateStudyQuestions(repo, study.id, { feedbackQuestions: [] }),
      ).rejects.toThrow(InvalidStudyInputError);
    });

    it("leaves feedbackQuestions untouched when omitted, e.g. a title-only patch", async () => {
      const { repo, study } = await setupFeedback();

      const updated = await updateStudyQuestions(repo, study.id, { title: "New title" });

      expect(updated.title).toBe("New title");
      expect(updated.feedbackQuestions).toEqual(["What did you think of the content?"]);
    });
  });
});
