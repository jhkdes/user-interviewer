import { describe, expect, it } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import {
  ConsentRequiredError,
  InvalidIntakeError,
  StudyLinkInvalidError,
  StudyLinkNotFoundError,
  startInterview,
} from "../start-interview";

const targetProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

const validIntake = {
  firstName: "Jordan",
  email: "jordan@example.com",
  consentGiven: true,
};

async function setup() {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const study = await studyRepo.create({ targetProfile, linkToken: "the-link-token" });
  return { studyRepo, interviewRepo, study };
}

describe("startInterview", () => {
  it("creates an interview with consent recorded, for a valid link and valid intake", async () => {
    const { studyRepo, interviewRepo, study } = await setup();
    const now = new Date("2026-08-18T12:00:00.000Z");

    const interview = await startInterview(
      { studyRepo, interviewRepo, now },
      { ...validIntake, linkToken: study.linkToken },
    );

    expect(interview.studyId).toBe(study.id);
    expect(interview.firstName).toBe("Jordan");
    expect(interview.email).toBe("jordan@example.com");
    expect(interview.status).toBe("pending");
    expect(interview.roleDescription).toBeNull();
    expect(interview.consentGivenAt).toEqual(now);
  });

  it("rejects an unknown link token", async () => {
    const { studyRepo, interviewRepo } = await setup();

    await expect(
      startInterview({ studyRepo, interviewRepo }, { ...validIntake, linkToken: "nope" }),
    ).rejects.toThrow(StudyLinkNotFoundError);
  });

  it("rejects a closed study's link", async () => {
    const { studyRepo, interviewRepo, study } = await setup();
    await studyRepo.updateStatus(study.id, "closed");

    const error = await startInterview(
      { studyRepo, interviewRepo },
      { ...validIntake, linkToken: study.linkToken },
    ).catch((e) => e);

    expect(error).toBeInstanceOf(StudyLinkInvalidError);
    expect(error.reason).toBe("closed");
  });

  it("rejects an expired study's link", async () => {
    const { studyRepo, interviewRepo, study } = await setup();
    const eightDaysLater = new Date(study.createdAt.getTime() + 8 * 24 * 60 * 60 * 1000);

    const error = await startInterview(
      { studyRepo, interviewRepo, now: eightDaysLater },
      { ...validIntake, linkToken: study.linkToken },
    ).catch((e) => e);

    expect(error).toBeInstanceOf(StudyLinkInvalidError);
    expect(error.reason).toBe("expired");
  });

  it("rejects invalid intake fields without persisting an interview", async () => {
    const { studyRepo, interviewRepo, study } = await setup();

    await expect(
      startInterview(
        { studyRepo, interviewRepo },
        { ...validIntake, linkToken: study.linkToken, email: "not-an-email" },
      ),
    ).rejects.toThrow(InvalidIntakeError);
    expect(await interviewRepo.listByStudyId(study.id)).toEqual([]);
  });

  it("rejects when consent was not given", async () => {
    const { studyRepo, interviewRepo, study } = await setup();

    await expect(
      startInterview(
        { studyRepo, interviewRepo },
        { ...validIntake, linkToken: study.linkToken, consentGiven: false },
      ),
    ).rejects.toThrow(ConsentRequiredError);
    expect(await interviewRepo.listByStudyId(study.id)).toEqual([]);
  });
});
