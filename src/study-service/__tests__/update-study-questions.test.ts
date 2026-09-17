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
});
