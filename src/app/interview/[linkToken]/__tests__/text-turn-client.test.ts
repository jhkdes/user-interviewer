import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTextState, sendTextTurn } from "../text-turn-client";
import {
  doneEvent,
  jsonResponse,
  makeState,
  ndjsonResponse,
  stateMessages,
  turnError,
} from "./text-test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendTextTurn", () => {
  it("posts the request as JSON to the interview's text-turn endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(ndjsonResponse([doneEvent(1, "Hi")]));
    vi.stubGlobal("fetch", fetchSpy);

    await sendTextTurn(
      "interview-1",
      { clientMessageId: "m-1", message: "Hello", retry: true },
      vi.fn(),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/interviews/interview-1/text-turn");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      clientMessageId: "m-1",
      message: "Hello",
      retry: true,
    });
  });

  it("passes each text delta to the callback in order, then reports done", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          ndjsonResponse([
            { type: "text-delta", text: "What " },
            { type: "text-delta", text: "stood out?" },
            doneEvent(3, "What stood out?"),
          ]),
        ),
    );
    const onDelta = vi.fn();

    const outcome = await sendTextTurn("i", { clientMessageId: "m-1", message: "Hi" }, onDelta);

    expect(onDelta.mock.calls.map((c) => c[0])).toEqual(["What ", "stood out?"]);
    expect(outcome).toEqual({
      kind: "done",
      message: { seq: 3, text: "What stood out?" },
      interviewOver: false,
      endedReason: null,
    });
  });

  it("reassembles events that arrive split across chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          ndjsonResponse(
            [{ type: "text-delta", text: "Héllo 😀 there" }, doneEvent(1, "Héllo 😀 there")],
            { splitEvery: 3 },
          ),
        ),
    );
    const onDelta = vi.fn();

    const outcome = await sendTextTurn("i", { clientMessageId: "m-1" }, onDelta);

    expect(onDelta).toHaveBeenCalledWith("Héllo 😀 there");
    expect(outcome.kind).toBe("done");
  });

  it("reports that the interview ended, with the reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse([doneEvent(5, "Thanks, bye!", true, "time-cap")])),
    );

    const outcome = await sendTextTurn("i", { clientMessageId: "m-1", message: "ok" }, vi.fn());

    expect(outcome).toMatchObject({ kind: "done", interviewOver: true, endedReason: "time-cap" });
  });

  it("reports a rejected request with its code, message, and end reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          turnError(409, "interview-ended", "This interview has ended.", "participant-inactive"),
        ),
    );

    const outcome = await sendTextTurn("i", { clientMessageId: "m-1", message: "hi" }, vi.fn());

    expect(outcome).toEqual({
      kind: "rejected",
      status: 409,
      code: "interview-ended",
      message: "This interview has ended.",
      endedReason: "participant-inactive",
    });
  });

  it("falls back to a generic rejection when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 })),
    );

    const outcome = await sendTextTurn("i", { clientMessageId: "m-1", message: "hi" }, vi.fn());

    expect(outcome).toMatchObject({ kind: "rejected", status: 502, code: "server-error" });
  });

  it("reports a stream error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          ndjsonResponse([
            { type: "error", code: "generation-failed", message: "Please try again." },
          ]),
        ),
    );

    const outcome = await sendTextTurn("i", { clientMessageId: "m-1", message: "hi" }, vi.fn());

    expect(outcome).toEqual({
      kind: "stream-error",
      code: "generation-failed",
      message: "Please try again.",
    });
  });

  it("reports a lost connection when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect(await sendTextTurn("i", { clientMessageId: "m-1" }, vi.fn())).toEqual({
      kind: "connection-lost",
    });
  });

  it("reports a lost connection when the stream ends without a done event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse([{ type: "text-delta", text: "What st" }])),
    );

    expect(await sendTextTurn("i", { clientMessageId: "m-1" }, vi.fn())).toEqual({
      kind: "connection-lost",
    });
  });

  it("reports a lost connection when reading the stream throws", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("network reset"));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    expect(await sendTextTurn("i", { clientMessageId: "m-1" }, vi.fn())).toEqual({
      kind: "connection-lost",
    });
  });
});

describe("fetchTextState", () => {
  it("returns the state, asking for the right interview and link token without caching", async () => {
    const state = makeState({ messages: stateMessages(["interviewer", "Hi Sam!"]) });
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(state));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchTextState("interview-1", "token with space");

    expect(result).toEqual({ kind: "ok", state });
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "/api/interviews/interview-1/text-state?linkToken=token%20with%20space",
    );
    expect(fetchSpy.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });

  it("reports not-found for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 404)));

    expect(await fetchTextState("i", "t")).toEqual({ kind: "not-found" });
  });

  it("reports an error for other failures and for a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    expect(await fetchTextState("i", "t")).toEqual({ kind: "error" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await fetchTextState("i", "t")).toEqual({ kind: "error" });
  });
});
