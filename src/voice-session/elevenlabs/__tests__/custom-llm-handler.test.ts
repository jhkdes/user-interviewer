import { describe, expect, it } from "vitest";
import { InterviewAgent } from "@/interview-agent";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { MissingInterviewIdError } from "../../errors";
import { handleElevenLabsCustomLlmRequest } from "../custom-llm-handler";
import type { ElevenLabsCustomLlmChatCompletionRequest } from "../types";

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

  const study = await studyRepo.create({
    targetProfile,
    linkToken: "token",
    voiceProvider: "elevenlabs",
  });
  const interview = await interviewRepo.create({
    studyId: study.id,
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: "Engineering manager overseeing a platform team",
    voiceProvider: "elevenlabs",
  });

  return { studyRepo, interviewRepo, llm, interviewAgent, study, interview };
}

function requestFor(
  interviewId: string,
  messages: ElevenLabsCustomLlmChatCompletionRequest["messages"],
) {
  return {
    model: "gpt-4o",
    messages,
    elevenlabs_extra_body: { interviewId },
  } satisfies ElevenLabsCustomLlmChatCompletionRequest;
}

function sseChunks(sseBody: string) {
  return sseBody
    .split("\n\n")
    .filter(Boolean)
    .map((line) => line.replace(/^data: /, ""))
    .filter((line) => line !== "[DONE]")
    .map((line) => JSON.parse(line));
}

describe("handleElevenLabsCustomLlmRequest", () => {
  it("streams the utterance as a plain content chunk when the interview should continue", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurns([{ utterance: "What happens next?", shouldEndInterview: false }]);

    const sseBody = await handleElevenLabsCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, [{ role: "user", content: "It's frustrating." }]),
    );

    const chunks = sseChunks(sseBody);
    expect(chunks[0].choices[0].delta.content).toBe("What happens next?");
    expect(chunks.some((c) => c.choices[0].delta.tool_calls)).toBe(false);
  });

  it("streams the utterance followed by an end_call tool call when the interview is over", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    const history = Array.from({ length: 4 }, (_, i) => [
      { role: "assistant" as const, content: `Q${i}` },
      { role: "user" as const, content: `A${i}` },
    ]).flat();
    llm.scriptInterviewerTurns([
      { utterance: "Thanks so much for your time.", shouldEndInterview: true },
    ]);

    const sseBody = await handleElevenLabsCustomLlmRequest(
      { interviewAgent, interviewRepo, studyRepo, now },
      requestFor(interview.id, history),
    );

    const chunks = sseChunks(sseBody);
    expect(chunks[0].choices[0].delta.content).toBe("Thanks so much for your time.");
    const toolCall = chunks[1].choices[0].delta.tool_calls[0];
    expect(toolCall.function.name).toBe("end_call");
    expect(chunks[1].choices[0].finish_reason).toBe("tool_calls");
  });

  it("throws MissingInterviewIdError when elevenlabs_extra_body.interviewId is absent", async () => {
    const { interviewAgent, interviewRepo, studyRepo } = await setup();

    await expect(
      handleElevenLabsCustomLlmRequest(
        { interviewAgent, interviewRepo, studyRepo },
        { model: "gpt-4o", messages: [] },
      ),
    ).rejects.toThrow(MissingInterviewIdError);
  });
});
