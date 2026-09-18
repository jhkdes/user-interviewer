// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CallShell } from "../call-shell";

afterEach(() => {
  cleanup();
});

describe("CallShell", () => {
  it("states the 15-minute duration for a discovery-type interview in progress", () => {
    render(
      <CallShell status="in-progress" errorMessage={null} elapsedSeconds={30} type="discovery" />,
    );

    expect(screen.getByText(/takes about 15 mins/)).toBeInTheDocument();
    expect(screen.queryByText(/takes about 5 mins/)).not.toBeInTheDocument();
  });

  it("states the 5-minute duration for a feedback-type call in progress, not 15", () => {
    render(
      <CallShell status="in-progress" errorMessage={null} elapsedSeconds={30} type="feedback" />,
    );

    expect(screen.getByText(/takes about 5 mins/)).toBeInTheDocument();
    expect(screen.queryByText(/takes about 15 mins/)).not.toBeInTheDocument();
  });

  it("shows no duration copy outside the in-progress status", () => {
    render(
      <CallShell status="connecting" errorMessage={null} elapsedSeconds={0} type="feedback" />,
    );

    expect(screen.queryByText(/takes about/)).not.toBeInTheDocument();
  });
});
