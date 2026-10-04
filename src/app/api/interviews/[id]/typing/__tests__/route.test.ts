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
  vi.restoreAllMocks();
});

function post(id: string) {
  return POST(new Request(`http://localhost/api/interviews/${id}/typing`, { method: "POST" }), {
    params: { id },
  });
}

async function runningInterview() {
  const s = await setupTextSession();
  repos.interviewRepo = s.interviewRepo;
  repos.studyRepo = s.studyRepo;
  await s.interviewRepo.update(s.interview.id, {
    status: "in-progress",
    startedAt: new Date(Date.now() - 120_000),
    lastActivityAt: new Date(Date.now() - 90_000),
  });
  return s;
}

describe("POST /api/interviews/[id]/typing", () => {
  it("records the typing signal and answers 204 with no body", async () => {
    const { interview, interviewRepo } = await runningInterview();
    const before = (await interviewRepo.getById(interview.id))!.lastActivityAt!;

    const response = await post(interview.id);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const after = (await interviewRepo.getById(interview.id))!.lastActivityAt!;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("answers 404 for an unknown interview", async () => {
    await runningInterview();

    expect((await post("00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  it("answers 409 for an interview that has ended", async () => {
    const { interview, interviewRepo } = await runningInterview();
    await interviewRepo.update(interview.id, { status: "completed" });

    const response = await post(interview.id);

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("interview-ended");
  });

  it("reports an unexpected failure as a 500", async () => {
    const { interview, interviewRepo } = await runningInterview();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(interviewRepo, "getById").mockRejectedValue(new Error("db down"));

    expect((await post(interview.id)).status).toBe(500);
  });
});
