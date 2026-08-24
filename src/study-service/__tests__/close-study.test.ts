import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { closeStudy } from "../close-study";

const validProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

describe("closeStudy", () => {
  it("marks the study closed", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({ targetProfile: validProfile, linkToken: "token" });

    const closed = await closeStudy(repo, study.id);
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it("rejects an unknown study id", async () => {
    const repo = new InMemoryStudyRepository();
    await expect(closeStudy(repo, NONEXISTENT_ID)).rejects.toThrow();
  });
});
