import { describe, expect, it } from "vitest";
import { InterviewAgent } from "@/interview-agent";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { END_CALL_PHRASE, handleVapiCustomLlmRequest } from "../custom-llm-handler";
import { MissingInterviewIdError } from "../../errors";
import type { VapiCustomLlmChatCompletionRequest } from "../types";

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

function requestFor(
  interviewId: string,
  messages: VapiCustomLlmChatCompletionRequest["messages"],
) {
  return {
    model: "gpt-4o",
    messages,
    call: { id: "call-1" },
    metadata: { interviewId },
  } satisfies VapiCustomLlmChatCompletionRequest;
}

/** Extracts the spoken utterance from the SSE body's first content chunk. */
function spokenUtterance(sseBody: string): string {
  const firstDataLine = sseBody.split("\n\n")[0].replace(/^data: /, "");
  return JSON.parse(firstDataLine).choices[0].delta.content;
}

describe("handleVapiCustomLlmRequest", () => {
  it("returns the utterance as-is (no phrase appended) when the interview should continue", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "What happens next?", shouldEndInterview: false }]);

    const sseBody = await handleVapiCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, [{ role: "user", content: "It's frustrating." }]),
    );

    expect(spokenUtterance(sseBody)).toBe("What happens next?");
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

    const sseBody = await handleVapiCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, history),
    );

    expect(spokenUtterance(sseBody)).toBe(`Thanks so much for your time. ${END_CALL_PHRASE}`);
  });

  it("ends the call when the participant explicitly asks to end it, even on the very first exchange", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([
      {
        utterance: "Of course — take care, and thanks for the time you did give me.",
        shouldEndInterview: false,
        participantRequestedEnd: true,
      },
    ]);

    const sseBody = await handleVapiCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, [
        { role: "assistant", content: "Hi, tell me about your day." },
        { role: "user", content: "I actually have to go, can you end this?" },
      ]),
    );

    expect(spokenUtterance(sseBody)).toBe(
      `Of course — take care, and thanks for the time you did give me. ${END_CALL_PHRASE}`,
    );
  });

  it("strips the LLM's own concluding sentence before appending END_CALL_PHRASE, so the exact phrase Vapi listens for is never garbled", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    const history = Array.from({ length: 4 }, (_, i) => [
      { role: "assistant" as const, content: `Q${i}` },
      { role: "user" as const, content: `A${i}` },
    ]).flat();
    llm.scriptInterviewerTurns([
      {
        utterance:
          "Thanks so much for your time, Jordan. This concludes our interview session for today.",
        shouldEndInterview: true,
      },
    ]);

    const sseBody = await handleVapiCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, history),
    );

    expect(spokenUtterance(sseBody)).toBe(`Thanks so much for your time, Jordan. ${END_CALL_PHRASE}`);
  });

  it("forces END_CALL_PHRASE once the 15-minute hard cap has elapsed, regardless of the LLM's own signal", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, { startedAt: new Date("2026-08-19T12:00:00.000Z") });
    llm.scriptInterviewerTurns([{ utterance: "One more thing...", shouldEndInterview: false }]);

    const sseBody = await handleVapiCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now: new Date("2026-08-19T12:20:01.000Z") },
      requestFor(interview.id, [{ role: "user", content: "..." }]),
    );

    expect(spokenUtterance(sseBody)).toBe(`One more thing... ${END_CALL_PHRASE}`);
  });

  it("falls back to call.assistantOverrides.metadata.interviewId when top-level metadata is absent", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "Got it.", shouldEndInterview: false }]);

    const sseBody = await handleVapiCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
        call: { id: "call-1", assistantOverrides: { metadata: { interviewId: interview.id } } },
      },
    );

    expect(spokenUtterance(sseBody)).toBe("Got it.");
  });

  it("throws MissingInterviewIdError when neither top-level nor call.assistantOverrides metadata is present", async () => {
    const { interviewAgent, interviewRepo, studyRepo } = await setup();

    await expect(
      handleVapiCustomLlmRequest(
        { interviewAgent, interviewRepo, studyRepo },
        { model: "gpt-4o", messages: [], call: { id: "call-1" } },
      ),
    ).rejects.toThrow(MissingInterviewIdError);
  });
});
