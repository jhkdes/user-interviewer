import { describe, expect, it } from "vitest";
import type { ParticipantCopy } from "@/domain";
import { JOB_SEARCH_PARTICIPANT_COPY } from "@/job-search-study/participant-copy";
import {
  DEFAULT_COMPLETION_TITLE,
  DEFAULT_CONSENT_NOTE,
  DEFAULT_INTRO_FACTS,
  DEFAULT_INTRO_STEPS,
  DEFAULT_TEXT_CONSENT_NOTE,
  DEFAULT_TEXT_INTRO_FACTS,
  DEFAULT_TEXT_INTRO_STEPS,
  defaultCompletionMessage,
  defaultTagline,
  mergeTextCopy,
  resolveCompletionCopy,
  resolveIntroCopy,
  resolveSessionEndedCopy,
  withoutDefaults,
} from "../index";

describe("the text link's default landing wording", () => {
  it("never mentions a voice call or a recording", () => {
    const { tagline, facts, steps, consentNote } = resolveIntroCopy(null, "how you work", "text");
    const everything = [tagline, ...facts, ...steps.flatMap((s) => [s.title, s.body]), consentNote]
      .join(" ")
      .toLowerCase();

    expect(everything).not.toContain("voice, not text");
    expect(everything).not.toContain("talk with an ai");
    expect(everything).not.toContain("call is recorded");
    expect(consentNote).toBe(DEFAULT_TEXT_CONSENT_NOTE);
    expect(consentNote).toContain("No audio is recorded");
    expect(facts).toEqual(DEFAULT_TEXT_INTRO_FACTS);
    expect(steps).toEqual(DEFAULT_TEXT_INTRO_STEPS);
  });

  it("says it is about a 15-minute written interview", () => {
    expect(defaultTagline("how you work", "text")).toBe(
      "A 15-minute AI-run written interview about how you work.",
    );
    expect(resolveIntroCopy(null, "how you work", "text").facts).toContain("~15 minutes");
  });

  it("leaves the voice wording exactly as it was", () => {
    const voice = resolveIntroCopy(null, "how you work");
    expect(voice).toEqual(resolveIntroCopy(null, "how you work", "voice"));
    expect(voice.facts).toEqual(DEFAULT_INTRO_FACTS);
    expect(voice.steps).toEqual(DEFAULT_INTRO_STEPS);
    expect(voice.consentNote).toBe(DEFAULT_CONSENT_NOTE);
    expect(voice.tagline).toBe(defaultTagline("how you work"));
  });

  it("uses custom copy over the text defaults", () => {
    const resolved = resolveIntroCopy(
      { intro: { facts: ["Custom"], consentNote: "Custom note" } },
      "x",
      "text",
    );
    expect(resolved.facts).toEqual(["Custom"]);
    expect(resolved.consentNote).toBe("Custom note");
    expect(resolved.steps).toEqual(DEFAULT_TEXT_INTRO_STEPS);
  });
});

describe("mergeTextCopy", () => {
  it("is null when neither link has custom copy", () => {
    expect(mergeTextCopy(null, null)).toBeNull();
    expect(mergeTextCopy(undefined, undefined)).toBeNull();
  });

  it("follows the voice link's custom copy when the text link has none", () => {
    expect(mergeTextCopy(null, JOB_SEARCH_PARTICIPANT_COPY)).toEqual(JOB_SEARCH_PARTICIPANT_COPY);
  });

  it("prefers the text link's own copy, field by field", () => {
    const merged = mergeTextCopy(
      { intro: { facts: ["Typed chat"] }, completion: { title: "Thanks for typing" } },
      {
        intro: { facts: ["Voice"], tagline: "Voice tagline" },
        completion: { message: "Report soon" },
      },
    );

    expect(merged).toEqual({
      intro: { facts: ["Typed chat"], tagline: "Voice tagline" },
      completion: { title: "Thanks for typing", message: "Report soon" },
    });
  });

  it("uses the text link's copy alone when the voice link has none", () => {
    expect(mergeTextCopy({ completion: { title: "Typed thanks" } }, null)).toEqual({
      completion: { title: "Typed thanks" },
    });
  });
});

describe("ending text for a typed session", () => {
  it("keeps the typed wording of the standard ending", () => {
    expect(resolveCompletionCopy(null, "text").message).toContain("chat with us");
  });

  it("names the time limit when a session runs out", () => {
    const ended = resolveSessionEndedCopy(60);
    expect(ended.title).toBe("This session has ended");
    expect(ended.message).toContain("60-minute limit");
    expect(ended.message).toContain("saved");
  });
});

describe("withoutDefaults for the text link", () => {
  const description = "how you work";
  const textState = (overrides: ParticipantCopy = {}): ParticipantCopy => ({
    intro: {
      tagline: defaultTagline(description, "text"),
      facts: DEFAULT_TEXT_INTRO_FACTS,
      steps: DEFAULT_TEXT_INTRO_STEPS,
      consentNote: DEFAULT_TEXT_CONSENT_NOTE,
      ...overrides.intro,
    },
    completion: {
      title: DEFAULT_COMPLETION_TITLE,
      message: defaultCompletionMessage("text"),
      ...overrides.completion,
    },
  });

  it("saves nothing for text left at the text defaults", () => {
    expect(withoutDefaults(textState(), description, "text")).toBeNull();
  });

  it("keeps only what differs from the text defaults", () => {
    expect(
      withoutDefaults(textState({ completion: { title: "Typed thanks" } }), description, "text"),
    ).toEqual({ completion: { title: "Typed thanks" } });
  });

  it("saves nothing for text left matching the voice link's copy", () => {
    const shown = resolveIntroCopy(
      mergeTextCopy(null, JOB_SEARCH_PARTICIPANT_COPY),
      description,
      "text",
    );
    const completion = resolveCompletionCopy(
      mergeTextCopy(null, JOB_SEARCH_PARTICIPANT_COPY),
      "text",
    );

    expect(
      withoutDefaults(
        { intro: shown, completion },
        description,
        "text",
        JOB_SEARCH_PARTICIPANT_COPY,
      ),
    ).toBeNull();
  });

  it("still treats voice wording as the baseline for the voice link", () => {
    expect(
      withoutDefaults(
        {
          intro: { facts: DEFAULT_INTRO_FACTS },
          completion: { message: defaultCompletionMessage("voice") },
        },
        description,
      ),
    ).toBeNull();
    // Text wording is not the voice link's default, so it is kept there.
    expect(withoutDefaults({ intro: { facts: DEFAULT_TEXT_INTRO_FACTS } }, description)).toEqual({
      intro: { facts: DEFAULT_TEXT_INTRO_FACTS },
    });
  });
});
