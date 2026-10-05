import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

const repos = {
  studyRepo: new InMemoryStudyRepository(),
  interviewRepo: new InMemoryInterviewRepository(),
};
vi.mock("@/repositories/get-study-repository", () => ({
  getStudyRepository: () => repos.studyRepo,
}));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => repos.interviewRepo,
}));

import { GET } from "../route";

const KEY = "ext-key-123";
const turn = { speaker: "interviewer" as const, text: "Hi.", timestampMs: 0 };

beforeEach(() => {
  repos.studyRepo = new InMemoryStudyRepository();
  repos.interviewRepo = new InMemoryInterviewRepository();
  vi.stubEnv("EXTERNAL_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function get(studyId: string, authorization?: string) {
  return GET(
    new Request(`http://localhost/api/external/studies/${studyId}/completed-interviews/count`, {
      headers: authorization ? { authorization } : {},
    }),
    { params: { id: studyId } },
  );
}

async function studyWithCompleted(completed: number) {
  const study = await repos.studyRepo.create({
    title: "Study",
    description: "desc",
    preInterviewQuestions: [],
    linkToken: "token-1",
  });
  for (let i = 0; i < completed; i++) {
    const created = await repos.interviewRepo.create({
      studyId: study.id,
      firstName: `P${i}`,
      email: `p${i}@example.com`,
    });
    await repos.interviewRepo.update(created.id, { status: "completed", transcript: [turn] });
  }
  return study;
}

describe("GET /api/external/studies/[id]/completed-interviews/count", () => {
  it("returns the study's completed-interview count to a caller with the key", async () => {
    const study = await studyWithCompleted(3);

    const response = await get(study.id, `Bearer ${KEY}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ studyId: study.id, completedInterviews: 3 });
  });

  it("returns zero for a study with no completed interviews", async () => {
    const study = await studyWithCompleted(0);

    const response = await get(study.id, `Bearer ${KEY}`);

    expect(response.status).toBe(200);
    expect((await response.json()).completedInterviews).toBe(0);
  });

  it("only counts completed interviews that have a transcript", async () => {
    const study = await studyWithCompleted(2);
    const running = await repos.interviewRepo.create({
      studyId: study.id,
      firstName: "Running",
      email: "running@example.com",
    });
    await repos.interviewRepo.update(running.id, { status: "in-progress", transcript: [turn] });
    const empty = await repos.interviewRepo.create({
      studyId: study.id,
      firstName: "Empty",
      email: "empty@example.com",
    });
    await repos.interviewRepo.update(empty.id, { status: "completed", transcript: [] });

    const response = await get(study.id, `Bearer ${KEY}`);

    expect((await response.json()).completedInterviews).toBe(2);
  });

  it("is never cached", async () => {
    const study = await studyWithCompleted(1);

    const response = await get(study.id, `Bearer ${KEY}`);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  describe("authentication", () => {
    it("answers 401 without a key, saying how to authenticate", async () => {
      const study = await studyWithCompleted(1);

      const response = await get(study.id);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    it("answers 401 for a wrong key, and never reveals the count", async () => {
      const study = await studyWithCompleted(4);

      for (const authorization of ["Bearer wrong", KEY, `Basic ${KEY}`, `Bearer ${KEY}x`]) {
        const response = await get(study.id, authorization);
        expect(response.status).toBe(401);
        expect(JSON.stringify(await response.json())).not.toContain("4");
      }
    });

    it("checks the key before looking at the study, so an unauthenticated caller can't probe which ids exist", async () => {
      const study = await studyWithCompleted(1);

      const real = await get(study.id);
      const missing = await get("00000000-0000-0000-0000-000000000000");
      const malformed = await get("not-an-id");

      for (const response of [real, missing, malformed]) {
        expect(response.status).toBe(401);
      }
    });

    it("refuses to serve at all when no key is configured, even to an empty bearer token", async () => {
      vi.stubEnv("EXTERNAL_API_KEY", "");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const study = await studyWithCompleted(1);

      for (const authorization of [undefined, "Bearer ", "Bearer"]) {
        const response = await get(study.id, authorization);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "External API not configured" });
      }
    });
  });

  describe("unknown studies", () => {
    it("answers 404 for a study that doesn't exist", async () => {
      await studyWithCompleted(1);

      const response = await get("00000000-0000-0000-0000-000000000000", `Bearer ${KEY}`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Study not found" });
    });

    it("answers the same 404 for something that isn't an id, rather than a server error", async () => {
      for (const notAnId of ["not-an-id", "123", "1; drop table studies"]) {
        const response = await get(notAnId, `Bearer ${KEY}`);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Study not found" });
      }
    });
  });

  it("reports an unexpected failure as a 500 without leaking details", async () => {
    const study = await studyWithCompleted(1);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repos.interviewRepo, "countCompletedWithTranscript").mockRejectedValue(
      new Error("connection string leaked"),
    );

    const response = await get(study.id, `Bearer ${KEY}`);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("connection string");
  });
});
