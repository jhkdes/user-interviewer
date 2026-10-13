import { describe, expect, it } from "vitest";
import { JOB_SEARCH_PARTICIPANT_COPY } from "@/job-search-study/participant-copy";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy, InvalidStudyInputError } from "../create-study";
import { updateParticipantCopy } from "../update-participant-copy";

const input = {
  title: "How Controllers Keep Financial Clean",
  description: "keeping statements clean",
  preInterviewQuestions: [],
};

describe("updateParticipantCopy", () => {
  it("saves tidied copy and returns the study", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await createStudy(repo, input);

    const updated = await updateParticipantCopy(repo, study.id, {
      intro: { tagline: "  Get a free report.  " },
    });

    expect(updated.participantCopy).toEqual({ intro: { tagline: "Get a free report." } });
    expect((await repo.getById(study.id))?.participantCopy).toEqual(updated.participantCopy);
  });

  it("goes back to the standard wording for null or copy with nothing in it", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await createStudy(repo, input);
    await updateParticipantCopy(repo, study.id, { completion: { title: "Thanks" } });

    expect((await updateParticipantCopy(repo, study.id, null)).participantCopy).toBeNull();
    await updateParticipantCopy(repo, study.id, { completion: { title: "Thanks" } });
    const blank = await updateParticipantCopy(repo, study.id, { intro: { tagline: " " } });
    expect(blank.participantCopy).toBeNull();
  });

  it("rejects invalid copy and leaves the study as it was", async () => {
    const repo = new InMemoryStudyRepository();
    const study = await createStudy(repo, input);

    await expect(
      updateParticipantCopy(repo, study.id, { intro: { tagline: "x".repeat(400) } }),
    ).rejects.toThrow(InvalidStudyInputError);
    expect((await repo.getById(study.id))?.participantCopy).toBeNull();
  });

  it("rejects a feedback study, and an unknown study", async () => {
    const repo = new InMemoryStudyRepository();
    const feedback = await createStudy(repo, {
      title: "Webinar feedback",
      description: "today's webinar",
      type: "feedback",
      feedbackQuestions: ["How was it?"],
      preInterviewQuestions: [],
    });

    await expect(
      updateParticipantCopy(repo, feedback.id, { completion: { title: "x" } }),
    ).rejects.toThrow(/only be customized for discovery/);
    await expect(updateParticipantCopy(repo, "missing", null)).rejects.toThrow(/not found/);
  });
});

describe("createStudy and participant copy", () => {
  it("leaves an ordinary study on the standard wording", async () => {
    const study = await createStudy(new InMemoryStudyRepository(), input);

    expect(study.participantCopy).toBeNull();
  });

  it("gives a job-search study its own wording, unless copy is supplied", async () => {
    const repo = new InMemoryStudyRepository();

    const jobSearch = await createStudy(repo, { ...input, reportPipeline: "job-search" });
    const custom = await createStudy(repo, {
      ...input,
      reportPipeline: "job-search",
      participantCopy: { completion: { title: "Mine" } },
    });

    expect(jobSearch.participantCopy).toEqual(JOB_SEARCH_PARTICIPANT_COPY);
    expect(custom.participantCopy).toEqual({ completion: { title: "Mine" } });
  });
});
