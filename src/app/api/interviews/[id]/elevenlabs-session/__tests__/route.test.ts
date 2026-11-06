import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy } from "@/study-service";

const studyRepo = new InMemoryStudyRepository();
const interviewRepo = new InMemoryInterviewRepository();
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => studyRepo }));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => interviewRepo,
}));
vi.mock("@/lib/elevenlabs/client", () => ({ fetchSignedUrl: async () => "wss://signed" }));

import { POST } from "../route";

beforeEach(() => {
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID = "agent_test";
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
});

async function interviewFor(
  type: "feedback" | "discovery",
  firstMessage?: string,
  firstName = "Priya",
) {
  const study = await createStudy(studyRepo, {
    title: "T",
    description: "D",
    type,
    feedbackQuestions: type === "feedback" ? ["Q"] : undefined,
    preInterviewQuestions: [],
    voiceProvider: "elevenlabs",
  });
  if (firstMessage) await studyRepo.updateDetails(study.id, { firstMessage });
  return interviewRepo.create({
    studyId: study.id,
    firstName,
    email: "p@example.com",
    mode: "voice",
    voiceProvider: "elevenlabs",
  });
}

const call = (id: string) =>
  POST(new Request("http://localhost/api", { method: "POST" }), { params: { id } });

describe("POST /api/interviews/[id]/elevenlabs-session", () => {
  it("returns only the signed URL when the study has no opening line of its own", async () => {
    const interview = await interviewFor("feedback");

    const body = await (await call(interview.id)).json();

    expect(body).toEqual({ signedUrl: "wss://signed" });
  });

  it("returns the study's opening line with the participant's name filled in", async () => {
    const interview = await interviewFor(
      "feedback",
      "Hi {{participant_name}}, thanks for helping.",
    );

    const body = await (await call(interview.id)).json();

    expect(body).toEqual({
      signedUrl: "wss://signed",
      firstMessage: "Hi Priya, thanks for helping.",
    });
  });

  it("ignores an opening line on a study that is not a feedback study", async () => {
    const interview = await interviewFor("discovery", "Hello there");

    const body = await (await call(interview.id)).json();

    expect(body).toEqual({ signedUrl: "wss://signed" });
  });
});
