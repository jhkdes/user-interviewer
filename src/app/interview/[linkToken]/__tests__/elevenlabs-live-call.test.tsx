// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const elevenLabs = vi.hoisted(() => {
  type Options = {
    onConnect?: () => void;
    onModeChange?: (change: { mode: "speaking" | "listening" }) => void;
    onDisconnect?: (details: unknown) => void;
    onError?: (message: string) => void;
  };
  return {
    sessions: [] as { options: Options; endSession: ReturnType<typeof vi.fn> }[],
    failStart: false,
  };
});
vi.mock("@elevenlabs/client", () => ({
  Conversation: {
    startSession: vi.fn(
      async (options: Parameters<typeof elevenLabs.sessions.push>[0]["options"]) => {
        if (elevenLabs.failStart) throw new Error("Permission denied");
        const session = { options, endSession: vi.fn().mockResolvedValue(undefined) };
        elevenLabs.sessions.push(session);
        return session;
      },
    ),
  },
}));

import { ElevenLabsLiveCall } from "../elevenlabs-live-call";

const RESTART = /Restart with a typing interview/;

beforeEach(() => {
  elevenLabs.sessions.length = 0;
  elevenLabs.failStart = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

function stubFetch(switchOk: boolean, order?: string[]) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (url.includes("/elevenlabs-session")) {
      return new Response(JSON.stringify({ signedUrl: "wss://example" }), { status: 200 });
    }
    if (url.includes("/switch-to-text")) {
      order?.push("switch-request");
      return new Response(null, { status: switchOk ? 200 : 409 });
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

async function renderCall(
  props: { onSwitchedToTyping?: () => void; onRetry?: () => void; onEnded?: () => void } = {},
) {
  const onEnded = props.onEnded ?? vi.fn();
  render(
    <ElevenLabsLiveCall
      interviewId="interview-1"
      firstName="Sam"
      type="feedback"
      onEnded={onEnded}
      onSwitchedToTyping={props.onSwitchedToTyping}
      onRetry={props.onRetry}
    />,
  );
  await waitFor(() => expect(elevenLabs.sessions).toHaveLength(1));
  return { onEnded, session: elevenLabs.sessions[0] };
}

function startInterview(session: (typeof elevenLabs.sessions)[number]) {
  act(() => {
    session.options.onConnect?.();
    session.options.onModeChange?.({ mode: "speaking" });
  });
}

describe("ElevenLabsLiveCall typing restart", () => {
  it("offers nothing extra when typing isn't offered", async () => {
    const { session } = (stubFetch(true), await renderCall());
    startInterview(session);

    expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
  });

  it("offers the restart during the first 30 seconds of the interview", async () => {
    stubFetch(true);
    const { session } = await renderCall({ onSwitchedToTyping: vi.fn() });

    startInterview(session);

    expect(screen.getByText(RESTART)).toBeInTheDocument();
  });

  it("restarts only after the server confirmed, then ends the session and hands over to the chat", async () => {
    const order: string[] = [];
    stubFetch(true, order);
    const onSwitchedToTyping = vi.fn(() => {
      order.push("handed-over");
    });
    const { session } = await renderCall({ onSwitchedToTyping });
    startInterview(session);
    session.endSession.mockImplementation(async () => {
      order.push("session-ended");
    });

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });

    expect(order).toEqual(["switch-request", "session-ended", "handed-over"]);
  });

  it("does not take the disconnect as the interview finishing", async () => {
    stubFetch(true);
    const { onEnded, session } = await renderCall({ onSwitchedToTyping: vi.fn() });
    startInterview(session);

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });
    act(() => {
      session.options.onDisconnect?.({ reason: "user" });
      session.options.onError?.("socket closed");
    });

    expect(onEnded).not.toHaveBeenCalled();
    expect(screen.queryByText("Call ended")).not.toBeInTheDocument();
  });

  it("leaves the call running when the server refuses the restart", async () => {
    stubFetch(false);
    const onSwitchedToTyping = vi.fn();
    const { onEnded, session } = await renderCall({ onSwitchedToTyping });
    startInterview(session);

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't restart/);
    expect(session.endSession).not.toHaveBeenCalled();
    expect(onSwitchedToTyping).not.toHaveBeenCalled();
    act(() => session.options.onDisconnect?.({ reason: "agent" }));
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("offers Try again and an unconfirmed restart when the session can't start, e.g. the mic was refused", async () => {
    elevenLabs.failStart = true;
    const fetchSpy = stubFetch(true);
    const onSwitchedToTyping = vi.fn();
    const onRetry = vi.fn();
    render(
      <ElevenLabsLiveCall
        interviewId="interview-1"
        firstName="Sam"
        type="feedback"
        onEnded={vi.fn()}
        onSwitchedToTyping={onSwitchedToTyping}
        onRetry={onRetry}
      />,
    );

    expect(await screen.findByText("Permission denied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByText(RESTART));
    });
    expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("/api/interviews/interview-1/switch-to-text", {
      method: "POST",
    });
    expect(onSwitchedToTyping).toHaveBeenCalledTimes(1);
  });

  it("offers the restart but no retry when the call failed part-way through the interview", async () => {
    stubFetch(true);
    const { session } = await renderCall({ onSwitchedToTyping: vi.fn(), onRetry: vi.fn() });
    startInterview(session);

    act(() => session.options.onError?.("Connection lost"));

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByText(RESTART)).toBeInTheDocument();
  });

  it("still ends normally when typing isn't offered", async () => {
    stubFetch(true);
    const { onEnded, session } = await renderCall();
    startInterview(session);

    act(() => session.options.onDisconnect?.({ reason: "agent" }));

    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
