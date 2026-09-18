import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { closeStudy } from "../close-study";

describe("closeStudy", () => {
  it("marks the study closed", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({
      title: "How AI Actually Shows Up in a PM's Day",
      description: "how product managers really use AI at work",
      preInterviewQuestions: [],
      linkToken: "token",
    });

    const closed = await closeStudy(repo, study.id);
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it("rejects an unknown study id", async () => {
    const repo = new InMemoryStudyRepository();
    await expect(closeStudy(repo, NONEXISTENT_ID)).rejects.toThrow();
  });
});
