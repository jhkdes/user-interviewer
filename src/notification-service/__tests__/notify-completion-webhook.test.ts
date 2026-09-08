import { describe, expect, it } from "vitest";
import { FakeCompletionWebhookClient } from "@/lib/webhook";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { InterviewNotFoundError } from "../errors";
import { notifyCompletionWebhook } from "../notify-completion-webhook";

async function setup(trackingId?: string) {
  const interviewRepo = new InMemoryInterviewRepository();
  const webhookClient = new FakeCompletionWebhookClient();
  const interview = await interviewRepo.create({
    studyId: "study-1",
    firstName: "Jordan",
    email: "jordan@example.com",
    trackingId,
  });
  return { interviewRepo, webhookClient, interview };
}

describe("notifyCompletionWebhook", () => {
  it("sends the interview's tracking id, interview id, study id, and status", async () => {
    const { interviewRepo, webhookClient, interview } = await setup("third-party-abc-123");
    const completedAt = new Date("2026-01-01T00:00:00.000Z");
    await interviewRepo.update(interview.id, { completedAt });

    const result = await notifyCompletionWebhook({ interviewRepo, webhookClient }, interview.id);

    expect(result).toEqual({ sent: true });
    expect(webhookClient.sent).toEqual([
      {
        participantTrackingId: "third-party-abc-123",
        interviewId: interview.id,
        studyId: "study-1",
        status: "completed",
        completedAt: completedAt.toISOString(),
      },
    ]);
  });

  it("falls back to `now` when the interview has no completedAt yet", async () => {
    const { interviewRepo, webhookClient, interview } = await setup("third-party-abc-123");
    const now = new Date("2026-01-02T00:00:00.000Z");

    await notifyCompletionWebhook({ interviewRepo, webhookClient, now }, interview.id);

    expect(webhookClient.sent[0].completedAt).toBe(now.toISOString());
  });

  it("skips (sent: false) when the interview has no tracking id", async () => {
    const { interviewRepo, webhookClient, interview } = await setup();

    const result = await notifyCompletionWebhook({ interviewRepo, webhookClient }, interview.id);

    expect(result).toEqual({ sent: false });
    expect(webhookClient.sent).toHaveLength(0);
  });

  it("throws InterviewNotFoundError for an unknown interview id", async () => {
    const { interviewRepo, webhookClient } = await setup();

    await expect(
      notifyCompletionWebhook({ interviewRepo, webhookClient }, NONEXISTENT_ID),
    ).rejects.toThrow(InterviewNotFoundError);
  });

  it("propagates the webhook client's error (caller decides whether that's fatal)", async () => {
    const { interviewRepo, webhookClient, interview } = await setup("third-party-abc-123");
    webhookClient.scriptFailure(new Error("Completion webhook error (500): oops"));

    await expect(
      notifyCompletionWebhook({ interviewRepo, webhookClient }, interview.id),
    ).rejects.toThrow("Completion webhook error (500): oops");
  });
});
