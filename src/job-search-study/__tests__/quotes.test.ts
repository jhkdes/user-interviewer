import { describe, expect, it } from "vitest";
import { normalizeForMatch, verifyQuote } from "../ledger/quotes";
import { SAMPLE_TRANSCRIPT } from "./ledger-helpers";

describe("normalizeForMatch", () => {
  it("ignores case, punctuation, filler words, and stutters", () => {
    expect(normalizeForMatch("So, uh, I, I think it took, um, ten to fifteen minutes.")).toBe(
      "so i think it took ten to fifteen minutes",
    );
  });

  it("treats hyphens as spaces and keeps contractions", () => {
    expect(normalizeForMatch("end-to-end, don't")).toBe("end to end don't");
  });

  it("drops abandoned word fragments but keeps hyphenated words", () => {
    expect(normalizeForMatch("I f- and, and it only, s- do the end-to-end")).toBe(
      "i and it only do the end to end",
    );
  });

  it("normalizes typographic apostrophes", () => {
    expect(normalizeForMatch("I’m")).toBe("i'm");
  });
});

describe("verifyQuote", () => {
  it("verifies a quote in the stated participant turn despite filler and stutters", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, {
        turnIndex: 1,
        text: "I think it took ten to fifteen minutes",
      }),
    ).toEqual({ status: "verified", turnIndex: 1 });
  });

  it("accepts a quote with an ellipsis if the segments appear in order", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, {
        turnIndex: 1,
        text: "found it on LinkedIn ... one of three resumes",
      }),
    ).toEqual({ status: "verified", turnIndex: 1 });
  });

  it("treats a bracketed clarification as an elision", () => {
    const transcript = [
      {
        speaker: "participant" as const,
        text: "I did not, so that was a mistake on my part, um, because the whole idea was hands-free.",
      },
    ];

    expect(
      verifyQuote(transcript, {
        turnIndex: 0,
        text: "I did not [check what it submitted], so that was a mistake on my part",
      }),
    ).toEqual({ status: "verified", turnIndex: 0 });
  });

  it("rejects an ellipsis quote whose segments are out of order", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, {
        turnIndex: 1,
        text: "one of three resumes ... found it on LinkedIn",
      }),
    ).toMatchObject({ status: "unverified" });
  });

  it("relocates a real quote given the wrong turn index", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, { turnIndex: 3, text: "Two were recruiters reaching out" }),
    ).toEqual({ status: "relocated", turnIndex: 5 });
  });

  it("relocates when the index is out of range", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, {
        turnIndex: 99,
        text: "most of them at least the recent ones",
      }),
    ).toEqual({ status: "relocated", turnIndex: 3 });
  });

  it("does not accept the interviewer's words as evidence", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, {
        turnIndex: 0,
        text: "Walk me through your most recent application",
      }),
    ).toEqual({ status: "unverified", reason: "not_a_participant_turn" });
  });

  it("rejects words that are not in the transcript", () => {
    expect(
      verifyQuote(SAMPLE_TRANSCRIPT, { turnIndex: 1, text: "I always customize every resume" }),
    ).toEqual({ status: "unverified", reason: "not_found" });
  });

  it("verifies a quote that skips abandoned word fragments", () => {
    const transcript = [
      { speaker: "interviewer" as const, text: "What are your hard requirements?" },
      {
        speaker: "participant" as const,
        text: "Hard one is I wanna stay in product. I wanna s- do the enterprise B2B, um, and I, I wanna be in San Francisco.",
      },
    ];

    expect(
      verifyQuote(transcript, {
        turnIndex: 1,
        text: "I wanna stay in product. I wanna do the enterprise B2B",
      }),
    ).toEqual({ status: "verified", turnIndex: 1 });
  });

  it("verifies a quote where the transcript ran words together", () => {
    const transcript = [
      {
        speaker: "participant" as const,
        text: "It was building software forfinancial services, which I have experience of.",
      },
    ];

    expect(
      verifyQuote(transcript, { turnIndex: 0, text: "building software for financial services" }),
    ).toEqual({ status: "verified", turnIndex: 0 });
  });

  it("allows a long quote segment to start inside a run-together word", () => {
    const transcript = [
      {
        speaker: "participant" as const,
        text: "The size is ideal, 50 to 500, butit's not, you know, hard rule.",
      },
    ];

    expect(
      verifyQuote(transcript, { turnIndex: 0, text: "it's not, you know, hard rule" }),
    ).toEqual({ status: "verified", turnIndex: 0 });
  });

  it("still rejects a short segment that only matches inside a word", () => {
    const transcript = [{ speaker: "participant" as const, text: "I use linkedin a lot." }];

    expect(verifyQuote(transcript, { turnIndex: 0, text: "linked" })).toMatchObject({
      status: "unverified",
    });
  });

  it("still rejects elided words that were not marked with an ellipsis", () => {
    const transcript = [
      {
        speaker: "participant" as const,
        text: "I pass mostly on the industry vertical. So, if it's super interesting but it's about medical, I just don't apply.",
      },
    ];

    expect(
      verifyQuote(transcript, { turnIndex: 0, text: "industry vertical if it's about medical" }),
    ).toMatchObject({ status: "unverified" });
  });

  it("rejects an empty quote", () => {
    expect(verifyQuote(SAMPLE_TRANSCRIPT, { turnIndex: 1, text: " ... " })).toEqual({
      status: "unverified",
      reason: "empty",
    });
  });

  it("does not match a quote that is only a partial word", () => {
    expect(verifyQuote(SAMPLE_TRANSCRIPT, { turnIndex: 1, text: "linked" })).toMatchObject({
      status: "unverified",
    });
  });
});
