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

  it("speaks a partner interview's frozen opening line, not the study's current one", async () => {
    const interview = await interviewFor(
      "feedback",
      "Hi {{participant_name}}, the study's current line",
    );
    await interviewRepo.update(interview.id, {
      snapshot: {
        prompt: "p",
        firstMessage: "Hi Priya, thanks for helping with Jae Kim.",
        closingQuestion: null,
        targetMinutes: 5,
        hardStopMinutes: 7,
      },
    });

    const body = await (await call(interview.id)).json();

    expect(body).toEqual({
      signedUrl: "wss://signed",
      firstMessage: "Hi Priya, thanks for helping with Jae Kim.",
    });
  });

  it("sends no override for a partner interview whose study has no opening line", async () => {
    const interview = await interviewFor("feedback", "A line set after the interview began");
    await interviewRepo.update(interview.id, {
      snapshot: {
        prompt: "p",
        firstMessage: null,
        closingQuestion: null,
        targetMinutes: 5,
        hardStopMinutes: 7,
      },
    });

    expect(await (await call(interview.id)).json()).toEqual({ signedUrl: "wss://signed" });
  });
});
