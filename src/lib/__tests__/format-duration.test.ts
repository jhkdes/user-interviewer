import { describe, expect, it } from "vitest";
import { formatDuration } from "../format-duration";

describe("formatDuration", () => {
  it("formats zero as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("pads single-digit seconds with a leading zero", () => {
    expect(formatDuration(5)).toBe("0:05");
  });

  it("does not pad minutes", () => {
    expect(formatDuration(12 * 60 + 34)).toBe("12:34");
  });

  it("rolls over past 60 seconds into minutes", () => {
    expect(formatDuration(60)).toBe("1:00");
  });

  it("truncates fractional seconds rather than rounding", () => {
    expect(formatDuration(4.9)).toBe("0:04");
  });

  it("formats durations over an hour as minutes, not hours:minutes:seconds", () => {
    expect(formatDuration(61 * 60 + 5)).toBe("61:05");
  });
});
