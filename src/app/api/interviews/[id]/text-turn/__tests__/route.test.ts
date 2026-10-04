import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_REQUEST_BODY_BYTES } from "@/text-session";
import { setupTextSession } from "@/text-session/__tests__/test-helpers";

const getTextSessionDeps = vi.fn();
vi.mock("@/text-session/get-text-session-deps", () => ({
  getTextSessionDeps: () => getTextSessionDeps(),
}));

import { POST } from "../route";

afterEach(() => {
  vi.restoreAllMocks();
  getTextSessionDeps.mockReset();
});

function post(id: string, body: unknown, init: { raw?: string } = {}) {
  return POST(
    new Request(`http://localhost/api/interviews/${id}/text-turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: init.raw ?? JSON.stringify(body),
    }),
    { params: { id } },
  );
}

async function readEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

describe("POST /api/interviews/[id]/text-turn", () => {
  it("streams the opening greeting as newline-delimited JSON events", async () => {
    const { deps, interview, llm } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["Hi Sam, ", "welcome!"], shouldEndInterview: false },
    ]);

    const response = await post(interview.id, { clientMessageId: "open-1" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    const events = await readEvents(response);
    expect(events.filter((e) => e.type === "text-delta").map((e) => e.text)).toEqual([
      "Hi Sam, ",
      "welcome!",
    ]);
    expect(events[events.length - 1]).toEqual({
      type: "done",
      message: { seq: 1, text: "Hi Sam, welcome!" },
      interviewOver: false,
      endedReason: null,
    });
  });

  it("answers a rejected turn with a JSON error and the matching status", async () => {
    const { deps, interview, startedWith } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);

    const response = await post(interview.id, {
      clientMessageId: "m-1",
      message: "a".repeat(2001),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("message-too-long");
    expect(body.error.message).toMatch(/shorten/i);
  });

  it("includes why the interview ended when it already has", async () => {
    const { deps, interview, interviewRepo } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    await interviewRepo.update(interview.id, {
      status: "completed",
      endedReason: "participant-inactive",
    });

    const response = await post(interview.id, { clientMessageId: "m-1", message: "hello?" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "interview-ended",
      endedReason: "participant-inactive",
    });
  });

  it("rejects a body that is not JSON", async () => {
    const { deps, interview } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);

    const response = await post(interview.id, undefined, { raw: "not json" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid-request");
  });

  it("rejects a body that is JSON but not an object", async () => {
    const { deps, interview } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);

    const response = await post(interview.id, null);

    expect(response.status).toBe(400);
  });

  it("rejects an oversized body with 413 before doing any work", async () => {
    const { deps, interview, messageRepo } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);

    const response = await post(interview.id, {
      clientMessageId: "m-1",
      message: "a".repeat(MAX_REQUEST_BODY_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
  });

  it("reports an unexpected failure as a 500 without leaking details", async () => {
    const { deps, interview, interviewRepo } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(interviewRepo, "getById").mockRejectedValue(new Error("connection string leaked"));

    const response = await post(interview.id, { clientMessageId: "m-1" });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("connection string");
  });

  it("still stores the reply when the model fails mid-turn, ending the stream with an error event", async () => {
    const { deps, interview, startedWith } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);

    const response = await post(interview.id, { clientMessageId: "m-1", message: "Hello." });

    expect(response.status).toBe(200);
    const events = await readEvents(response);
    expect(events[events.length - 1]).toMatchObject({ type: "error", code: "generation-failed" });
  });

  it("keeps generating and saving the reply even if the browser stops reading", async () => {
    const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
    getTextSessionDeps.mockReturnValue(deps);
    await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["What ", "stood ", "out ", "most?"], shouldEndInterview: false },
    ]);

    const response = await post(interview.id, { clientMessageId: "m-1", message: "Hello." });
    // Start reading, then walk away after the first chunk.
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    // Give the server-side loop a chance to finish draining.
    await vi.waitFor(async () => {
      const stored = await messageRepo.listByInterviewId(interview.id);
      expect(stored.map((m) => m.text)).toEqual(["Hi Sam!", "Hello.", "What stood out most?"]);
    });
  });
});
