import { describe, expect, it } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { StudyLinkNotFoundError, startInterview } from "../start-interview";

const TRACKING = "k3Zq9vX1mT8wRb4Yp7NcHd";
const intake = { firstName: "Priya", email: "priya@example.com", consentGiven: true };

async function setup() {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const invitationRepo = new InMemoryPartnerInvitationRepository();
  const study = await studyRepo.create({
    type: "feedback",
    title: "Feedback for Jae Kim",
    description: "Jae Kim",
    preInterviewQuestions: [],
    linkToken: "voice-token",
    textLinkToken: "text-token",
    partnerId: "partner-1",
    ownerRef: "pfa_user_123",
    subjectName: "Jae Kim",
    customPrompt: "Interview {{colleague_first_name}} about {{subject_name}}.",
    firstMessage: "Hi {{colleague_first_name}}!",
    voiceProvider: "elevenlabs",
  });
  const invitation = await invitationRepo.create({
    studyId: study.id,
    trackingId: TRACKING,
    colleagueFirstName: "Priya",
    context: { workContext: "We shipped billing." },
  });
  return {
    study,
    invitation,
    deps: { studyRepo, interviewRepo, invitationRepo, textEnabled: true },
    interviewRepo,
    invitationRepo,
    studyRepo,
  };
}

describe("startInterview on a partner study", () => {
  it("ties the interview to its invitation and freezes what it starts with", async () => {
    const { deps, invitation } = await setup();

    const interview = await startInterview(deps, {
      ...intake,
      linkToken: "voice-token",
      trackingId: TRACKING,
    });

    expect(interview.invitationId).toBe(invitation.id);
    expect(interview.trackingId).toBe(TRACKING);
    expect(interview.consentGivenAt).toBeInstanceOf(Date);
    expect(interview.snapshot).toMatchObject({
      firstMessage: "Hi Priya!",
      targetMinutes: 5,
      hardStopMinutes: 7,
    });
    expect(interview.snapshot?.prompt).toContain("Interview Priya about Jae Kim.");
  });

  it("does not follow later changes to the study or the invitation", async () => {
    const { deps, invitationRepo, studyRepo, study, invitation } = await setup();
    const interview = await startInterview(deps, {
      ...intake,
      linkToken: "voice-token",
      trackingId: TRACKING,
    });

    await studyRepo.updateDetails(study.id, { customPrompt: "Changed", firstMessage: "Changed" });
    await invitationRepo.update(invitation.id, { colleagueFirstName: "Changed" });

    const stored = await deps.interviewRepo.getById(interview.id);
    expect(stored?.snapshot?.prompt).toContain("Interview Priya about Jae Kim.");
    expect(stored?.snapshot?.firstMessage).toBe("Hi Priya!");
  });

  it.each([
    ["no tracking id (the bare study link)", undefined],
    ["a tracking id nobody was given", "n".repeat(22)],
    ["a short guessable tracking id", "pfa_req_456"],
  ])("starts nothing for %s", async (_label, trackingId) => {
    const { deps, interviewRepo, study } = await setup();

    await expect(
      startInterview(deps, { ...intake, linkToken: "voice-token", trackingId }),
    ).rejects.toBeInstanceOf(StudyLinkNotFoundError);
    expect(await interviewRepo.listByStudyId(study.id)).toHaveLength(0);
  });

  it("does not accept another study's tracking id", async () => {
    const { deps, studyRepo, invitationRepo } = await setup();
    const other = await studyRepo.create({
      type: "feedback",
      title: "Other",
      description: "Other",
      preInterviewQuestions: [],
      linkToken: "other-voice",
      partnerId: "partner-1",
      ownerRef: "pfa_user_999",
    });
    await invitationRepo.create({
      studyId: other.id,
      trackingId: "o".repeat(22),
      colleagueFirstName: "Olive",
      context: {},
    });

    await expect(
      startInterview(deps, { ...intake, linkToken: "voice-token", trackingId: "o".repeat(22) }),
    ).rejects.toBeInstanceOf(StudyLinkNotFoundError);
  });

  it("treats a partner study as not found when no invitation store is wired up", async () => {
    const { deps } = await setup();

    await expect(
      startInterview(
        { studyRepo: deps.studyRepo, interviewRepo: deps.interviewRepo },
        { ...intake, linkToken: "voice-token", trackingId: TRACKING },
      ),
    ).rejects.toBeInstanceOf(StudyLinkNotFoundError);
  });

  it("works through the text link too, as a typed interview", async () => {
    const { deps } = await setup();

    const interview = await startInterview(deps, {
      ...intake,
      linkToken: "text-token",
      trackingId: TRACKING,
    });

    expect(interview.mode).toBe("text");
    expect(interview.snapshot).not.toBeNull();
  });

  it("leaves an ordinary study alone: no tracking id needed, no invitation, no snapshot", async () => {
    const { deps, studyRepo } = await setup();
    await studyRepo.create({
      type: "feedback",
      title: "Webinar feedback",
      description: "the webinar",
      preInterviewQuestions: [],
      feedbackQuestions: ["How was it?"],
      linkToken: "plain-token",
    });

    const interview = await startInterview(deps, { ...intake, linkToken: "plain-token" });

    expect(interview.invitationId).toBeNull();
    expect(interview.snapshot).toBeNull();
  });
});
