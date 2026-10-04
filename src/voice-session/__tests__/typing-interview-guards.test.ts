import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackAgent, InterviewAgent } from "@/interview-agent";
import { FakeEmailClient } from "@/lib/email";
import { FakeCompletionWebhookClient } from "@/lib/webhook";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { InterviewNotVoiceError } from "../errors";
import { shouldIgnoreEventForTypingInterview } from "../call-lifecycle";
import {
  resolveElevenLabsStreamContext,
  streamElevenLabsCustomLlmResponse,
} from "../elevenlabs/custom-llm-handler";
import type { ElevenLabsPostCallTranscriptionPayload } from "../elevenlabs/types";
import { handleElevenLabsWebhookMessage } from "../elevenlabs/webhook-handler";
import { handleVapiCustomLlmRequest } from "../vapi/custom-llm-handler";
import type { VapiEndOfCallReportMessage, VapiStatusUpdateMessage } from "../vapi/types";
import { handleVapiWebhookMessage } from "../vapi/webhook-handler";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A feedback interview that a participant started by voice and then
 * restarted as a typing interview — the state in which the discarded call's
 * late webhooks and turn requests arrive.
 */
async function restartedAsTyping(options: { switched?: boolean } = {}) {
  const interviewRepo = new InMemoryInterviewRepository();
  const studyRepo = new InMemoryStudyRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const llm = new FakeLLMProvider();
  const emailClient = new FakeEmailClient();
  const webhookClient = new FakeCompletionWebhookClient();
  llm.scriptFeedbackSummary({ liked: ["x"], disliked: [], suggestions: [] });

  const study = await studyRepo.create({
    type: "feedback",
    title: "Post-webinar feedback",
    description: "quick check-in",
    preInterviewQuestions: [],
    feedbackQuestions: ["What stood out?"],
    linkToken: "token",
  });
  const created = await interviewRepo.create({
    studyId: study.id,
    firstName: "Sam",
    email: "sam@example.com",
    trackingId: "tracking-1",
    mode: "text",
  });
  const interview = await interviewRepo.update(created.id, {
    status: "pending",
    switchedToTextAt: options.switched === false ? null : new Date(),
  });

  const deleteVapiCall = vi.fn().mockResolvedValue(true);
  const deleteElevenLabsConversation = vi.fn().mockResolvedValue(true);
  const deps = {
    interviewRepo,
    studyRepo,
    summaryRepo,
    llm,
    emailClient,
    webhookClient,
    providerCleanup: { deleteVapiCall, deleteElevenLabsConversation },
  };
  const turnDeps = {
    interviewAgent: new InterviewAgent(llm),
    feedbackAgent: new FeedbackAgent(llm),
    interviewRepo,
    studyRepo,
  };
  return {
    ...deps,
    deps,
    turnDeps,
    interview,
    deleteVapiCall,
    deleteElevenLabsConversation,
  };
}

function vapiStatusUpdate(interviewId: string): VapiStatusUpdateMessage {
  return {
    type: "status-update",
    status: "in-progress",
    call: { id: "call-1", assistantOverrides: { metadata: { interviewId } } },
  };
}

function vapiEndOfCall(interviewId: string): VapiEndOfCallReportMessage {
  return {
    type: "end-of-call-report",
    endedReason: "hangup",
    call: { id: "call-1", assistantOverrides: { metadata: { interviewId } } },
    artifact: {
      messages: [
        { role: "assistant", message: "Hi from the discarded call" },
        { role: "user", message: "Hello" },
      ],
    },
  };
}

function elevenLabsTranscription(interviewId: string): ElevenLabsPostCallTranscriptionPayload {
  return {
    type: "post_call_transcription",
    data: {
      conversation_id: "conv-1",
      conversation_initiation_client_data: { dynamic_variables: { interviewId } },
      transcript: [
        { role: "agent", message: "Hi from the discarded call", time_in_call_secs: 0 },
        { role: "user", message: "Hello", time_in_call_secs: 3 },
      ],
      metadata: { start_time_unix_secs: 1_700_000_000, call_duration_secs: 20 },
    },
  } as ElevenLabsPostCallTranscriptionPayload;
}

async function expectUntouched(s: Awaited<ReturnType<typeof restartedAsTyping>>) {
  const interview = await s.interviewRepo.getById(s.interview.id);
  expect(interview).toMatchObject({
    mode: "text",
    status: "pending",
    startedAt: null,
    transcript: null,
    vapiCallId: null,
    elevenLabsConversationId: null,
    recordingUrl: null,
  });
  expect(s.llm.calls.generateFeedbackSummary).toHaveLength(0);
  expect(s.emailClient.sent).toHaveLength(0);
  expect(s.webhookClient.sent).toHaveLength(0);
  expect(await s.summaryRepo.getByInterviewId(s.interview.id)).toBeNull();
}

describe("a restarted interview ignores the discarded voice call", () => {
  describe("Vapi webhooks", () => {
    it("does not start the typing interview on a late call-started event", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleVapiWebhookMessage(s.deps, vapiStatusUpdate(s.interview.id));

      await expectUntouched(s);
    });

    it("does not complete it, summarize it, or email anyone on the end-of-call report", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleVapiWebhookMessage(s.deps, vapiEndOfCall(s.interview.id));

      await expectUntouched(s);
    });

    it("deletes the discarded call's recording, best-effort", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleVapiWebhookMessage(s.deps, vapiEndOfCall(s.interview.id));

      expect(s.deleteVapiCall).toHaveBeenCalledWith("call-1");
      expect(s.deleteElevenLabsConversation).not.toHaveBeenCalled();
    });

    it("does not delete anything for a late call-started event, which carries no recording", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleVapiWebhookMessage(s.deps, vapiStatusUpdate(s.interview.id));

      expect(s.deleteVapiCall).not.toHaveBeenCalled();
    });
  });

  describe("ElevenLabs webhooks", () => {
    it("does not start or complete the typing interview, or email anyone", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleElevenLabsWebhookMessage(s.deps, elevenLabsTranscription(s.interview.id));

      await expectUntouched(s);
    });

    it("deletes the discarded conversation's recording, best-effort", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleElevenLabsWebhookMessage(s.deps, elevenLabsTranscription(s.interview.id));

      expect(s.deleteElevenLabsConversation).toHaveBeenCalledWith("conv-1");
      expect(s.deleteVapiCall).not.toHaveBeenCalled();
    });
  });

  describe("recording cleanup", () => {
    it("leaves the recording alone when the interview was never restarted from a call (nothing was discarded)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping({ switched: false });

      const ignored = await shouldIgnoreEventForTypingInterview(s.deps, s.interview.id, {
        vapiCallId: "call-1",
      });

      expect(ignored).toBe(true);
      expect(s.deleteVapiCall).not.toHaveBeenCalled();
    });

    it("still ignores the event when the provider delete throws, logging it", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const s = await restartedAsTyping();
      s.deleteVapiCall.mockRejectedValue(new Error("vapi down"));

      await handleVapiWebhookMessage(s.deps, vapiEndOfCall(s.interview.id));

      await expectUntouched(s);
      expect(error).toHaveBeenCalled();
    });

    it("works without any cleanup configured", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();
      const { providerCleanup, ...withoutCleanup } = s.deps;
      void providerCleanup;

      await handleVapiWebhookMessage(withoutCleanup, vapiEndOfCall(s.interview.id));

      await expectUntouched(s);
    });

    it("logs what it ignored", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await restartedAsTyping();

      await handleVapiWebhookMessage(s.deps, vapiEndOfCall(s.interview.id));

      expect(String(log.mock.calls[0][0])).toContain(
        `Vapi call call-1 for interview ${s.interview.id}`,
      );
      expect(String(log.mock.calls[0][0])).toContain("restarted as a typing interview");
    });
  });

  describe("voice interviews are not affected", () => {
    it("still lets a voice interview's events through", async () => {
      const s = await restartedAsTyping();
      await s.interviewRepo.update(s.interview.id, { mode: "voice", switchedToTextAt: null });

      expect(
        await shouldIgnoreEventForTypingInterview(s.deps, s.interview.id, { vapiCallId: "call-1" }),
      ).toBe(false);
      await handleVapiWebhookMessage(s.deps, vapiEndOfCall(s.interview.id));

      expect((await s.interviewRepo.getById(s.interview.id))?.status).toBe("completed");
      expect(s.deleteVapiCall).not.toHaveBeenCalled();
    });

    it("leaves an unknown interview to the existing handling, errors included", async () => {
      const s = await restartedAsTyping();

      expect(
        await shouldIgnoreEventForTypingInterview(s.deps, "00000000-0000-0000-0000-000000000000"),
      ).toBe(false);
      await expect(
        handleVapiWebhookMessage(s.deps, vapiEndOfCall("00000000-0000-0000-0000-000000000000")),
      ).rejects.toThrow();
    });
  });

  describe("late voice turns", () => {
    it("rejects a Vapi custom-LLM request without generating or writing anything", async () => {
      const s = await restartedAsTyping();

      await expect(
        handleVapiCustomLlmRequest(s.turnDeps, {
          model: "gpt-4o",
          messages: [{ role: "user", content: "hello" }],
          call: { id: "call-1" },
          metadata: { interviewId: s.interview.id },
        }),
      ).rejects.toBeInstanceOf(InterviewNotVoiceError);

      expect(s.llm.calls.generateInterviewerTurn).toHaveLength(0);
      expect(s.llm.calls.generateInterviewerTurnStreaming).toHaveLength(0);
      expect((await s.interviewRepo.getById(s.interview.id))?.openFloorAskedAt).toBeNull();
    });

    it("rejects an ElevenLabs custom-LLM request before any stream opens", async () => {
      const s = await restartedAsTyping();

      await expect(
        resolveElevenLabsStreamContext(s.turnDeps, {
          model: "gpt-4o",
          messages: [{ role: "user", content: "hello" }],
          elevenlabs_extra_body: { interviewId: s.interview.id },
        }),
      ).rejects.toBeInstanceOf(InterviewNotVoiceError);

      expect(s.llm.calls.generateInterviewerTurnStreaming).toHaveLength(0);
    });

    it("still serves a voice interview's turn as before", async () => {
      const s = await restartedAsTyping();
      await s.interviewRepo.update(s.interview.id, {
        mode: "voice",
        status: "in-progress",
        startedAt: new Date(),
      });
      s.llm.scriptInterviewerTurnStreams([
        { textChunks: ["What stood out?"], shouldEndInterview: false },
      ]);
      const request = {
        model: "gpt-4o",
        messages: [{ role: "user" as const, content: "hello" }],
        elevenlabs_extra_body: { interviewId: s.interview.id },
      };

      const context = await resolveElevenLabsStreamContext(s.turnDeps, request);
      const chunks: string[] = [];
      for await (const chunk of streamElevenLabsCustomLlmResponse(s.turnDeps, request, context)) {
        chunks.push(chunk);
      }

      expect(chunks.join("")).toContain("What stood out?");
    });
  });
});
