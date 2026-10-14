import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { addTextLink } from "../add-text-link";

const base = {
  title: "How AI Actually Shows Up in a PM's Day",
  description: "how product managers really use AI at work",
  preInterviewQuestions: [],
};

describe("addTextLink", () => {
  it("gives a discovery study without one a text link, distinct from its voice link", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({ ...base, linkToken: "voice" });

    const updated = await addTextLink(repo, study.id);

    expect(updated.textLinkToken).toBeTruthy();
    expect(updated.textLinkToken).not.toBe("voice");
    expect((await repo.getByTextLinkToken(updated.textLinkToken!))?.id).toBe(study.id);
  });

  it("keeps the existing text link when run again", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({ ...base, linkToken: "voice" });

    const first = await addTextLink(repo, study.id);
    const second = await addTextLink(repo, study.id);

    expect(second.textLinkToken).toBe(first.textLinkToken);
  });

  it("refuses a feedback study", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({
      ...base,
      type: "feedback",
      feedbackQuestions: ["How did it go?"],
      linkToken: "voice",
    });

    await expect(addTextLink(repo, study.id)).rejects.toThrow(/discovery/);
  });

  it("rejects an unknown study", async () => {
    await expect(addTextLink(new InMemoryStudyRepository(), "missing")).rejects.toThrow(
      /not found/,
    );
  });
});
