import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy } from "../create-study";
import { InvalidStudyInputError } from "../create-study";
import { updateInterviewerLines } from "../update-interviewer-lines";

async function feedbackStudy(repo: InMemoryStudyRepository) {
  return createStudy(repo, {
    title: "Feedback",
    description: "the session",
    type: "feedback",
    feedbackQuestions: ["How was it?"],
    preInterviewQuestions: [],
  });
}

describe("updateInterviewerLines", () => {
  it("starts unset, so the standard wording applies", async () => {
    const study = await feedbackStudy(new InMemoryStudyRepository());

    expect(study.firstMessage).toBeNull();
    expect(study.closingQuestion).toBeNull();
  });

  it("saves either line without touching the other, and clears a line with null or blank text", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await feedbackStudy(repo);

    const first = await updateInterviewerLines(repo, study.id, {
      firstMessage: "  Hi {{participant_name}}.  ",
    });
    expect(first.firstMessage).toBe("Hi {{participant_name}}.");
    expect(first.closingQuestion).toBeNull();

    const both = await updateInterviewerLines(repo, study.id, {
      closingQuestion: "Anything to add?",
    });
    expect(both.firstMessage).toBe("Hi {{participant_name}}.");
    expect(both.closingQuestion).toBe("Anything to add?");

    const cleared = await updateInterviewerLines(repo, study.id, {
      firstMessage: null,
      closingQuestion: "   ",
    });
    expect(cleared.firstMessage).toBeNull();
    expect(cleared.closingQuestion).toBeNull();
  });

  it("rejects over-long or non-text lines and leaves the study unchanged", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await feedbackStudy(repo);

    await expect(
      updateInterviewerLines(repo, study.id, { firstMessage: "x".repeat(301) }),
    ).rejects.toThrow(InvalidStudyInputError);
    await expect(updateInterviewerLines(repo, study.id, { closingQuestion: 5 })).rejects.toThrow(
      InvalidStudyInputError,
    );
    expect((await repo.getById(study.id))?.firstMessage).toBeNull();
  });

  it("refuses discovery studies and unknown studies", async () => {
    const repo = new InMemoryStudyRepository();
    const discovery = await createStudy(repo, {
      title: "T",
      description: "D",
      preInterviewQuestions: [],
    });

    await expect(
      updateInterviewerLines(repo, discovery.id, { firstMessage: "Hi" }),
    ).rejects.toThrow(/only be set on feedback/);
    await expect(updateInterviewerLines(repo, "missing", {})).rejects.toThrow(/not found/);
  });
});
