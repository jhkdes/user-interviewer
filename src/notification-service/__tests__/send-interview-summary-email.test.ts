import { describe, expect, it } from "vitest";
import { FakeEmailClient } from "@/lib/email";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { sendInterviewSummaryEmail } from "../send-interview-summary-email";
import { InterviewNotFoundError } from "../errors";

const substantiveSummary = {
  painPoints: ["Manual status reporting eats a full afternoon each week."],
  notableQuotes: ["I basically have a second job just making slides."],
  takeaways: ["Reporting tooling is a strong candidate for automation."],
};

async function setup() {
  const interviewRepo = new InMemoryInterviewRepository();
  const emailClient = new FakeEmailClient();
  const interview = await interviewRepo.create({
    studyId: "study-1",
    firstName: "Jordan",
    email: "jordan@example.com",
  });
  return { interviewRepo, emailClient, interview };
}

describe("sendInterviewSummaryEmail", () => {
  it("sends to the interview's email and reports sent: true", async () => {
    const { interviewRepo, emailClient, interview } = await setup();

    const result = await sendInterviewSummaryEmail(
      { interviewRepo, emailClient },
      interview.id,
      substantiveSummary,
    );

    expect(result).toEqual({ sent: true });
    expect(emailClient.sent).toHaveLength(1);
    expect(emailClient.sent[0].to).toBe("jordan@example.com");
    expect(emailClient.sent[0].subject).toContain("Jordan");
  });

  it("records summaryEmailSentAt on the interview after a successful send (#6)", async () => {
    const { interviewRepo, emailClient, interview } = await setup();
    const now = new Date("2026-01-01T00:00:00.000Z");

    await sendInterviewSummaryEmail(
      { interviewRepo, emailClient, now },
      interview.id,
      substantiveSummary,
    );

    expect((await interviewRepo.getById(interview.id))?.summaryEmailSentAt).toEqual(now);
  });

  it("leaves summaryEmailSentAt null when the send fails (#6)", async () => {
    const { interviewRepo, emailClient, interview } = await setup();
    emailClient.scriptFailure(new Error("Resend API error (500): oops"));

    await expect(
      sendInterviewSummaryEmail({ interviewRepo, emailClient }, interview.id, substantiveSummary),
    ).rejects.toThrow();

    expect((await interviewRepo.getById(interview.id))?.summaryEmailSentAt).toBeNull();
  });

  it("skips sending (sent: false) when the summary has nothing substantive", async () => {
    const { interviewRepo, emailClient, interview } = await setup();

    const result = await sendInterviewSummaryEmail({ interviewRepo, emailClient }, interview.id, {
      painPoints: [],
      notableQuotes: [],
      takeaways: [],
    });

    expect(result).toEqual({ sent: false });
    expect(emailClient.sent).toHaveLength(0);
  });

  it("throws InterviewNotFoundError for an unknown interview id", async () => {
    const { interviewRepo, emailClient } = await setup();

    await expect(
      sendInterviewSummaryEmail({ interviewRepo, emailClient }, NONEXISTENT_ID, substantiveSummary),
    ).rejects.toThrow(InterviewNotFoundError);
  });

  it("propagates the email client's error (caller decides whether that's fatal)", async () => {
    const { interviewRepo, emailClient, interview } = await setup();
    emailClient.scriptFailure(new Error("Resend API error (500): oops"));

    await expect(
      sendInterviewSummaryEmail({ interviewRepo, emailClient }, interview.id, substantiveSummary),
    ).rejects.toThrow("Resend API error (500): oops");
  });
});
