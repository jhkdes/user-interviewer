import { describe, expect, it } from "vitest";
import { describeTextEndedReason } from "../ended-reason-label";

describe("describeTextEndedReason", () => {
  it.each([
    ["text-interview-ended", "the interviewer wrapped up"],
    ["participant-requested", "the participant asked to stop"],
    ["time-cap", "the time limit was reached"],
    ["participant-inactive", "no activity (timed out)"],
    ["message-limit", "the message limit was reached"],
  ])("describes %s", (reason, label) => {
    expect(describeTextEndedReason(reason)).toBe(label);
  });

  it("shows an unrecognized reason as is rather than hiding it", () => {
    expect(describeTextEndedReason("something-new")).toBe("something-new");
  });

  it("returns null when there is no reason", () => {
    expect(describeTextEndedReason(null)).toBeNull();
    expect(describeTextEndedReason("")).toBeNull();
  });
});
