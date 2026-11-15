import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackAgent, InterviewAgent } from "@/interview-agent";
import { FakeEmailClient } from "@/lib/email";
import { FakeCompletionWebhookClient } from "@/lib/webhook";
import { FakeLLMProvider } from "@/llm";
import { buildInterviewSnapshot } from "@/partner-api/snapshot";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { completeInterview } from "../call-lifecycle";
import { generateTurn } from "../generate-turn";

const START = new Date("2026-11-05T12:00:00.000Z");

async function setup(studyOverrides: Record<string, unknown> = {}) {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const llm = new FakeLLMProvider();
  const emailClient = new FakeEmailClient();
  const webhookClient = new FakeCompletionWebhookClient();

  const study = await studyRepo.create({
    type: "feedback",
    title: "Feedback for Jae Kim",
    description: "Jae Kim",
    preInterviewQuestions: [],
    feedbackQuestions: [],
    linkToken: "voice-token",
    partnerId: "partner-1",
    ownerRef: "pfa_user_123",
    subjectName: "Jae Kim",
    customPrompt: "Interview {{colleague_first_name}} about {{subject_name}}.",
    closingQuestion: "Anything else about {{subject_name}}?",
    targetMinutes: 5,
    hardStopMinutes: 8,
    voiceProvider: "elevenlabs",
    ...studyOverrides,
  });
  const invitation = {
    id: "inv-1",
    studyId: study.id,
    trackingId: "t".repeat(22),
    colleagueFirstName: "Priya",
    context: {},
    createdAt: START,
    updatedAt: START,
  };
  const interview = await interviewRepo.create({
    studyId: study.id,
    firstName: "Priya R",
    email: "priya@example.com",
    trackingId: invitation.trackingId,
    voiceProvider: "elevenlabs",
  });
  const started = await interviewRepo.update(interview.id, {
    startedAt: START,
    invitationId: invitation.id,
    snapshot: buildInterviewSnapshot(study, invitation),
  });
  return {
    studyRepo,
    interviewRepo,
    summaryRepo,
    llm,
    emailClient,
    webhookClient,
    interviewAgent: new InterviewAgent(llm),
    feedbackAgent: new FeedbackAgent(llm),
    study,
    interview: started,
  };
}

afterEach(() => vi.restoreAllMocks());

const messages = [
  { role: "assistant" as const, content: "Hi Priya." },
  { role: "user" as const, content: "Hello, happy to help." },
];

describe("a partner interview's turns", () => {
  it("uses the prompt it started with, even after the study's prompt is changed", async () => {
    const s = await setup();
    await s.studyRepo.updateDetails(s.study.id, { customPrompt: "A COMPLETELY NEW PROMPT" });
    s.llm.scriptInterviewerTurns([{ utterance: "Tell me more.", shouldEndInterview: false }]);

    await generateTurn(
      { ...s, now: new Date(START.getTime() + 60_000) },
      { interviewId: s.interview.id, messages },
    );

    const prompt = s.llm.calls.generateInterviewerTurn[0].systemPrompt;
    expect(prompt).toContain("Interview Priya about Jae Kim.");
    expect(prompt).not.toContain("A COMPLETELY NEW PROMPT");
  });

  it("a study without a snapshot (an ordinary feedback study) still uses its own prompt", async () => {
    const s = await setup();
    await s.interviewRepo.update(s.interview.id, { snapshot: null, invitationId: null });
    await s.studyRepo.updateDetails(s.study.id, {
      customPrompt: "Plain prompt for {{participant_name}}",
    });
    s.llm.scriptInterviewerTurns([{ utterance: "Tell me more.", shouldEndInterview: false }]);

    await generateTurn(
      { ...s, now: new Date(START.getTime() + 60_000) },
      { interviewId: s.interview.id, messages },
    );

    expect(s.llm.calls.generateInterviewerTurn[0].systemPrompt).toContain(
      "Plain prompt for Priya R",
    );
  });

  it("asks the closing question it started with, filled in for this colleague", async () => {
    const s = await setup();
    await s.studyRepo.updateDetails(s.study.id, { closingQuestion: "A different question?" });
    s.llm.scriptInterviewerTurns([{ utterance: "Thanks.", shouldEndInterview: true }]);

    const result = await generateTurn(
      { ...s, now: new Date(START.getTime() + 120_000) },
      { interviewId: s.interview.id, messages },
    );

    expect(result.utterance).toContain("Anything else about Jae Kim?");
    expect(result.utterance).not.toContain("A different question?");
  });

  it("ends the call at the study's own hard stop, not the standard seven minutes", async () => {
    const s = await setup();
    s.llm.scriptInterviewerTurns([
      { utterance: "Still going.", shouldEndInterview: false },
      { utterance: "Past the standard cap.", shouldEndInterview: false },
      { utterance: "Past the study's cap.", shouldEndInterview: false },
    ]);
    const turn = (minutes: number) =>
      generateTurn(
        { ...s, now: new Date(START.getTime() + minutes * 60_000 + 1000) },
        { interviewId: s.interview.id, messages },
      );

    expect((await turn(1)).isInterviewOver).toBe(false);
    // 7 minutes is the standard hard stop; this study stops at 8.
    expect((await turn(7)).isInterviewOver).toBe(false);
    expect((await turn(8)).isInterviewOver).toBe(true);
  });
});

describe("when a partner interview completes", () => {
  const event = (interviewId: string) => ({
    interviewId,
    transcript: [
      { speaker: "interviewer" as const, text: "Hi Priya.", timestampMs: 0 },
      { speaker: "participant" as const, text: "Hello.", timestampMs: 2000 },
    ],
    recordingUrl: null,
    endedReason: "hangup",
    elevenLabsConversationId: "conv-1",
  });

  it("makes no summary and sends no email when the study turns them off, and never calls the global webhook", async () => {
    const s = await setup({ participantSummaryEmail: false });

    const completed = await completeInterview(s, event(s.interview.id));

    expect(completed).toBe(true);
    expect((await s.interviewRepo.getById(s.interview.id))?.status).toBe("completed");
    expect(s.llm.calls.generateFeedbackSummary).toHaveLength(0);
    expect(s.emailClient.sent).toHaveLength(0);
    expect(s.webhookClient.sent).toHaveLength(0);
  });

  it("still keeps the global webhook away from a partner study that does want summaries", async () => {
    const s = await setup({ participantSummaryEmail: true });
    s.llm.scriptFeedbackSummary({
      liked: ["Clear communicator."],
      disliked: [],
      suggestions: ["Share context earlier."],
    });

    await completeInterview(s, event(s.interview.id));

    expect(s.llm.calls.generateFeedbackSummary).toHaveLength(1);
    expect(s.webhookClient.sent).toHaveLength(0);
  });

  it("leaves an ordinary study exactly as before: summary, email and webhook all happen", async () => {
    const s = await setup({
      partnerId: undefined,
      ownerRef: undefined,
      participantSummaryEmail: true,
    });
    s.llm.scriptFeedbackSummary({
      liked: ["Clear communicator."],
      disliked: [],
      suggestions: ["Share context earlier."],
    });

    await completeInterview(s, event(s.interview.id));

    expect(s.llm.calls.generateFeedbackSummary).toHaveLength(1);
    expect(s.emailClient.sent).toHaveLength(1);
    expect(s.webhookClient.sent).toHaveLength(1);
  });
});

describe("the partner webhook hook", () => {
  const event = (interviewId: string) => ({
    interviewId,
    transcript: [{ speaker: "participant" as const, text: "Hello.", timestampMs: 2000 }],
    recordingUrl: null,
    endedReason: "hangup",
    elevenLabsConversationId: "conv-1",
  });

  it("is called once, after the interview is saved, for a partner study", async () => {
    const s = await setup({ participantSummaryEmail: false });
    const seen: string[] = [];
    const hook = vi.fn(async (id: string) => {
      seen.push((await s.interviewRepo.getById(id))?.status ?? "missing");
    });

    await completeInterview({ ...s, onPartnerInterviewCompleted: hook }, event(s.interview.id));

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(s.interview.id);
    // The transcript is already stored when the partner is told.
    expect(seen).toEqual(["completed"]);
  });

  it("is not called again for a duplicate completion", async () => {
    const s = await setup({ participantSummaryEmail: false });
    const hook = vi.fn(async () => {});
    const deps = { ...s, onPartnerInterviewCompleted: hook };

    await completeInterview(deps, event(s.interview.id));
    await completeInterview(deps, event(s.interview.id));

    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("is not called for an ordinary study", async () => {
    const s = await setup({
      partnerId: undefined,
      ownerRef: undefined,
      participantSummaryEmail: false,
    });
    const hook = vi.fn(async () => {});

    await completeInterview({ ...s, onPartnerInterviewCompleted: hook }, event(s.interview.id));

    expect(hook).not.toHaveBeenCalled();
  });

  it("does not stop the interview from completing when it throws", async () => {
    const s = await setup({ participantSummaryEmail: false });
    const hook = vi.fn(async () => {
      throw new Error("partner store down");
    });

    const completed = await completeInterview(
      { ...s, onPartnerInterviewCompleted: hook },
      event(s.interview.id),
    );

    expect(completed).toBe(true);
    expect((await s.interviewRepo.getById(s.interview.id))?.status).toBe("completed");
  });
});
