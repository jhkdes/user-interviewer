// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_TEXT_HARD_CAP_MS } from "@/interview-agent/termination";
import { formatRemaining, TextChat, type ChatClock } from "../text-chat";
import {
  doneEvent,
  jsonResponse,
  makeState,
  ndjsonResponse,
  stateMessages,
} from "./text-test-utils";

const START = new Date("2026-01-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

const SEEDED = [
  { key: "seq-1", speaker: "interviewer" as const, text: "Hi Sam!" },
  { key: "seq-2", speaker: "participant" as const, text: "Hello" },
  { key: "seq-3", speaker: "interviewer" as const, text: "What do you do?" },
];

/** A clock for an interview that started `elapsedMs` ago, with the participant's clock `offsetMs` behind the server's. */
function clockElapsed(elapsedMs: number, offsetMs = 0): ChatClock {
  return { startedAtMs: START.getTime() - elapsedMs + offsetMs, offsetMs };
}

function renderChat(
  props: {
    clock?: ChatClock | null;
    onEnded?: (reason: string | null) => void;
    limited?: boolean;
    initialMessages?: typeof SEEDED;
  } = {},
) {
  const onEnded = props.onEnded ?? vi.fn();
  render(
    <TextChat
      interviewId="interview-1"
      linkToken="text-token"
      initialMessages={props.initialMessages ?? SEEDED}
      onEnded={onEnded}
      heading="Interview chat"
      sessionLimitMs={props.limited === false ? undefined : DISCOVERY_TEXT_HARD_CAP_MS}
      initialClock={props.clock ?? null}
    />,
  );
  return { onEnded };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("formatRemaining", () => {
  it("shows minutes and seconds, and never goes negative", () => {
    expect(formatRemaining(60 * 60_000)).toBe("60:00");
    expect(formatRemaining(42 * 60_000 + 15_000)).toBe("42:15");
    expect(formatRemaining(9_001)).toBe("0:10");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
});

describe("the session countdown", () => {
  it("shows the time left, quietly, from when the interview started", () => {
    renderChat({ clock: clockElapsed(17 * 60_000 + 45_000) });

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("Time remaining 42:15");
    expect(timer.className).toContain("text-neutral-400");
    expect(timer.className).not.toContain("amber");
  });

  it("counts down each second", async () => {
    renderChat({ clock: clockElapsed(10 * 60_000) });
    expect(screen.getByRole("timer")).toHaveTextContent("Time remaining 50:00");

    await advance(3000);

    expect(screen.getByRole("timer")).toHaveTextContent("Time remaining 49:57");
  });

  it("uses the server's clock, so a participant whose clock is off still sees the right time", () => {
    // The device clock is 2 hours behind the server's: only the offset keeps this at 42:15.
    renderChat({ clock: clockElapsed(17 * 60_000 + 45_000, 2 * 60 * 60_000) });

    expect(screen.getByRole("timer")).toHaveTextContent("Time remaining 42:15");
  });

  it("turns amber for the last five minutes", () => {
    renderChat({ clock: clockElapsed(DISCOVERY_TEXT_HARD_CAP_MS - 4 * 60_000) });

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("Time remaining 4:00");
    expect(timer.className).toContain("amber");
  });

  it("is not shown on a chat without a session limit", () => {
    renderChat({ limited: false, clock: clockElapsed(60_000) });

    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interview chat" })).toBeInTheDocument();
  });

  it("learns when a new interview started after its first reply", async () => {
    const startedAt = new Date(START.getTime() - 1000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/text-turn")) {
          return ndjsonResponse([{ type: "text-delta", text: "Hi Sam!" }, doneEvent(1, "Hi Sam!")]);
        }
        if (url.includes("/text-state")) {
          return jsonResponse(
            makeState({
              startedAt,
              serverTime: START.toISOString(),
              messages: stateMessages(["interviewer", "Hi Sam!"]),
            }),
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    renderChat({ initialMessages: [] });
    // Before the chat has started the full limit is shown.
    expect(screen.getByRole("timer")).toHaveTextContent("Time remaining 60:00");

    await advance(100);
    await advance(1100);

    expect(screen.getByRole("timer")).toHaveTextContent(/Time remaining 59:5\d/);
  });
});

describe("when the time is up", () => {
  it("stops accepting messages and says the session is closing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(makeState({ messages: stateMessages(["interviewer", "Hi"]) })),
      ),
    );
    renderChat({ clock: clockElapsed(DISCOVERY_TEXT_HARD_CAP_MS - 2000) });
    expect(screen.getByLabelText("Your message")).toBeEnabled();

    await advance(2500);

    expect(screen.getByRole("timer")).toHaveTextContent("Time remaining 0:00");
    expect(screen.getByLabelText("Your message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Time is up. Closing your session…")).toBeInTheDocument();
  });

  it("asks the server until it has closed the session, then reports the time-cap ending", async () => {
    const responses = [
      makeState({ status: "in-progress", messages: stateMessages(["interviewer", "Hi"]) }),
      makeState({
        status: "completed",
        endedReason: "time-cap",
        messages: stateMessages(["interviewer", "Hi"]),
      }),
    ];
    const fetchSpy = vi.fn(async () => jsonResponse(responses.shift() ?? responses[0]));
    vi.stubGlobal("fetch", fetchSpy);
    const { onEnded } = renderChat({ clock: clockElapsed(DISCOVERY_TEXT_HARD_CAP_MS - 1000) });

    await advance(1500); // time runs out
    expect(onEnded).not.toHaveBeenCalled();
    await advance(3100); // first check: still open
    expect(onEnded).not.toHaveBeenCalled();
    await advance(3100); // second check: closed
    await advance(50);

    expect(onEnded).toHaveBeenCalledWith("time-cap");
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not ask the server anything before the time is up (apart from the idle poll)", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(makeState()));
    vi.stubGlobal("fetch", fetchSpy);
    renderChat({ clock: clockElapsed(10 * 60_000) });

    await advance(10_000);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
