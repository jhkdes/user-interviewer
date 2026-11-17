import { describe, expect, it } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { intakeSkipped } from "../intake-skipped";
import { ConsentRequiredError, InvalidIntakeError, startInterview } from "../start-interview";

const TRACKING = "k3Zq9vX1mT8wRb4Yp7NcHd";
const nothingTyped = { firstName: "", email: "", consentGiven: true };

async function setup(study: { skipIntake?: boolean; screener?: boolean } = {}) {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const invitationRepo = new InMemoryPartnerInvitationRepository();
  const created = await studyRepo.create({
    type: "feedback",
    title: "Feedback for Jae Kim",
    description: "Jae Kim",
    preInterviewQuestions: study.screener
      ? [{ id: "q1", label: "Your team?", type: "single", options: ["A", "B"], allowOther: false }]
      : [],
    linkToken: "voice-token",
    textLinkToken: "text-token",
    partnerId: "partner-1",
    ownerRef: "pfa_user_123",
    subjectName: "Jae Kim",
    customPrompt: "Interview {{colleague_first_name}}.",
    voiceProvider: "elevenlabs",
    ...(study.skipIntake === undefined ? {} : { skipIntake: study.skipIntake }),
  });
  await invitationRepo.create({
    studyId: created.id,
    trackingId: TRACKING,
    colleagueFirstName: "Priya",
    context: {},
  });
  return {
    study: created,
    deps: { studyRepo, interviewRepo, invitationRepo, textEnabled: true },
  };
}

describe("startInterview when the intake form is skipped", () => {
  it("is the default for a partner study: takes the name from the invitation and keeps no email", async () => {
    const { deps } = await setup();

    const interview = await startInterview(deps, {
      ...nothingTyped,
      linkToken: "voice-token",
      trackingId: TRACKING,
    });

    expect(interview.firstName).toBe("Priya");
    expect(interview.email).toBe("");
    expect(interview.consentGivenAt).toBeInstanceOf(Date);
    expect(interview.snapshot?.prompt).toContain("Interview Priya.");
  });

  it("ignores a name or email the browser sends", async () => {
    const { deps } = await setup();

    const interview = await startInterview(deps, {
      firstName: "Someone Else",
      email: "someone@example.com",
      consentGiven: true,
      linkToken: "voice-token",
      trackingId: TRACKING,
    });

    expect(interview.firstName).toBe("Priya");
    expect(interview.email).toBe("");
  });

  it("works on the text link, as a typed interview", async () => {
    const { deps } = await setup();

    const interview = await startInterview(deps, {
      ...nothingTyped,
      linkToken: "text-token",
      trackingId: TRACKING,
    });

    expect(interview.mode).toBe("text");
    expect(interview.firstName).toBe("Priya");
  });

  it("still needs consent", async () => {
    const { deps } = await setup();

    await expect(
      startInterview(deps, {
        ...nothingTyped,
        consentGiven: false,
        linkToken: "voice-token",
        trackingId: TRACKING,
      }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("asks for a name and email again once the partner turns it off", async () => {
    const { deps } = await setup({ skipIntake: false });

    await expect(
      startInterview(deps, { ...nothingTyped, linkToken: "voice-token", trackingId: TRACKING }),
    ).rejects.toBeInstanceOf(InvalidIntakeError);

    const interview = await startInterview(deps, {
      firstName: "Pri",
      email: "pri@example.com",
      consentGiven: true,
      linkToken: "voice-token",
      trackingId: TRACKING,
    });
    expect(interview.firstName).toBe("Pri");
    expect(interview.email).toBe("pri@example.com");
  });

  it("keeps the form for a study with screener questions, whatever the setting says", async () => {
    const { deps, study } = await setup({ skipIntake: true, screener: true });

    expect(intakeSkipped(study)).toBe(false);
    await expect(
      startInterview(deps, { ...nothingTyped, linkToken: "voice-token", trackingId: TRACKING }),
    ).rejects.toBeInstanceOf(InvalidIntakeError);
  });
});

describe("intakeSkipped", () => {
  const partnerStudy = { partnerId: "p", skipIntake: true, preInterviewQuestions: [] };

  it("is true only for a partner study that has the setting on and no screener questions", () => {
    expect(intakeSkipped(partnerStudy)).toBe(true);
    expect(intakeSkipped({ ...partnerStudy, skipIntake: false })).toBe(false);
    expect(
      intakeSkipped({
        ...partnerStudy,
        preInterviewQuestions: [
          { id: "q", label: "?", type: "single", options: ["A"], allowOther: false },
        ],
      }),
    ).toBe(false);
  });

  it("is never true for a dashboard study, which has no partner", () => {
    expect(intakeSkipped({ ...partnerStudy, partnerId: null })).toBe(false);
  });
});
