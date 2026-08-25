import { describe, expect, it } from "vitest";
import { FakeEmailClient } from "@/lib/email";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import type { VapiEndOfCallReportMessage, VapiStatusUpdateMessage } from "../vapi-types";
import { MissingInterviewIdError } from "../errors";
import { handleVapiWebhookMessage } from "../webhook-handler";

const summaryFields = {
  painPoints: ["Manual status reporting eats a full afternoon each week."],
  notableQuotes: ["I basically have a second job just making slides."],
  takeaways: ["Reporting tooling is a strong candidate for automation."],
};
const scriptedSummary = { ...summaryFields, roleDescription: null };

async function setup() {
  const interviewRepo = new InMemoryInterviewRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const llm = new FakeLLMProvider();
  const emailClient = new FakeEmailClient();
  llm.scriptSummary(scriptedSummary);

  const interview = await interviewRepo.create({
    studyId: "study-1",
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: "Engineering manager",
  });

  return { interviewRepo, summaryRepo, llm, emailClient, interview };
}

describe("handleVapiWebhookMessage", () => {
  describe("status-update", () => {
    it("transitions pending -> in-progress and records startedAt on the first in-progress event", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();
      const now = new Date("2026-08-19T12:00:00.000Z");

      const message: VapiStatusUpdateMessage = {
        type: "status-update",
        status: "in-progress",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
      };
      await handleVapiWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient, now },
        message,
      );

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.status).toBe("in-progress");
      expect(updated?.startedAt).toEqual(now);
    });

    it("does not clobber startedAt on a repeated in-progress event", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();
      const firstStart = new Date("2026-08-19T12:00:00.000Z");
      const laterEvent = new Date("2026-08-19T12:05:00.000Z");
      const message: VapiStatusUpdateMessage = {
        type: "status-update",
        status: "in-progress",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
      };

      await handleVapiWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient, now: firstStart },
        message,
      );
      await handleVapiWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient, now: laterEvent },
        message,
      );

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.startedAt).toEqual(firstStart);
    });

    it("ignores non-'in-progress' statuses", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

      await handleVapiWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient },
        {
          type: "status-update",
          status: "ringing",
          call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        },
      );

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.status).toBe("pending");
      expect(updated?.startedAt).toBeNull();
    });

    it("throws MissingInterviewIdError when call.assistantOverrides.metadata.interviewId is absent", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient } = await setup();

      await expect(
        handleVapiWebhookMessage(
          { interviewRepo, summaryRepo, llm, emailClient },
          { type: "status-update", status: "in-progress", call: { id: "call-1" } },
        ),
      ).rejects.toThrow(MissingInterviewIdError);
    });
  });

  describe("end-of-call-report", () => {
    it("transitions to completed and persists transcript/recording from the artifact shape", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();
      const now = new Date("2026-08-19T12:20:00.000Z");

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "assistant-said-end-call-phrase",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        artifact: {
          recording: { stereoUrl: "https://recordings.example.com/call-1.wav" },
          messages: [
            { role: "assistant", message: "Hi Jordan, thanks for joining.", secondsFromStart: 0 },
            { role: "user", message: "Happy to be here.", secondsFromStart: 3.5 },
            { role: "function_call", message: "endCall", secondsFromStart: 1200 },
          ],
        },
      };

      await handleVapiWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient, now },
        message,
      );

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.completedAt).toEqual(now);
      expect(updated?.recordingUrl).toBe("https://recordings.example.com/call-1.wav");
      expect(updated?.vapiCallId).toBe("call-1");
      expect(updated?.transcript).toEqual([
        { speaker: "interviewer", text: "Hi Jordan, thanks for joining.", timestampMs: 0 },
        { speaker: "participant", text: "Happy to be here.", timestampMs: 3500 },
      ]);
    });

    it("falls back to top-level transcript/messages/recordingUrl fields when artifact is absent", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "hangup",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        recordingUrl: "https://recordings.example.com/legacy.wav",
        messages: [{ role: "assistant", message: "Hello." }],
      };

      await handleVapiWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message);

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.recordingUrl).toBe("https://recordings.example.com/legacy.wav");
      expect(updated?.transcript).toEqual([
        { speaker: "interviewer", text: "Hello.", timestampMs: 0 },
      ]);
    });

    it("throws MissingInterviewIdError when call.assistantOverrides.metadata.interviewId is absent", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient } = await setup();

      await expect(
        handleVapiWebhookMessage(
          { interviewRepo, summaryRepo, llm, emailClient },
          { type: "end-of-call-report", endedReason: "hangup", call: { id: "call-1" } },
        ),
      ).rejects.toThrow(MissingInterviewIdError);
    });

    it("triggers individual summary generation (T7.3) once the transcript is persisted", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "hangup",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        artifact: {
          messages: [
            { role: "assistant", message: "How's your week going?" },
            { role: "user", message: "Buried in status reports, honestly." },
          ],
        },
      };

      await handleVapiWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message);

      const summary = await summaryRepo.getByInterviewId(interview.id);
      expect(summary).toMatchObject(summaryFields);
      // The summary is generated from the transcript that was just persisted.
      expect(llm.calls.generateSummary[0].transcript).toEqual([
        { speaker: "interviewer", text: "How's your week going?" },
        { speaker: "participant", text: "Buried in status reports, honestly." },
      ]);
    });

    it("sends the participant a summary email once the summary is generated (#6)", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "hangup",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        artifact: {
          messages: [
            { role: "assistant", message: "How's your week going?" },
            { role: "user", message: "Buried in status reports, honestly." },
          ],
        },
      };

      await handleVapiWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message);

      expect(emailClient.sent).toHaveLength(1);
      expect(emailClient.sent[0].to).toBe("jordan@example.com");
    });

    it("does not send a summary email when the summary has nothing substantive (#6)", async () => {
      const interviewRepo = new InMemoryInterviewRepository();
      const summaryRepo = new InMemorySummaryRepository();
      const llm = new FakeLLMProvider();
      const emailClient = new FakeEmailClient();
      llm.scriptSummary({
        painPoints: [],
        notableQuotes: [],
        takeaways: [],
        roleDescription: null,
      });
      const interview = await interviewRepo.create({
        studyId: "study-1",
        firstName: "Jordan",
        email: "jordan@example.com",
      });

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "silence-timeout",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        artifact: { messages: [{ role: "assistant", message: "Hello?" }] },
      };

      await handleVapiWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message);

      expect(emailClient.sent).toHaveLength(0);
    });

    it("still marks the interview completed even if the summary email fails to send (#6)", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();
      emailClient.scriptFailure(new Error("Resend API error (500): oops"));

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "hangup",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        artifact: {
          messages: [
            { role: "assistant", message: "How's your week going?" },
            { role: "user", message: "Buried in status reports, honestly." },
          ],
        },
      };

      await handleVapiWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message);

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.status).toBe("completed");
      expect(await summaryRepo.getByInterviewId(interview.id)).not.toBeNull();
    });

    it("still marks the interview completed even if summary generation fails", async () => {
      const interviewRepo = new InMemoryInterviewRepository();
      const summaryRepo = new InMemorySummaryRepository();
      const llm = new FakeLLMProvider(); // no scripted summary -> generateSummary throws
      const emailClient = new FakeEmailClient();
      const interview = await interviewRepo.create({
        studyId: "study-1",
        firstName: "Jordan",
        email: "jordan@example.com",
        roleDescription: "Engineering manager",
      });

      const message: VapiEndOfCallReportMessage = {
        type: "end-of-call-report",
        endedReason: "hangup",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
        artifact: { messages: [{ role: "assistant", message: "Hello." }] },
      };

      await handleVapiWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message);

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.status).toBe("completed");
      expect(await summaryRepo.getByInterviewId(interview.id)).toBeNull();
    });
  });

  it("is a no-op for other event types", async () => {
    const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

    await handleVapiWebhookMessage(
      { interviewRepo, summaryRepo, llm, emailClient },
      {
        type: "conversation-update",
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
      },
    );

    const updated = await interviewRepo.getById(interview.id);
    expect(updated?.status).toBe("pending");
  });
});
