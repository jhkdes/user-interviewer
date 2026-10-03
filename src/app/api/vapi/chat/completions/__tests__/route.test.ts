import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

const state = {
  interviewRepo: new InMemoryInterviewRepository(),
  studyRepo: new InMemoryStudyRepository(),
  llm: new FakeLLMProvider(),
};
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => state.interviewRepo,
}));
vi.mock("@/repositories/get-study-repository", () => ({
  getStudyRepository: () => state.studyRepo,
}));
vi.mock("@/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/llm")>()),
  getLLMProvider: () => state.llm,
}));

import { POST } from "../route";

afterEach(() => {
  vi.restoreAllMocks();
});

async function interview(mode: "voice" | "text") {
  state.interviewRepo = new InMemoryInterviewRepository();
  state.studyRepo = new InMemoryStudyRepository();
  state.llm = new FakeLLMProvider();
  const study = await state.studyRepo.create({
    type: "feedback",
    title: "Feedback",
    description: "quick check-in",
    preInterviewQuestions: [],
    feedbackQuestions: ["What stood out?"],
    linkToken: "token",
  });
  return state.interviewRepo.create({
    studyId: study.id,
    firstName: "Sam",
    email: "sam@example.com",
    mode,
  });
}

function post(interviewId: string) {
  return POST(
    new Request("http://localhost/api/vapi/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hello" }],
        call: { id: "call-1" },
        metadata: { interviewId },
      }),
    }),
  );
}

describe("POST /api/vapi/chat/completions", () => {
  it("answers 409 for a late request from a call whose interview became a typing interview, generating nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const typing = await interview("text");

    const response = await post(typing.id);

    expect(response.status).toBe(409);
    expect(state.llm.calls.generateInterviewerTurn).toHaveLength(0);
    expect(log).toHaveBeenCalled();
  });

  it("still serves a voice interview", async () => {
    const voice = await interview("voice");
    await state.interviewRepo.update(voice.id, { startedAt: new Date() });
    state.llm.scriptInterviewerTurns([{ utterance: "What stood out?", shouldEndInterview: false }]);

    const response = await post(voice.id);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("What stood out?");
  });
});
