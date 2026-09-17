import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { extendLink } from "../extend-link";

describe("extendLink", () => {
  it("sets linkExtendedAt on the study", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({
      title: "How AI Actually Shows Up in a PM's Day",
      description: "how product managers really use AI at work",
      preInterviewQuestions: [],
      linkToken: "token",
    });
    expect(study.linkExtendedAt).toBeNull();

    const extended = await extendLink(repo, study.id);
    expect(extended.linkExtendedAt).toBeInstanceOf(Date);
  });

  it("rejects an unknown study id", async () => {
    const repo = new InMemoryStudyRepository();
    await expect(extendLink(repo, NONEXISTENT_ID)).rejects.toThrow();
  });
});
