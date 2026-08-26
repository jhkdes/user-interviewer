import { describe, expect, it } from "vitest";
import { InterviewAgent } from "@/interview-agent";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { END_CALL_PHRASE, generateTurn } from "../custom-llm";
import { InterviewNotFoundError, MissingInterviewIdError, StudyNotFoundError } from "../errors";
import type { CustomLLMChatCompletionRequest } from "../vapi-types";

const targetProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

async function setup() {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const llm = new FakeLLMProvider();
  const interviewAgent = new InterviewAgent(llm);

  const study = await studyRepo.create({ targetProfile, linkToken: "token" });
  const interview = await interviewRepo.create({
    studyId: study.id,
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: "Engineering manager overseeing a platform team",
  });

  return { studyRepo, interviewRepo, llm, interviewAgent, study, interview };
}

function requestFor(interviewId: string, messages: CustomLLMChatCompletionRequest["messages"]) {
  return {
    model: "gpt-4o",
    messages,
    call: { id: "call-1" },
    metadata: { interviewId },
  } satisfies CustomLLMChatCompletionRequest;
}

describe("generateTurn", () => {
  it("maps OpenAI-formatted messages into the InterviewAgent's conversation history", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([
      { utterance: "Tell me more about that.", shouldEndInterview: false },
    ]);

    await generateTurn(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, [
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

  it("returns the utterance as-is when the interview should continue", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "What happens next?", shouldEndInterview: false }]);

    const result = await generateTurn(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, [{ role: "user", content: "It's frustrating." }]),
    );

    expect(result).toEqual({ utterance: "What happens next?", isInterviewOver: false });
  });

  it("appends END_CALL_PHRASE when the interview is over", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
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
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, history),
    );

    expect(result.isInterviewOver).toBe(true);
    expect(result.utterance).toBe(`Thanks so much for your time. ${END_CALL_PHRASE}`);
  });

  it("forces isInterviewOver once the 15-minute hard cap has elapsed, regardless of the LLM's own signal", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, { startedAt: new Date("2026-08-19T12:00:00.000Z") });
    llm.scriptInterviewerTurns([{ utterance: "One more thing...", shouldEndInterview: false }]);

    const result = await generateTurn(
      { interviewAgent, interviewRepo, studyRepo, now: new Date("2026-08-19T12:20:01.000Z") },
      requestFor(interview.id, [{ role: "user", content: "..." }]),
    );

    expect(result.isInterviewOver).toBe(true);
    expect(result.utterance).toBe(`One more thing... ${END_CALL_PHRASE}`);
  });

  it("falls back to call.assistantOverrides.metadata.interviewId when top-level metadata is absent", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "Got it.", shouldEndInterview: false }]);

    const result = await generateTurn(
      { interviewAgent, interviewRepo, studyRepo, now },
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
      },
    );

    expect(result.utterance).toBe("Got it.");
  });

  it("throws MissingInterviewIdError when neither top-level nor call.assistantOverrides metadata is present", async () => {
    const { interviewAgent, interviewRepo, studyRepo } = await setup();

    await expect(
      generateTurn(
        { interviewAgent, interviewRepo, studyRepo },
        { model: "gpt-4o", messages: [], call: { id: "call-1" } },
      ),
    ).rejects.toThrow(MissingInterviewIdError);
  });

  it("throws InterviewNotFoundError for an unknown interview id", async () => {
    const { interviewAgent, interviewRepo, studyRepo } = await setup();

    await expect(
      generateTurn(
        { interviewAgent, interviewRepo, studyRepo },
        requestFor("00000000-0000-0000-0000-000000000000", []),
      ),
    ).rejects.toThrow(InterviewNotFoundError);
  });

  it("throws StudyNotFoundError when the interview's study no longer exists", async () => {
    const { interviewAgent, interviewRepo, interview } = await setup();
    // Simulate a dangling reference — the in-memory study repo has no delete,
    // so swap in a fresh empty one for this assertion instead.
    const emptyStudyRepo = new InMemoryStudyRepository();

    await expect(
      generateTurn(
        { interviewAgent, interviewRepo, studyRepo: emptyStudyRepo },
        requestFor(interview.id, []),
      ),
    ).rejects.toThrow(StudyNotFoundError);
  });
});
