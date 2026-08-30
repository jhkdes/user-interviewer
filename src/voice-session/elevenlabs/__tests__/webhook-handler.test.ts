import { describe, expect, it } from "vitest";
import { FakeEmailClient } from "@/lib/email";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { MissingInterviewIdError } from "../../errors";
import type {
  ElevenLabsPostCallAudioPayload,
  ElevenLabsPostCallTranscriptionPayload,
} from "../types";
import { handleElevenLabsWebhookMessage } from "../webhook-handler";

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
    voiceProvider: "elevenlabs",
  });

  return { interviewRepo, summaryRepo, llm, emailClient, interview };
}

describe("handleElevenLabsWebhookMessage", () => {
  describe("post_call_transcription", () => {
    it("transitions pending -> completed, persisting transcript and the conversation id", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();
      const now = new Date("2026-08-19T12:20:00.000Z");

      const message: ElevenLabsPostCallTranscriptionPayload = {
        type: "post_call_transcription",
        data: {
          conversation_id: "conv-1",
          conversation_initiation_client_data: {
            dynamic_variables: { interviewId: interview.id },
          },
          transcript: [
            { role: "agent", message: "Hi Jordan, thanks for joining.", time_in_call_secs: 0 },
            { role: "user", message: "Happy to be here.", time_in_call_secs: 3.5 },
          ],
          analysis: { call_successful: "success" },
        },
      };

      await handleElevenLabsWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient, now },
        message,
      );

      const updated = await interviewRepo.getById(interview.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.startedAt).toEqual(now);
      expect(updated?.completedAt).toEqual(now);
      expect(updated?.elevenLabsConversationId).toBe("conv-1");
      expect(updated?.endedReason).toBe("success");
      expect(updated?.transcript).toEqual([
        { speaker: "interviewer", text: "Hi Jordan, thanks for joining.", timestampMs: 0 },
        { speaker: "participant", text: "Happy to be here.", timestampMs: 3500 },
      ]);
    });

    it("throws MissingInterviewIdError when dynamic_variables.interviewId is absent", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient } = await setup();

      await expect(
        handleElevenLabsWebhookMessage(
          { interviewRepo, summaryRepo, llm, emailClient },
          { type: "post_call_transcription", data: { conversation_id: "conv-1" } },
        ),
      ).rejects.toThrow(MissingInterviewIdError);
    });

    it("triggers individual summary generation and sends the summary email", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

      const message: ElevenLabsPostCallTranscriptionPayload = {
        type: "post_call_transcription",
        data: {
          conversation_id: "conv-1",
          conversation_initiation_client_data: {
            dynamic_variables: { interviewId: interview.id },
          },
          transcript: [
            { role: "agent", message: "How's your week going?" },
            { role: "user", message: "Buried in status reports, honestly." },
          ],
        },
      };

      await handleElevenLabsWebhookMessage(
        { interviewRepo, summaryRepo, llm, emailClient },
        message,
      );

      const summary = await summaryRepo.getByInterviewId(interview.id);
      expect(summary).toMatchObject(summaryFields);
      expect(emailClient.sent).toHaveLength(1);
      expect(emailClient.sent[0].to).toBe("jordan@example.com");
    });
  });

  describe("post_call_audio", () => {
    it("is ignored as a no-op — recordings are fetched on demand instead (see fetchConversationAudio)", async () => {
      const { interviewRepo, summaryRepo, llm, emailClient } = await setup();

      const message: ElevenLabsPostCallAudioPayload = {
        type: "post_call_audio",
        data: {
          conversation_id: "conv-not-yet-linked-to-any-interview",
          full_audio: "base64audiodata",
        },
      };

      await expect(
        handleElevenLabsWebhookMessage({ interviewRepo, summaryRepo, llm, emailClient }, message),
      ).resolves.not.toThrow();
    });
  });

  it("is a no-op for other event types", async () => {
    const { interviewRepo, summaryRepo, llm, emailClient, interview } = await setup();

    await handleElevenLabsWebhookMessage(
      { interviewRepo, summaryRepo, llm, emailClient },
      { type: "conversation_started" },
    );

    const updated = await interviewRepo.getById(interview.id);
    expect(updated?.status).toBe("pending");
  });
});
