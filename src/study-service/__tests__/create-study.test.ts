import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy, InvalidStudyInputError } from "../create-study";

const validInput = {
  title: "How AI Actually Shows Up in a PM's Day",
  description: "how product managers really use AI at work",
  preInterviewQuestions: [],
};

describe("createStudy", () => {
  it("persists an open study with a generated link token", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await createStudy(repo, validInput);

    expect(study.title).toBe(validInput.title);
    expect(study.description).toBe(validInput.description);
    expect(study.preInterviewQuestions).toEqual([]);
    expect(study.status).toBe("open");
    expect(study.linkToken).toBeTruthy();
    expect(await repo.getByLinkToken(study.linkToken)).toEqual(study);
  });

  it("generates a distinct link token per study", async () => {
    const repo = new InMemoryStudyRepository();
    const first = await createStudy(repo, validInput);
    const second = await createStudy(repo, validInput);

    expect(first.linkToken).not.toBe(second.linkToken);
  });

  it("rejects an invalid study input without persisting anything", async () => {
    const repo = new InMemoryStudyRepository();

    await expect(createStudy(repo, { ...validInput, title: "" })).rejects.toThrow(
      InvalidStudyInputError,
    );
    expect(await repo.list()).toEqual([]);
  });
});
