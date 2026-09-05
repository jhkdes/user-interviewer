import { describe, expect, it } from "vitest";
import { InterviewAgent } from "@/interview-agent";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { MissingInterviewIdError } from "../../errors";
import { resolveElevenLabsStreamContext, streamElevenLabsCustomLlmResponse } from "../custom-llm-handler";
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

interface StreamedChunk {
  choices: [
    {
      delta: {
        role?: string;
        content?: string;
        tool_calls?: [{ function: { name: string; arguments: string } }];
      };
      finish_reason: string | null;
    },
  ];
}

async function drain(stream: AsyncGenerator<string, void, unknown>): Promise<StreamedChunk[]> {
  const chunks: StreamedChunk[] = [];
  for await (const raw of stream) {
    for (const line of raw.split("\n\n").filter(Boolean)) {
      const data = line.replace(/^data: /, "");
      if (data === "[DONE]") continue;
      chunks.push(JSON.parse(data) as StreamedChunk);
    }
  }
  return chunks;
}

describe("streamElevenLabsCustomLlmResponse", () => {
  it("streams the utterance incrementally, one content-delta chunk per scripted text chunk, before the decision is known", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview, study } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["What happens ", "next?"], shouldEndInterview: false },
    ]);

    const chunks = await drain(
      streamElevenLabsCustomLlmResponse(
        { interviewAgent, interviewRepo, studyRepo, now },
        requestFor(interview.id, [{ role: "user", content: "It's frustrating." }]),
        { interviewId: interview.id, interview, study },
      ),
    );

    expect(chunks[0].choices[0].delta.content).toBe("What happens ");
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    expect(chunks[0].choices[0].finish_reason).toBeNull();

    expect(chunks[1].choices[0].delta.content).toBe("next?");
    expect(chunks[1].choices[0].delta.role).toBeUndefined();
    expect(chunks[1].choices[0].finish_reason).toBeNull();

    // The finish chunk is only yielded after all text chunks.
    expect(chunks[2].choices[0].finish_reason).toBe("stop");
    expect(chunks.some((c) => c.choices[0].delta.tool_calls)).toBe(false);
  });

  it("streams the utterance followed by an end_call tool call when the interview is over", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview, study } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    const history = Array.from({ length: 4 }, (_, i) => [
      { role: "assistant" as const, content: `Q${i}` },
      { role: "user" as const, content: `A${i}` },
    ]).flat();
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["Thanks so much for your time."], shouldEndInterview: true },
    ]);

    const chunks = await drain(
      streamElevenLabsCustomLlmResponse(
        { interviewAgent, interviewRepo, studyRepo, now },
        requestFor(interview.id, history),
        { interviewId: interview.id, interview, study },
      ),
    );

    expect(chunks[0].choices[0].delta.content).toBe("Thanks so much for your time.");
    const last = chunks[chunks.length - 1];
    const toolCall = last.choices[0].delta.tool_calls?.[0];
    expect(toolCall?.function.name).toBe("end_call");
    expect(last.choices[0].finish_reason).toBe("tool_calls");
  });

  it("forwards a degenerate/empty utterance with no retry — no safety net on the streaming path", async () => {
    const { interviewAgent, interviewRepo, studyRepo, llm, interview, study } = await setup();
    const now = new Date("2026-08-19T12:01:00.000Z");
    await interviewRepo.update(interview.id, { startedAt: now });
    llm.scriptInterviewerTurnStreams([{ textChunks: [""], shouldEndInterview: false }]);

    const chunks = await drain(
      streamElevenLabsCustomLlmResponse(
        { interviewAgent, interviewRepo, studyRepo, now },
        requestFor(interview.id, [{ role: "user", content: "..." }]),
        { interviewId: interview.id, interview, study },
      ),
    );

    expect(chunks[0].choices[0].delta.content).toBe("");
    expect(llm.calls.generateInterviewerTurnStreaming).toHaveLength(1);
  });
});

describe("resolveElevenLabsStreamContext", () => {
  it("throws MissingInterviewIdError when elevenlabs_extra_body.interviewId is absent", async () => {
    const { interviewAgent, interviewRepo, studyRepo } = await setup();

    await expect(
      resolveElevenLabsStreamContext(
        { interviewAgent, interviewRepo, studyRepo },
        { model: "gpt-4o", messages: [] },
      ),
    ).rejects.toThrow(MissingInterviewIdError);
  });

  it("resolves the interview and study eagerly, before any stream is opened", async () => {
    const { interviewAgent, interviewRepo, studyRepo, interview, study } = await setup();

    const context = await resolveElevenLabsStreamContext(
      { interviewAgent, interviewRepo, studyRepo },
      requestFor(interview.id, []),
    );

    expect(context.interviewId).toBe(interview.id);
    expect(context.interview.id).toBe(interview.id);
    expect(context.study.id).toBe(study.id);
  });
});
