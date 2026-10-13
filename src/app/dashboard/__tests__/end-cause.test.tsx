// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { describeCallEnd } from "../call-end-label";
import { EndCauseBadge } from "../end-cause-badge";

afterEach(cleanup);

const dropped = {
  endCause: "interrupted" as const,
  endDetail: {
    provider: "elevenlabs" as const,
    status: "failed",
    errorType: "client_disconnected",
    errorReason: "No user message received for 60 seconds",
    terminationReason: "No user message received for a long period of time",
  },
};

describe("describeCallEnd", () => {
  it("says an interviewer-ended call wrapped up", () => {
    expect(describeCallEnd({ endCause: "finished", endDetail: null })).toBe(
      "the interviewer wrapped up",
    );
  });

  it("explains a dropped call, with the provider's reason", () => {
    expect(describeCallEnd(dropped)).toBe(
      "the call ended before the interviewer wrapped up: client disconnected: No user message received for 60 seconds",
    );
  });

  it("falls back to the termination reason or Vapi's end reason", () => {
    expect(
      describeCallEnd({
        endCause: "interrupted",
        endDetail: { provider: "elevenlabs", terminationReason: "Call ended by user." },
      }),
    ).toBe("the call ended before the interviewer wrapped up: Call ended by user.");
    expect(
      describeCallEnd({
        endCause: "interrupted",
        endDetail: { provider: "vapi", endedReason: "silence-timed-out" },
      }),
    ).toBe("the call ended before the interviewer wrapped up: silence-timed-out");
    expect(describeCallEnd({ endCause: "interrupted", endDetail: null })).toBe(
      "the call ended before the interviewer wrapped up",
    );
  });

  it("says nothing when the end was not recorded", () => {
    expect(describeCallEnd({ endCause: null, endDetail: null })).toBeNull();
  });
});

describe("EndCauseBadge", () => {
  it("marks a dropped call, with the reason on hover", () => {
    render(<EndCauseBadge interview={dropped} />);

    const badge = screen.getByText("Call dropped");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", expect.stringContaining("client disconnected"));
  });

  it("shows nothing for a finished call or one that was not recorded", () => {
    const { container, rerender } = render(
      <EndCauseBadge interview={{ endCause: "finished", endDetail: null }} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<EndCauseBadge interview={{ endCause: null, endDetail: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
