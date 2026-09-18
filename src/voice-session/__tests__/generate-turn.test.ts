import { describe, expect, it } from "vitest";
import {
  FeedbackAgent,
  InterviewAgent,
  SOFT_CAP_MS,
  TIME_CHECK_UTTERANCE,
} from "@/interview-agent";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InterviewNotFoundError, StudyNotFoundError } from "../errors";
import { generateTurn } from "../generate-turn";
import type { OpenAIChatMessage } from "../types";

async function setup() {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const llm = new FakeLLMProvider();
  const interviewAgent = new InterviewAgent(llm);
  const feedbackAgent = new FeedbackAgent(llm);

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
    roleDescription: "Engineering manager overseeing a platform team",
  });

  return { studyRepo, interviewRepo, llm, interviewAgent, feedbackAgent, study, interview };
}

function inputFor(interviewId: string, messages: OpenAIChatMessage[]) {
  return { interviewId, messages };
}

describe("generateTurn", () => {
  it("maps OpenAI-formatted messages into the InterviewAgent's conversation history", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
      await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([
      { utterance: "Tell me more about that.", shouldEndInterview: false },
    ]);

    await generateTurn(
      { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
      inputFor(interview.id, [
        { role: "system", content: "You are a helpful assistant." },
        { role: "assistant", content: "Hi Jordan, tell me about your day-to-day." },
        { role: "user", content: "I spend most of my time in status meetings." },
      ]),
    );

    expect(llm.calls.generateInterviewerTurn[0].conversationHistory).toEqual([
      { speaker: "interviewer", text: "Hi Jordan, tell me about your day-to-day." },
      { speaker: "participant", text: "I spend most of my time in status meetings." },
    ]);
  });

  it("passes the interview's screenerAnswers through to the InterviewAgent's prompt context", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, study, llm } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    const screenerAnswers = { level: "Senior Product Manager", aiToolsUsed: ["ChatGPT"] };
    const interview = await interviewRepo.create({
      studyId: study.id,
      firstName: "Sam",
      email: "sam@example.com",
      screenerAnswers,
    });
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "Tell me more.", shouldEndInterview: false }]);

    await generateTurn(
      { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
      inputFor(interview.id, [{ role: "user", content: "hi" }]),
    );

    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).toMatch(
      /What we already know about this participant/i,
    );
    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).toContain(
      "- level: Senior Product Manager",
    );
  });

  it("returns the utterance and isInterviewOver as InterviewAgent reported them, with no phrase/tool-call encoding", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
      await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "What happens next?", shouldEndInterview: false }]);

    const result = await generateTurn(
      { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
      inputFor(interview.id, [{ role: "user", content: "It's frustrating." }]),
    );

    expect(result).toEqual({ utterance: "What happens next?", isInterviewOver: false });
  });

  it("reports isInterviewOver: true as-is — encoding it on the wire is each provider adapter's job", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
      await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    // Enough participant turns for the LLM's self-assessment to be honored (see termination.ts).
    const history = Array.from({ length: 4 }, (_, i) => [
      { role: "assistant" as const, content: `Q${i}` },
      { role: "user" as const, content: `A${i}` },
    ]).flat();
    llm.scriptInterviewerTurns([
      { utterance: "Thanks so much for your time.", shouldEndInterview: true },
    ]);

    const result = await generateTurn(
      { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
      inputFor(interview.id, history),
    );

    expect(result).toEqual({ utterance: "Thanks so much for your time.", isInterviewOver: true });
  });

  it("forces isInterviewOver once the 15-minute hard cap has elapsed, regardless of the LLM's own signal", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
      await setup();
    await interviewRepo.update(interview.id, { startedAt: new Date("2026-08-19T12:00:00.000Z") });
    llm.scriptInterviewerTurns([{ utterance: "One more thing...", shouldEndInterview: false }]);

    const result = await generateTurn(
      {
        interviewAgent,
        feedbackAgent,
        interviewRepo,
        studyRepo,
        now: new Date("2026-08-19T12:20:01.000Z"),
      },
      inputFor(interview.id, [{ role: "user", content: "..." }]),
    );

    expect(result).toEqual({ utterance: "One more thing...", isInterviewOver: true });
  });

  it("returns the deterministic time-check utterance once the soft cap elapses, and persists timeCheckAskedAt", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
      await setup();
    const startedAt = new Date("2026-08-19T12:00:00.000Z");
    await interviewRepo.update(interview.id, { startedAt });
    const now = new Date(startedAt.getTime() + SOFT_CAP_MS);

    const result = await generateTurn(
      { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
      inputFor(interview.id, [{ role: "user", content: "Still going" }]),
    );

    expect(result).toEqual({ utterance: TIME_CHECK_UTTERANCE, isInterviewOver: false });
    expect(llm.calls.generateInterviewerTurn).toHaveLength(0);
    expect((await interviewRepo.getById(interview.id))?.timeCheckAskedAt).toEqual(now);
  });

  it("does not re-inject the time-check utterance on a later turn once it's already been asked", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
      await setup();
    const startedAt = new Date("2026-08-19T12:00:00.000Z");
    await interviewRepo.update(interview.id, {
      startedAt,
      timeCheckAskedAt: new Date(startedAt.getTime() + SOFT_CAP_MS),
    });
    llm.scriptInterviewerTurns([
      { utterance: "Great, one more question...", shouldEndInterview: false },
    ]);
    const now = new Date(startedAt.getTime() + SOFT_CAP_MS + 30_000);

    const result = await generateTurn(
      { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
      inputFor(interview.id, [
        { role: "assistant", content: TIME_CHECK_UTTERANCE },
        { role: "user", content: "Yeah, a few more minutes is fine." },
      ]),
    );

    expect(result.utterance).toBe("Great, one more question...");
    expect(llm.calls.generateInterviewerTurn).toHaveLength(1);
  });

  it("throws InterviewNotFoundError for an unknown interview id", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, studyRepo } = await setup();

    await expect(
      generateTurn(
        { interviewAgent, feedbackAgent, interviewRepo, studyRepo },
        inputFor("00000000-0000-0000-0000-000000000000", []),
      ),
    ).rejects.toThrow(InterviewNotFoundError);
  });

  it("throws StudyNotFoundError when the interview's study no longer exists", async () => {
    const { interviewAgent, feedbackAgent, interviewRepo, interview } = await setup();
    // Simulate a dangling reference — the in-memory study repo has no delete,
    // so swap in a fresh empty one for this assertion instead.
    const emptyStudyRepo = new InMemoryStudyRepository();

    await expect(
      generateTurn(
        { interviewAgent, feedbackAgent, interviewRepo, studyRepo: emptyStudyRepo },
        inputFor(interview.id, []),
      ),
    ).rejects.toThrow(StudyNotFoundError);
  });

  describe("routing by study.type", () => {
    it("calls FeedbackAgent, not InterviewAgent, for a feedback-type study", async () => {
      const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm } = await setup();
      const feedbackStudy = await studyRepo.create({
        title: "Post-webinar feedback",
        description: "quick check-in after today's session",
        type: "feedback",
        feedbackQuestions: ["What did you think of the content?"],
        preInterviewQuestions: [],
        linkToken: "feedback-token",
      });
      const interview = await interviewRepo.create({
        studyId: feedbackStudy.id,
        firstName: "Sam",
        email: "sam@example.com",
      });
      const now = new Date("2026-08-19T12:01:00.000Z");
      await interviewRepo.update(interview.id, { startedAt: now });
      llm.scriptInterviewerTurns([{ utterance: "Tell me more.", shouldEndInterview: false }]);

      const result = await generateTurn(
        { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
        inputFor(interview.id, [{ role: "user", content: "It was good." }]),
      );

      expect(result).toEqual({ utterance: "Tell me more.", isInterviewOver: false });
      expect(llm.calls.generateInterviewerTurn[0].systemPrompt).toContain(
        "What did you think of the content?",
      );
      // Distinguishing feature of the feedback prompt vs. discovery's.
      expect(llm.calls.generateInterviewerTurn[0].systemPrompt).not.toMatch(/mom test/i);
    });

    it("persists openFloorAskedAt when FeedbackAgent appends the open-floor question", async () => {
      const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm } = await setup();
      const feedbackStudy = await studyRepo.create({
        title: "Post-webinar feedback",
        description: "quick check-in after today's session",
        type: "feedback",
        feedbackQuestions: ["What did you think of the content?"],
        preInterviewQuestions: [],
        linkToken: "feedback-token-2",
      });
      const interview = await interviewRepo.create({
        studyId: feedbackStudy.id,
        firstName: "Sam",
        email: "sam@example.com",
      });
      const now = new Date("2026-08-19T12:01:00.000Z");
      await interviewRepo.update(interview.id, { startedAt: now });
      llm.scriptInterviewerTurns([
        { utterance: "Thanks, that covers it.", shouldEndInterview: true },
      ]);

      await generateTurn(
        { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
        inputFor(interview.id, [{ role: "user", content: "It was great." }]),
      );

      expect((await interviewRepo.getById(interview.id))?.openFloorAskedAt).toEqual(now);
    });

    it("does not route a discovery-type study to FeedbackAgent", async () => {
      const { interviewAgent, feedbackAgent, interviewRepo, studyRepo, llm, interview } =
        await setup();
      const now = new Date("2026-08-19T12:01:00.000Z");
      await interviewRepo.update(interview.id, { startedAt: now });
      llm.scriptInterviewerTurns([{ utterance: "Tell me more.", shouldEndInterview: false }]);

      await generateTurn(
        { interviewAgent, feedbackAgent, interviewRepo, studyRepo, now },
        inputFor(interview.id, [{ role: "user", content: "hi" }]),
      );

      expect(llm.calls.generateInterviewerTurn).toHaveLength(1);
    });
  });
});
