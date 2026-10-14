import { describe, expect, it } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { StudyLinkInvalidError, StudyLinkNotFoundError, startInterview } from "../start-interview";

const intake = { firstName: "Jordan", email: "jordan@example.com", consentGiven: true };

async function setup(options: { type?: "discovery" | "feedback" } = {}) {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const study = await studyRepo.create({
    type: options.type ?? "discovery",
    title: "How AI Actually Shows Up in a PM's Day",
    description: "how product managers really use AI at work",
    preInterviewQuestions: [],
    feedbackQuestions: options.type === "feedback" ? ["How was it?"] : undefined,
    linkToken: "voice-token",
    textLinkToken: "text-token",
  });
  return { studyRepo, interviewRepo, study };
}

describe("startInterview through a study's two links", () => {
  it("makes a voice interview through the voice link", async () => {
    const { studyRepo, interviewRepo, study } = await setup();

    const interview = await startInterview(
      { studyRepo, interviewRepo, textEnabled: true },
      { ...intake, linkToken: "voice-token" },
    );

    expect(interview.studyId).toBe(study.id);
    expect(interview.mode).toBe("voice");
  });

  it("makes a typed interview of the same study through the text link", async () => {
    const { studyRepo, interviewRepo, study } = await setup();

    const interview = await startInterview(
      { studyRepo, interviewRepo, textEnabled: true },
      { ...intake, linkToken: "text-token" },
    );

    expect(interview.studyId).toBe(study.id);
    expect(interview.mode).toBe("text");
    expect(interview.consentGivenAt).toBeInstanceOf(Date);
  });

  it("treats the text link as unknown while typed interviews are off", async () => {
    const { studyRepo, interviewRepo } = await setup();

    await expect(
      startInterview({ studyRepo, interviewRepo }, { ...intake, linkToken: "text-token" }),
    ).rejects.toBeInstanceOf(StudyLinkNotFoundError);
    await expect(
      startInterview(
        { studyRepo, interviewRepo, textEnabled: false },
        { ...intake, linkToken: "text-token" },
      ),
    ).rejects.toBeInstanceOf(StudyLinkNotFoundError);
    // The voice link is unaffected.
    await expect(
      startInterview({ studyRepo, interviewRepo }, { ...intake, linkToken: "voice-token" }),
    ).resolves.toMatchObject({ mode: "voice" });
  });

  it("does not accept a text token on a feedback study", async () => {
    const { studyRepo, interviewRepo } = await setup({ type: "feedback" });

    await expect(
      startInterview(
        { studyRepo, interviewRepo, textEnabled: true },
        { ...intake, linkToken: "text-token" },
      ),
    ).rejects.toBeInstanceOf(StudyLinkNotFoundError);
  });

  it("closes both links together when the study is closed", async () => {
    const { studyRepo, interviewRepo, study } = await setup();
    await studyRepo.updateStatus(study.id, "closed");

    for (const linkToken of ["voice-token", "text-token"]) {
      await expect(
        startInterview({ studyRepo, interviewRepo, textEnabled: true }, { ...intake, linkToken }),
      ).rejects.toBeInstanceOf(StudyLinkInvalidError);
    }
  });

  it("expires both links together, and extending the study revives both", async () => {
    const { studyRepo, interviewRepo, study } = await setup();
    const eightDaysLater = new Date(study.createdAt.getTime() + 8 * 24 * 60 * 60 * 1000);

    for (const linkToken of ["voice-token", "text-token"]) {
      await expect(
        startInterview(
          { studyRepo, interviewRepo, textEnabled: true, now: eightDaysLater },
          { ...intake, linkToken },
        ),
      ).rejects.toMatchObject({ reason: "expired" });
    }

    // Extending counts from now, so "now" is within the new window.
    await studyRepo.extendLink(study.id);
    for (const linkToken of ["voice-token", "text-token"]) {
      await expect(
        startInterview({ studyRepo, interviewRepo, textEnabled: true }, { ...intake, linkToken }),
      ).resolves.toBeDefined();
    }
  });
});
