// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SessionEndedScreen } from "../session-ended-screen";

afterEach(cleanup);

describe("SessionEndedScreen", () => {
  it("says the session reached its limit and that what was shared is saved", () => {
    render(<SessionEndedScreen />);

    expect(screen.getByRole("heading")).toHaveTextContent("This session has ended");
    expect(screen.getByText(/60-minute limit/)).toBeInTheDocument();
    expect(screen.getByText(/has been saved|were saved|is saved|saved/)).toBeInTheDocument();
  });

  it("follows with the study's ending text, so what happens next still reaches the participant", () => {
    render(
      <SessionEndedScreen
        copy={{ completion: { message: "Your free report arrives by email within a day." } }}
      />,
    );

    expect(screen.getByText("Your free report arrives by email within a day.")).toBeInTheDocument();
  });

  it("falls back to the standard typed ending text", () => {
    render(<SessionEndedScreen />);

    expect(screen.getByText(/chat with us/)).toBeInTheDocument();
  });

  it("offers no way to restart", () => {
    render(<SessionEndedScreen />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
