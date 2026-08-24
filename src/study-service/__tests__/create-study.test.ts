import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy, InvalidTargetProfileError } from "../create-study";

const validProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

describe("createStudy", () => {
  it("persists an open study with a generated link token", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await createStudy(repo, { targetProfile: validProfile });

    expect(study.targetProfile).toEqual(validProfile);
    expect(study.status).toBe("open");
    expect(study.linkToken).toBeTruthy();
    expect(await repo.getByLinkToken(study.linkToken)).toEqual(study);
  });

  it("generates a distinct link token per study", async () => {
    const repo = new InMemoryStudyRepository();
    const first = await createStudy(repo, { targetProfile: validProfile });
    const second = await createStudy(repo, { targetProfile: validProfile });

    expect(first.linkToken).not.toBe(second.linkToken);
  });

  it("rejects an invalid target profile without persisting anything", async () => {
    const repo = new InMemoryStudyRepository();

    await expect(
      createStudy(repo, { targetProfile: { ...validProfile, industry: "" } }),
    ).rejects.toThrow(InvalidTargetProfileError);
    expect(await repo.list()).toEqual([]);
  });
});
