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

const turn = { speaker: "interviewer" as const, text: "Hi.", timestampMs: 0 };

/** The route keeps an in-process cache at module level, so each test loads a fresh copy of it. */
async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

async function createStudy(linkToken: string, completed: number) {
  const study = await repos.studyRepo.create({
    title: `Study ${linkToken}`,
    description: "desc",
    preInterviewQuestions: [],
    linkToken,
  });
  for (let i = 0; i < completed; i++) {
    const created = await repos.interviewRepo.create({
      studyId: study.id,
      firstName: `P${i}`,
      email: `${linkToken}-p${i}@example.com`,
    });
    await repos.interviewRepo.update(created.id, { status: "completed", transcript: [turn] });
  }
  return study;
}

function request(origin?: string, query = "") {
  return new Request(`http://localhost/api/public/completed-interviews-count${query}`, {
    headers: origin ? { origin } : {},
  });
}

beforeEach(() => {
  repos.studyRepo = new InMemoryStudyRepository();
  repos.interviewRepo = new InMemoryInterviewRepository();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/public/completed-interviews-count", () => {
  it("returns the configured study's completed-interview count and nothing else", async () => {
    const study = await createStudy("jobseekers", 3);
    await createStudy("someone-elses", 9);
    vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
    const { GET } = await loadRoute();

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completedInterviews: 3 });
  });

  it("never reveals the study id", async () => {
    const study = await createStudy("jobseekers", 2);
    vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
    const { GET } = await loadRoute();

    const response = await GET(request("https://discoverfirst.co"));

    expect(await response.text()).not.toContain(study.id);
    expect(JSON.stringify([...response.headers.entries()])).not.toContain(study.id);
  });

  it("needs no key, and ignores anything in the query string, including a study id", async () => {
    const mine = await createStudy("jobseekers", 2);
    const other = await createStudy("someone-elses", 8);
    vi.stubEnv("PUBLIC_COUNT_STUDY_ID", mine.id);
    const { GET } = await loadRoute();

    const response = await GET(request(undefined, `?studyId=${other.id}&id=${other.id}`));

    expect((await response.json()).completedInterviews).toBe(2);
  });

  describe("caching", () => {
    it("tells browsers and the CDN they may reuse the answer for a minute", async () => {
      const study = await createStudy("jobseekers", 1);
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
      const { GET } = await loadRoute();

      const response = await GET(request());

      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      );
    });

    it("does not query the database again within the minute, however many requests or query strings", async () => {
      const study = await createStudy("jobseekers", 4);
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
      const spy = vi.spyOn(repos.interviewRepo, "countCompletedWithTranscript");
      const { GET } = await loadRoute();

      await GET(request());
      await GET(request());
      await GET(request(undefined, "?bust=1"));
      await GET(request(undefined, "?bust=2"));

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("CORS", () => {
    it("lets https://discoverfirst.co read the response by default", async () => {
      const study = await createStudy("jobseekers", 1);
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
      const { GET } = await loadRoute();

      const response = await GET(request("https://discoverfirst.co"));

      expect(response.headers.get("access-control-allow-origin")).toBe("https://discoverfirst.co");
      expect(response.headers.get("vary")).toBe("Origin");
    });

    it("does not let any other site's page read it", async () => {
      const study = await createStudy("jobseekers", 1);
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
      const { GET } = await loadRoute();

      for (const origin of ["https://evil.example", "https://www.discoverfirst.co", "null"]) {
        const response = await GET(request(origin));
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("vary")).toBe("Origin");
      }
    });

    it("lets additional origins read it when they are configured, replacing the default", async () => {
      const study = await createStudy("jobseekers", 1);
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
      vi.stubEnv(
        "PUBLIC_COUNT_ALLOWED_ORIGINS",
        "https://www.discoverfirst.co, http://localhost:4000",
      );
      const { GET } = await loadRoute();

      expect(
        (await GET(request("https://www.discoverfirst.co"))).headers.get(
          "access-control-allow-origin",
        ),
      ).toBe("https://www.discoverfirst.co");
      expect(
        (await GET(request("http://localhost:4000"))).headers.get("access-control-allow-origin"),
      ).toBe("http://localhost:4000");
      expect(
        (await GET(request("https://discoverfirst.co"))).headers.get("access-control-allow-origin"),
      ).toBeNull();
    });

    it("answers a preflight for the allowed origin with 204 and the allowed methods", async () => {
      const { OPTIONS } = await loadRoute();

      const response = await OPTIONS(
        new Request("http://localhost/api/public/completed-interviews-count", {
          method: "OPTIONS",
          headers: { origin: "https://discoverfirst.co" },
        }),
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("https://discoverfirst.co");
      expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    });

    it("answers a preflight from another origin without granting it access", async () => {
      const { OPTIONS } = await loadRoute();

      const response = await OPTIONS(
        new Request("http://localhost/api/public/completed-interviews-count", {
          method: "OPTIONS",
          headers: { origin: "https://evil.example" },
        }),
      );

      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  describe("when it can't answer", () => {
    it("answers 503, uncached and without details, when no study is configured", async () => {
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", "");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { GET } = await loadRoute();

      const response = await GET(request("https://discoverfirst.co"));

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Unavailable" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("answers 503 when the configured id matches no study, and does not cache that", async () => {
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", "00000000-0000-0000-0000-000000000000");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { GET } = await loadRoute();

      const response = await GET(request());

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Unavailable" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("answers 503 without leaking details when the database fails, then recovers on the next request", async () => {
      const study = await createStudy("jobseekers", 2);
      vi.stubEnv("PUBLIC_COUNT_STUDY_ID", study.id);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const spy = vi
        .spyOn(repos.interviewRepo, "countCompletedWithTranscript")
        .mockRejectedValueOnce(new Error("connection string leaked"));
      const { GET } = await loadRoute();

      const failed = await GET(request("https://discoverfirst.co"));
      const recovered = await GET(request("https://discoverfirst.co"));

      expect(failed.status).toBe(503);
      expect(JSON.stringify(await failed.json())).not.toContain("connection string");
      expect(failed.headers.get("cache-control")).toBe("no-store");
      expect(failed.headers.get("access-control-allow-origin")).toBe("https://discoverfirst.co");
      expect(recovered.status).toBe(200);
      expect((await recovered.json()).completedInterviews).toBe(2);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
