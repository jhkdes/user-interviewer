// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InterviewModeBadge } from "../interview-mode-badge";

afterEach(cleanup);

describe("InterviewModeBadge", () => {
  it("marks a typed interview", () => {
    render(<InterviewModeBadge interview={{ mode: "text", switchedToTextAt: null }} />);

    const badge = screen.getByText("Typed");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", expect.stringMatching(/no audio recording/));
  });

  it("says when the participant started by voice and switched to typing", () => {
    render(
      <InterviewModeBadge
        interview={{ mode: "text", switchedToTextAt: new Date("2026-01-01T00:00:20.000Z") }}
      />,
    );

    expect(screen.getByText("Typed · switched from voice")).toBeInTheDocument();
  });

  it("shows nothing for a voice interview, so existing lists look as they always have", () => {
    const { container } = render(
      <InterviewModeBadge interview={{ mode: "voice", switchedToTextAt: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
