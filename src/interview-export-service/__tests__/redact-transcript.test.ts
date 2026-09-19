import { describe, expect, it } from "vitest";
import type { TranscriptEntry } from "@/domain";
import { autoRedactTranscript } from "../redact-transcript";

function turn(speaker: TranscriptEntry["speaker"], text: string): TranscriptEntry {
  return { speaker, text, timestampMs: 0 };
}

describe("autoRedactTranscript", () => {
  it("replaces the participant's first name with [Participant]", () => {
    const transcript = [
      turn("interviewer", "Thanks, Jae, that's really helpful."),
      turn("participant", "No problem at all."),
    ];

    const result = autoRedactTranscript(transcript, "Jae");

    expect(result[0].text).toBe("Thanks, [Participant], that's really helpful.");
    expect(result[1].text).toBe("No problem at all.");
  });

  it("is case-insensitive", () => {
    const transcript = [turn("interviewer", "hi JAE, welcome.")];
    expect(autoRedactTranscript(transcript, "Jae")[0].text).toBe("hi [Participant], welcome.");
  });

  it("replaces every occurrence, not just the first", () => {
    const transcript = [turn("participant", "I'm Jae. Jae here. Call me Jae.")];
    expect(autoRedactTranscript(transcript, "Jae")[0].text).toBe(
      "I'm [Participant]. [Participant] here. Call me [Participant].",
    );
  });

  it("does not redact a longer word that merely contains the name (word-boundary safe)", () => {
    const transcript = [turn("participant", "I used to work at Jaeger Studios.")];
    expect(autoRedactTranscript(transcript, "Jae")[0].text).toBe(
      "I used to work at Jaeger Studios.",
    );
  });

  it("redacts email-looking text regardless of whose it is", () => {
    const transcript = [
      turn("participant", "You can reach me at jae.kim+test@example.co.uk anytime."),
    ];
    expect(autoRedactTranscript(transcript, "Jae")[0].text).toBe(
      "You can reach me at [redacted email] anytime.",
    );
  });

  it("leaves text with nothing to redact unchanged", () => {
    const transcript = [turn("interviewer", "How was your day overall?")];
    expect(autoRedactTranscript(transcript, "Jae")[0].text).toBe("How was your day overall?");
  });

  it("handles an empty first name gracefully (no name pattern applied)", () => {
    const transcript = [turn("participant", "Hi there.")];
    expect(autoRedactTranscript(transcript, "")[0].text).toBe("Hi there.");
  });

  it("preserves speaker and timestampMs, only changing text", () => {
    const transcript = [{ speaker: "participant" as const, text: "I'm Jae.", timestampMs: 4200 }];
    const result = autoRedactTranscript(transcript, "Jae");
    expect(result[0]).toEqual({
      speaker: "participant",
      text: "I'm [Participant].",
      timestampMs: 4200,
    });
  });

  it("does not mutate the input array or its entries", () => {
    const transcript = [turn("participant", "I'm Jae.")];
    const original = JSON.parse(JSON.stringify(transcript));
    autoRedactTranscript(transcript, "Jae");
    expect(transcript).toEqual(original);
  });

  it("returns an empty array for an empty transcript", () => {
    expect(autoRedactTranscript([], "Jae")).toEqual([]);
  });
});
