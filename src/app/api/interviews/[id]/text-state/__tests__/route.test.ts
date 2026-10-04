import { afterEach, describe, expect, it, vi } from "vitest";
import { setupTextSession } from "@/text-session/__tests__/test-helpers";

const getTextSessionDeps = vi.fn();
vi.mock("@/text-session/get-text-session-deps", () => ({
  getTextSessionDeps: () => getTextSessionDeps(),
}));

import { GET } from "../route";

afterEach(() => {
  vi.restoreAllMocks();
  getTextSessionDeps.mockReset();
});

function get(id: string, query = "") {
  return GET(new Request(`http://localhost/api/interviews/${id}/text-state${query}`), {
    params: { id },
  });
}

describe("GET /api/interviews/[id]/text-state", () => {
  it("returns the interview state for the right link token, uncached", async () => {
    const { deps, interview, startedWith } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);

    const response = await get(interview.id, "?linkToken=feedback-token");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ mode: "text", status: "in-progress", firstName: "Sam" });
    expect(body.messages).toHaveLength(1);
  });

  it("requires a link token", async () => {
    const { deps, interview } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);

    const response = await get(interview.id);

    expect(response.status).toBe(400);
  });

  it("answers 404 for a wrong link token, without saying why", async () => {
    const { deps, interview } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);

    const response = await get(interview.id, "?linkToken=someone-elses");

    expect(response.status).toBe(404);
  });

  it("answers 404 for a voice interview", async () => {
    const { deps, interview } = await setupTextSession({ mode: "voice" });
    getTextSessionDeps.mockReturnValue(deps);

    const response = await get(interview.id, "?linkToken=feedback-token");

    expect(response.status).toBe(404);
  });

  it("reports an unexpected failure as a 500", async () => {
    const { deps, interview, interviewRepo } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(interviewRepo, "getById").mockRejectedValue(new Error("db down"));

    const response = await get(interview.id, "?linkToken=feedback-token");

    expect(response.status).toBe(500);
  });
});
