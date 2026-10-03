// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODE_SELECT_COUNTDOWN_SECONDS, ModeSelectScreen } from "../mode-select-screen";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** Advances one second at a time, letting React re-render (and schedule the next tick) in between. */
function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe("ModeSelectScreen", () => {
  it("counts down from ten and starts the voice interview by itself at zero", () => {
    const onStartVoice = vi.fn();
    render(<ModeSelectScreen onStartVoice={onStartVoice} onSwitchToTyping={vi.fn()} />);

    expect(MODE_SELECT_COUNTDOWN_SECONDS).toBe(10);
    expect(screen.getByText(/starts in 10 seconds/)).toBeInTheDocument();
    tick(9);
    expect(screen.getByText(/starts in 1 second\./)).toBeInTheDocument();
    expect(onStartVoice).not.toHaveBeenCalled();

    tick(1);

    expect(onStartVoice).toHaveBeenCalledTimes(1);
  });

  it("starts voice straight away with the prominent Start now button, only once", () => {
    const onStartVoice = vi.fn();
    render(<ModeSelectScreen onStartVoice={onStartVoice} onSwitchToTyping={vi.fn()} />);

    tick(3);
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    tick(20);

    expect(onStartVoice).toHaveBeenCalledTimes(1);
  });

  it("offers typing only as a discreet secondary option", () => {
    render(<ModeSelectScreen onStartVoice={vi.fn()} onSwitchToTyping={vi.fn()} />);

    const start = screen.getByRole("button", { name: "Start now" });
    const typing = screen.getByRole("button", { name: /Switch to typing/ });
    expect(start.className).toContain("bg-neutral-900");
    expect(typing.className).toContain("text-xs");
    expect(typing.className).toContain("underline");
    expect(typing.className).not.toContain("bg-neutral-900");
  });

  it("stops the countdown while switching to typing and never starts voice", async () => {
    let resolveSwitch: (ok: boolean) => void = () => {};
    const onSwitchToTyping = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSwitch = resolve;
        }),
    );
    const onStartVoice = vi.fn();
    render(<ModeSelectScreen onStartVoice={onStartVoice} onSwitchToTyping={onSwitchToTyping} />);

    tick(4);
    fireEvent.click(screen.getByRole("button", { name: /Switch to typing/ }));
    expect(onSwitchToTyping).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Setting up your typing interview/)).toBeInTheDocument();
    tick(30);
    expect(onStartVoice).not.toHaveBeenCalled();

    await act(async () => resolveSwitch(true));
    tick(30);

    expect(onStartVoice).not.toHaveBeenCalled();
  });

  it("keeps the countdown stopped and explains when switching to typing fails", async () => {
    const onStartVoice = vi.fn();
    render(
      <ModeSelectScreen
        onStartVoice={onStartVoice}
        onSwitchToTyping={vi.fn().mockResolvedValue(false)}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Switch to typing/ }));
    });
    tick(30);

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't switch to typing/);
    expect(onStartVoice).not.toHaveBeenCalled();
    expect(screen.getByText(/countdown is paused/)).toBeInTheDocument();
    // They can still start the voice interview or try typing again.
    expect(screen.getByRole("button", { name: "Start now" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Switch to typing/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    expect(onStartVoice).toHaveBeenCalledTimes(1);
  });
});
