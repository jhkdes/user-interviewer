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
  return POST(new Request(`http://localhost/api/interviews/${id}/start-text`, { method: "POST" }), {
    params: { id },
  });
}

async function setup() {
  const session = await setupTextSession({ mode: "voice" });
  repos.interviewRepo = session.interviewRepo;
  repos.studyRepo = session.studyRepo;
  return session;
}

describe("POST /api/interviews/[id]/start-text", () => {
  it("switches a pending feedback interview to text when the flag is on", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    const { interview, interviewRepo } = await setup();

    const response = await post(interview.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "text" });
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("text");
  });

  it("refuses when the flag is off", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "");
    const { interview, interviewRepo } = await setup();

    const response = await post(interview.id);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("not-supported");
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("voice");
  });

  it("answers 404 for an unknown interview", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    await setup();

    const response = await post("00000000-0000-0000-0000-000000000000");

    expect(response.status).toBe(404);
  });

  it("reports an unexpected failure as a 500", async () => {
    vi.stubEnv("TEXT_INTERVIEW_MODE_ENABLED", "true");
    const { interview, interviewRepo } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(interviewRepo, "getById").mockRejectedValue(new Error("db down"));

    const response = await post(interview.id);

    expect(response.status).toBe(500);
  });
});
