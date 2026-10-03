// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestartWithTyping } from "../restart-with-typing";

afterEach(cleanup);

const LINK = /Can't use voice\? Restart with a typing interview/;

describe("RestartWithTyping", () => {
  it("shows a discreet link", () => {
    render(<RestartWithTyping needsConfirmation onRestart={vi.fn()} />);

    const link = screen.getByRole("button", { name: LINK });
    expect(link.className).toContain("text-xs");
    expect(link.className).toContain("underline");
  });

  it("asks before discarding what was said, and does nothing until confirmed", () => {
    const onRestart = vi.fn().mockResolvedValue(true);
    render(<RestartWithTyping needsConfirmation onRestart={onRestart} />);

    fireEvent.click(screen.getByRole("button", { name: LINK }));

    expect(onRestart).not.toHaveBeenCalled();
    expect(screen.getByText(/what's been said so far is discarded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart by typing" })).toBeInTheDocument();
  });

  it("goes back to the link when the participant chooses to keep talking", () => {
    const onRestart = vi.fn();
    render(<RestartWithTyping needsConfirmation onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: LINK }));

    fireEvent.click(screen.getByRole("button", { name: "Keep talking" }));

    expect(screen.getByRole("button", { name: LINK })).toBeInTheDocument();
    expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("restarts once confirmed, showing progress meanwhile", async () => {
    let finish: (ok: boolean) => void = () => {};
    const onRestart = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(<RestartWithTyping needsConfirmation onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: LINK }));

    fireEvent.click(screen.getByRole("button", { name: "Restart by typing" }));

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Setting up your typing interview/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => finish(true));
  });

  it("skips the question where nothing has been said", () => {
    const onRestart = vi.fn().mockResolvedValue(true);
    render(<RestartWithTyping needsConfirmation={false} onRestart={onRestart} />);

    fireEvent.click(screen.getByRole("button", { name: LINK }));

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
  });

  it("says so, and lets them try again, when the restart fails", async () => {
    const onRestart = vi.fn().mockResolvedValue(false);
    render(<RestartWithTyping needsConfirmation={false} onRestart={onRestart} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: LINK }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't restart as a typing interview/);
    expect(screen.getByRole("button", { name: LINK })).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: LINK }));
    });
    expect(onRestart).toHaveBeenCalledTimes(2);
  });
});
