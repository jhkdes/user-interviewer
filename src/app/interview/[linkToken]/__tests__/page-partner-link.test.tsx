import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

let studies = new InMemoryStudyRepository();
let invitations = new InMemoryPartnerInvitationRepository();
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => studies }));
vi.mock("@/repositories/get-partner-invitation-repository", () => ({
  getPartnerInvitationRepository: () => invitations,
}));

import InterviewPage from "../page";
import { InterviewFlow } from "../interview-flow";
import { LinkInvalidScreen } from "../link-invalid-screen";

const TRACKING = "k3Zq9vX1mT8wRb4Yp7NcHd";

beforeEach(() => {
  studies = new InMemoryStudyRepository();
  invitations = new InMemoryPartnerInvitationRepository();
});

async function partnerStudy() {
  const study = await studies.create({
    type: "feedback",
    title: "Feedback for Jae Kim",
    description: "Jae Kim",
    preInterviewQuestions: [],
    linkToken: "voice-token",
    textLinkToken: "text-token",
    partnerId: "partner-1",
    ownerRef: "pfa_user_123",
    endedEarlyMinTurns: 3,
  });
  await invitations.create({
    studyId: study.id,
    trackingId: TRACKING,
    colleagueFirstName: "Priya",
    context: {},
  });
  return study;
}

const open = (linkToken: string, trackingId?: string | string[]) =>
  InterviewPage({
    params: { linkToken },
    searchParams: trackingId === undefined ? {} : { tracking_id: trackingId },
  });

describe("the participant page for a partner study", () => {
  beforeEach(partnerStudy);

  it("shows the interview for a valid invitation, using the study's ended-early threshold", async () => {
    const element = await open("voice-token", TRACKING);

    expect(element.type).toBe(InterviewFlow);
    expect(element.props).toMatchObject({ trackingId: TRACKING, minParticipantTurns: 3 });
  });

  it.each([
    ["no tracking id", undefined],
    ["a tracking id nobody was given", "n".repeat(22)],
    ["a guessable id", "pfa_req_456"],
    ["a repeated parameter", [TRACKING, TRACKING]],
  ])("shows the 'link not found' page for %s", async (_label, trackingId) => {
    const element = await open("voice-token", trackingId);

    expect(element.type).toBe(LinkInvalidScreen);
    expect(element.props.reason).toBe("not-found");
  });

  it("applies the same rule to the study's text link", async () => {
    expect((await open("text-token")).type).toBe(LinkInvalidScreen);
  });

  it("does not ask an ordinary study for a tracking id", async () => {
    await studies.create({
      type: "feedback",
      title: "Webinar",
      description: "the webinar",
      preInterviewQuestions: [],
      feedbackQuestions: ["How was it?"],
      linkToken: "plain-token",
    });

    expect((await open("plain-token")).type).toBe(InterviewFlow);
  });
});
