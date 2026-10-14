import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { resolveLink } from "../resolve-link";

const base = {
  title: "How AI Actually Shows Up in a PM's Day",
  description: "how product managers really use AI at work",
  preInterviewQuestions: [],
};

describe("resolveLink", () => {
  it("resolves the voice token to the voice channel", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({ ...base, linkToken: "voice", textLinkToken: "text" });

    const resolved = await resolveLink(repo, "voice");

    expect(resolved?.channel).toBe("voice");
    expect(resolved?.study.id).toBe(study.id);
  });

  it("resolves the text token to the text channel of the same study", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await repo.create({ ...base, linkToken: "voice", textLinkToken: "text" });

    const resolved = await resolveLink(repo, "text");

    expect(resolved?.channel).toBe("text");
    expect(resolved?.study.id).toBe(study.id);
  });

  it("returns null for an unknown token", async () => {
    const repo = new InMemoryStudyRepository();
    await repo.create({ ...base, linkToken: "voice", textLinkToken: "text" });

    expect(await resolveLink(repo, "nope")).toBeNull();
  });

  it("does not resolve a text token that sits on a feedback study", async () => {
    const repo = new InMemoryStudyRepository();
    await repo.create({
      ...base,
      type: "feedback",
      feedbackQuestions: ["How did it go?"],
      linkToken: "voice",
      textLinkToken: "text",
    });

    expect(await resolveLink(repo, "text")).toBeNull();
    expect((await resolveLink(repo, "voice"))?.channel).toBe("voice");
  });
});
