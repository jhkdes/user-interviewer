import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeEmailClient } from "@/lib/email";
import { FakeCompletionWebhookClient } from "@/lib/webhook";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { completeInterview } from "../call-lifecycle";
import type { NormalizedCallEndedEvent } from "../types";

const scriptedSummary = {
  painPoints: ["Manual status reporting eats a full afternoon each week."],
  notableQuotes: ["I basically have a second job just making slides."],
  takeaways: ["Reporting tooling is a strong candidate for automation."],
  roleDescription: null,
};

async function setup() {
  const interviewRepo = new InMemoryInterviewRepository();
  const studyRepo = new InMemoryStudyRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const llm = new FakeLLMProvider();
  const emailClient = new FakeEmailClient();
  const webhookClient = new FakeCompletionWebhookClient();
  llm.scriptSummary(scriptedSummary);

  const study = await studyRepo.create({
    title: "How AI Actually Shows Up in a PM's Day",
    description: "how product managers really use AI at work",
    preInterviewQuestions: [],
    linkToken: "token",
  });
  const interview = await interviewRepo.create({
    studyId: study.id,
    firstName: "Jordan",
    email: "jordan@example.com",
    trackingId: "third-party-abc-123",
  });
  const deps = { interviewRepo, studyRepo, summaryRepo, llm, emailClient, webhookClient };
  return { ...deps, deps, interview };
}

function makeEvent(
  interviewId: string,
  overrides: Partial<NormalizedCallEndedEvent> = {},
): NormalizedCallEndedEvent {
  return {
    interviewId,
    transcript: [
      { speaker: "interviewer", text: "How's your week going?", timestampMs: 0 },
      { speaker: "participant", text: "Buried in status reports.", timestampMs: 2000 },
    ],
    recordingUrl: null,
    endedReason: "hangup",
    vapiCallId: "call-1",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("completeInterview", () => {
  it("completes the interview, runs the side effects once, and returns true", async () => {
    const { deps, interview, interviewRepo, emailClient, webhookClient, llm } = await setup();

    const completed = await completeInterview(deps, makeEvent(interview.id));

    expect(completed).toBe(true);
    const reloaded = await interviewRepo.getById(interview.id);
    expect(reloaded?.status).toBe("completed");
    expect(reloaded?.transcript).toHaveLength(2);
    expect(reloaded?.endedReason).toBe("hangup");
    expect(llm.calls.generateSummary).toHaveLength(1);
    expect(emailClient.sent).toHaveLength(1);
    expect(webhookClient.sent).toHaveLength(1);
  });

  describe("duplicate completion", () => {
    it("ignores a second completion: no transcript rewrite, summary, email, or completion webhook", async () => {
      const { deps, interview, interviewRepo, emailClient, webhookClient, llm } = await setup();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await completeInterview(deps, makeEvent(interview.id));

      const secondCompleted = await completeInterview(
        deps,
        makeEvent(interview.id, {
          transcript: [{ speaker: "interviewer", text: "Overwritten.", timestampMs: 0 }],
          endedReason: "silence-timeout",
        }),
      );

      expect(secondCompleted).toBe(false);
      const reloaded = await interviewRepo.getById(interview.id);
      expect(reloaded?.transcript).toHaveLength(2);
      expect(reloaded?.transcript?.[0].text).toBe("How's your week going?");
      expect(reloaded?.endedReason).toBe("hangup");
      expect(llm.calls.generateSummary).toHaveLength(1);
      expect(emailClient.sent).toHaveLength(1);
      expect(webhookClient.sent).toHaveLength(1);
    });

    it("logs a descriptive warning naming the interview, the original completion, and the incoming event", async () => {
      const { deps, interview } = await setup();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const originalCompletedAt = new Date("2026-08-19T12:10:00.000Z");
      await completeInterview(
        { ...deps, now: originalCompletedAt },
        makeEvent(interview.id, { endedReason: "hangup" }),
      );

      await completeInterview(
        deps,
        makeEvent(interview.id, {
          vapiCallId: undefined,
          elevenLabsConversationId: "conv-9",
          endedReason: "silence-timeout",
        }),
      );

      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0][0]);
      expect(message).toContain(`Ignoring duplicate completion for interview ${interview.id}`);
      expect(message).toContain("already completed");
      expect(message).toContain(originalCompletedAt.toISOString());
      expect(message).toContain("original endedReason=hangup");
      expect(message).toContain("elevenlabs conversation conv-9");
      expect(message).toContain("endedReason=silence-timeout");
      expect(message).toContain("no summary, email, or completion webhook was triggered");
    });

    it("does not warn on a normal first completion", async () => {
      const { deps, interview } = await setup();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await completeInterview(deps, makeEvent(interview.id));

      expect(warn).not.toHaveBeenCalled();
    });

    it("lets only one of two concurrent completions run the side effects", async () => {
      const { deps, interview, emailClient, webhookClient, llm } = await setup();
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const results = await Promise.all([
        completeInterview(deps, makeEvent(interview.id, { vapiCallId: "call-a" })),
        completeInterview(deps, makeEvent(interview.id, { vapiCallId: "call-b" })),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(llm.calls.generateSummary).toHaveLength(1);
      expect(emailClient.sent).toHaveLength(1);
      expect(webhookClient.sent).toHaveLength(1);
    });

    it("names an unidentified source when the event carries no provider id", async () => {
      const { deps, interview } = await setup();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await completeInterview(deps, makeEvent(interview.id));

      await completeInterview(deps, makeEvent(interview.id, { vapiCallId: undefined }));

      expect(String(warn.mock.calls[0][0])).toContain("an unidentified source");
    });
  });

  it("still rejects for an unknown interview id, as before", async () => {
    const { deps } = await setup();

    await expect(
      completeInterview(deps, makeEvent("00000000-0000-0000-0000-000000000000")),
    ).rejects.toThrow();
  });
});
