import { afterEach, describe, expect, it, vi } from "vitest";
import { IDLE_NUDGE_TEXT } from "@/text-session";
import { setupTextSession } from "@/text-session/__tests__/test-helpers";

const getTextSessionDeps = vi.fn();
vi.mock("@/text-session/get-text-session-deps", () => ({
  getTextSessionDeps: () => getTextSessionDeps(),
}));

import { GET, POST } from "../route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  getTextSessionDeps.mockReset();
});

function request(method: "GET" | "POST", authorization?: string) {
  return new Request("http://localhost/api/internal/text-idle-sweep", {
    method,
    headers: authorization ? { authorization } : {},
  });
}

/** A running text interview that has been quiet for six minutes, so the sweep nudges it. */
async function quietInterview() {
  const s = await setupTextSession();
  await s.startedWith(
    [{ speaker: "interviewer", text: "Hi Sam!" }],
    new Date(Date.now() - 8 * 60_000),
  );
  await s.interviewRepo.update(s.interview.id, {
    lastActivityAt: new Date(Date.now() - 6 * 60_000),
  });
  getTextSessionDeps.mockReturnValue(s.deps);
  return s;
}

describe("text-idle-sweep route", () => {
  it("runs the sweep for a request carrying the right secret, on GET (Vercel Cron) and POST", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { interview, messageRepo } = await quietInterview();

    const response = await GET(request("GET", "Bearer s3cret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ checked: 1, nudged: [interview.id] });
    expect((await messageRepo.listByInterviewId(interview.id)).map((m) => m.text)).toContain(
      IDLE_NUDGE_TEXT,
    );

    const second = await POST(request("POST", "Bearer s3cret"));
    expect(second.status).toBe(200);
  });

  it("rejects a missing or wrong secret without running the sweep", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { interview, messageRepo } = await quietInterview();

    for (const authorization of [undefined, "Bearer wrong", "s3cret"]) {
      const response = await GET(request("GET", authorization));
      expect(response.status).toBe(401);
    }

    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
  });

  it("refuses to run at all when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { interview, messageRepo } = await quietInterview();

    // Even a request with an empty bearer must not get through.
    const response = await GET(request("GET", "Bearer "));

    expect(response.status).toBe(500);
    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
  });

  it("reports a failing sweep as a 500", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { interviewRepo } = await quietInterview();
    vi.spyOn(interviewRepo, "listActiveTextInterviews").mockRejectedValue(new Error("db down"));

    const response = await GET(request("GET", "Bearer s3cret"));

    expect(response.status).toBe(500);
  });
});
