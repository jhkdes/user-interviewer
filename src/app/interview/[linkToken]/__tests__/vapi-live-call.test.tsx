// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeVapi = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  class FakeVapi {
    static instances: FakeVapi[] = [];
    handlers: Record<string, Handler> = {};
    start = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    removeAllListeners = vi.fn();
    constructor() {
      FakeVapi.instances.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers[event] = handler;
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      this.handlers[event]?.(...args);
    }
  }
  return FakeVapi;
});
vi.mock("@vapi-ai/web", () => ({ default: fakeVapi }));

import { VapiLiveCall } from "../vapi-live-call";

const RESTART = /Restart with a typing interview/;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPI_PUBLIC_KEY", "public-key");
  vi.stubEnv("NEXT_PUBLIC_VAPI_ASSISTANT_ID", "assistant-1");
  fakeVapi.instances.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

function currentCall() {
  return fakeVapi.instances[fakeVapi.instances.length - 1];
}

function renderCall(
  props: { onSwitchedToTyping?: () => void; onRetry?: () => void; onEnded?: () => void } = {},
) {
  const onEnded = props.onEnded ?? vi.fn();
  render(
    <VapiLiveCall
      interviewId="interview-1"
      type="feedback"
      onEnded={onEnded}
      onSwitchedToTyping={props.onSwitchedToTyping}
      onRetry={props.onRetry}
    />,
  );
  return { onEnded };
}

/** Drives the call to the point where the interviewer has started speaking. */
function startInterview() {
  act(() => {
    currentCall().emit("call-start");
    currentCall().emit("speech-start");
  });
}

function stubSwitchRoute(ok: boolean, order?: string[]) {
  const fetchSpy = vi.fn(async () => {
    order?.push("switch-request");
    return new Response(null, { status: ok ? 200 : 409 });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("VapiLiveCall typing restart", () => {
  it("offers nothing extra when typing isn't offered", () => {
    renderCall();
    startInterview();

    expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
  });

  it("offers the restart while connecting, and during the first 30 seconds of the interview", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCall({ onSwitchedToTyping: vi.fn() });
    expect(screen.getByText(RESTART)).toBeInTheDocument();

    startInterview();
    expect(screen.getByText(RESTART)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByText(RESTART)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
  });

  it("restarts only after the server confirmed, then stops the call and hands over to the chat", async () => {
    const order: string[] = [];
    stubSwitchRoute(true, order);
    const onSwitchedToTyping = vi.fn(() => {
      order.push("handed-over");
    });
    renderCall({ onSwitchedToTyping });
    startInterview();
    currentCall().stop.mockImplementation(async () => {
      order.push("call-stopped");
    });

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });

    expect(order).toEqual(["switch-request", "call-stopped", "handed-over"]);
    expect(fetch).toHaveBeenCalledWith("/api/interviews/interview-1/switch-to-text", {
      method: "POST",
    });
  });

  it("does not take the call ending as the interview finishing", async () => {
    stubSwitchRoute(true);
    const { onEnded } = renderCall({ onSwitchedToTyping: vi.fn() });
    startInterview();

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });
    act(() => {
      currentCall().emit("call-end");
      currentCall().emit("error", new Error("Meeting has ended"));
    });

    expect(onEnded).not.toHaveBeenCalled();
    expect(screen.queryByText("Call ended")).not.toBeInTheDocument();
  });

  it("leaves the call running when the server refuses the restart", async () => {
    stubSwitchRoute(false);
    const onSwitchedToTyping = vi.fn();
    const { onEnded } = renderCall({ onSwitchedToTyping });
    startInterview();

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't restart/);
    expect(currentCall().stop).not.toHaveBeenCalled();
    expect(onSwitchedToTyping).not.toHaveBeenCalled();
    // The interview carries on and ends normally.
    act(() => currentCall().emit("call-end"));
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("leaves the call running when the participant keeps talking", () => {
    const fetchSpy = stubSwitchRoute(true);
    renderCall({ onSwitchedToTyping: vi.fn() });
    startInterview();

    fireEvent.click(screen.getByText(RESTART));
    fireEvent.click(screen.getByRole("button", { name: "Keep talking" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(currentCall().stop).not.toHaveBeenCalled();
  });

  it("still hands over to the chat if stopping the call throws", async () => {
    stubSwitchRoute(true);
    const onSwitchedToTyping = vi.fn();
    renderCall({ onSwitchedToTyping });
    startInterview();
    currentCall().stop.mockRejectedValue(new Error("already stopped"));

    fireEvent.click(screen.getByText(RESTART));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));
    });

    expect(onSwitchedToTyping).toHaveBeenCalledTimes(1);
  });

  describe("on the error screen", () => {
    it("offers Try again and the restart, and restarts without asking, when the call failed before it began", async () => {
      stubSwitchRoute(true);
      const onSwitchedToTyping = vi.fn();
      const onRetry = vi.fn();
      renderCall({ onSwitchedToTyping, onRetry });

      act(() => currentCall().emit("error", new Error("Permission denied")));

      expect(screen.getByText("Permission denied")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(onRetry).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.click(screen.getByText(RESTART));
      });
      expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
      expect(onSwitchedToTyping).toHaveBeenCalledTimes(1);
    });

    it("offers the restart but no retry when the call failed part-way through the interview", () => {
      renderCall({ onSwitchedToTyping: vi.fn(), onRetry: vi.fn() });
      startInterview();

      act(() => currentCall().emit("error", new Error("Connection lost")));

      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      expect(screen.getByText(RESTART)).toBeInTheDocument();
    });

    it("offers no retry when none was offered", () => {
      renderCall({ onSwitchedToTyping: vi.fn() });

      act(() => currentCall().emit("error", new Error("Permission denied")));

      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });
  });

  it("still ends normally when typing isn't offered", () => {
    const { onEnded } = renderCall();
    startInterview();

    act(() => currentCall().emit("call-end"));

    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
