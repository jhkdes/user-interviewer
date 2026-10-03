import { afterEach, describe, expect, it, vi } from "vitest";
import { setupTextSession } from "@/text-session/__tests__/test-helpers";

const repos = { interviewRepo: undefined as unknown, studyRepo: undefined as unknown };
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => repos.interviewRepo,
}));
vi.mock("@/repositories/get-study-repository", () => ({
  getStudyRepository: () => repos.studyRepo,
}));

import { POST } from "../route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function post(id: string) {
  return POST(
    new Request(`http://localhost/api/interviews/${id}/switch-to-text`, { method: "POST" }),
    { params: { id } },
  );
}

async function voiceCall() {
  const s = await setupTextSession({ mode: "voice" });
  repos.interviewRepo = s.interviewRepo;
  repos.studyRepo = s.studyRepo;
  await s.interviewRepo.update(s.interview.id, {
    status: "in-progress",
    startedAt: new Date(Date.now() - 10_000),
    vapiCallId: "call-1",
  });
  return s;
}

describe("POST /api/interviews/[id]/switch-to-text", () => {
  it("restarts the interview as a typing interview when the flag is on", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    const { interview, interviewRepo } = await voiceCall();

    const response = await post(interview.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "text" });
    expect(await interviewRepo.getById(interview.id)).toMatchObject({
      mode: "text",
      status: "pending",
      vapiCallId: null,
    });
  });

  it("refuses when the flag is off, leaving the call alone", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "");
    const { interview, interviewRepo } = await voiceCall();

    const response = await post(interview.id);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("not-supported");
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("voice");
  });

  it("says why when it is too late", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    const { interview, interviewRepo } = await voiceCall();
    await interviewRepo.update(interview.id, { startedAt: new Date(Date.now() - 120_000) });

    const response = await post(interview.id);

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("too-late");
  });

  it("answers 404 for an unknown interview", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    await voiceCall();

    expect((await post("00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  it("reports an unexpected failure as a 500", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    const { interview, interviewRepo } = await voiceCall();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(interviewRepo, "getById").mockRejectedValue(new Error("db down"));

    expect((await post(interview.id)).status).toBe(500);
  });
});
