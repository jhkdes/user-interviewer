// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewFlow } from "../interview-flow";

function stubUserAgent(userAgent: string) {
  vi.stubGlobal("navigator", { ...navigator, userAgent });
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("InterviewFlow", () => {
  it("shows the mobile warning first on a mobile UA, then proceeds to intro on continue", async () => {
    stubUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    const user = userEvent.setup();

    render(<InterviewFlow linkToken="token-1" />);

    expect(await screen.findByText("You're on a mobile device")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue on mobile anyway" }));

    await waitFor(() =>
      expect(screen.getByText("You're invited to a research interview")).toBeInTheDocument(),
    );
  });

  it("skips the mobile warning and goes straight to intro on a desktop UA", async () => {
    stubUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    render(<InterviewFlow linkToken="token-1" />);

    await waitFor(() =>
      expect(screen.getByText("You're invited to a research interview")).toBeInTheDocument(),
    );
    expect(screen.queryByText("You're on a mobile device")).not.toBeInTheDocument();
  });
});
