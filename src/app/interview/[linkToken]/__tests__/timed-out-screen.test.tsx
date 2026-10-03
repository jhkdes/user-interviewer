// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimedOutScreen } from "../timed-out-screen";

afterEach(cleanup);

describe("TimedOutScreen", () => {
  it("says the interview ended due to inactivity and that what was shared is saved", () => {
    render(<TimedOutScreen />);

    expect(screen.getByRole("heading")).toHaveTextContent("This interview ended due to inactivity");
    expect(screen.getByText(/didn't see any activity for 7 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/has been saved/)).toBeInTheDocument();
  });

  it("offers no way to restart", () => {
    render(<TimedOutScreen />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
