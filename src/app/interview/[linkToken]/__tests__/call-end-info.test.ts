import { describe, expect, it } from "vitest";
import { MIN_PARTICIPANT_TURNS_FOR_REPORT } from "@/job-search-study/min-turns";
import { DEFAULT_MIN_PARTICIPANT_TURNS_FOR_FOLLOW_UP, endedEarly } from "../call-end-info";

const call = (participantTurns: number) => ({ participantTurns, reason: "agent" as const });

describe("endedEarly", () => {
  it("uses a small default for studies that do not make a report", () => {
    expect(DEFAULT_MIN_PARTICIPANT_TURNS_FOR_FOLLOW_UP).toBe(6);
    expect(endedEarly(call(5))).toBe(true);
    expect(endedEarly(call(6))).toBe(false);
  });

  it("uses the report's minimum for a study that makes one", () => {
    expect(MIN_PARTICIPANT_TURNS_FOR_REPORT).toBe(14);
    expect(endedEarly(call(13), MIN_PARTICIPANT_TURNS_FOR_REPORT)).toBe(true);
    expect(endedEarly(call(14), MIN_PARTICIPANT_TURNS_FOR_REPORT)).toBe(false);
  });
});
