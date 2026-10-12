import { describe, expect, it } from "vitest";
import { JOB_SEARCH_PARTICIPANT_COPY } from "@/job-search-study/participant-copy";
import {
  DEFAULT_COMPLETION_TITLE,
  DEFAULT_CONSENT_NOTE,
  DEFAULT_INTRO_FACTS,
  DEFAULT_INTRO_STEPS,
  LIMITS,
  defaultCompletionMessage,
  defaultTagline,
  resolveCompletionCopy,
  resolveIntroCopy,
  validateParticipantCopy,
  withoutDefaults,
} from "../index";

describe("the default wording", () => {
  it("is exactly what every study showed before custom copy existed", () => {
    expect(defaultTagline("how you work")).toBe("A 15-minute AI-run interview about how you work.");
    expect(defaultTagline("")).toBe("A 15-minute AI-run interview about your day-to-day work.");
    expect(DEFAULT_INTRO_FACTS).toEqual([
      "~15 minutes",
      "Voice, not text",
      "No login",
      "Confidential",
    ]);
    expect(DEFAULT_INTRO_STEPS.map((step) => step.title)).toEqual([
      "Click the link",
      "Talk with an AI",
      "Speak freely",
      "Get something back",
    ]);
    expect(DEFAULT_INTRO_STEPS[3].body).toBe(
      "Your own summary now, the full report once it's done.",
    );
    expect(DEFAULT_CONSENT_NOTE).toBe(
      "The call is recorded (audio and transcript) so we can review it afterward. Starting means you're okay with that.",
    );
    expect(DEFAULT_COMPLETION_TITLE).toBe("Thank you, you're done!");
    expect(defaultCompletionMessage("voice")).toContain("taking the time to talk with us");
    expect(defaultCompletionMessage("text")).toContain("taking the time to chat with us");
    expect(defaultCompletionMessage()).toContain("We'll follow up by email with what we learn");
  });
});

describe("resolving a study's copy", () => {
  it("uses the defaults when the study has no custom copy", () => {
    for (const none of [null, undefined, {}, { intro: {}, completion: {} }]) {
      expect(resolveIntroCopy(none, "how you work")).toEqual({
        tagline: defaultTagline("how you work"),
        facts: DEFAULT_INTRO_FACTS,
        steps: DEFAULT_INTRO_STEPS,
        consentNote: DEFAULT_CONSENT_NOTE,
      });
      expect(resolveCompletionCopy(none)).toEqual({
        title: DEFAULT_COMPLETION_TITLE,
        message: defaultCompletionMessage("voice"),
      });
    }
  });

  it("uses custom text where there is some and the default for the rest", () => {
    const intro = resolveIntroCopy({ intro: { tagline: "  Get a free report.  " } }, "x");
    expect(intro.tagline).toBe("Get a free report.");
    expect(intro.facts).toEqual(DEFAULT_INTRO_FACTS);
    expect(intro.steps).toEqual(DEFAULT_INTRO_STEPS);

    const completion = resolveCompletionCopy({ completion: { message: "See you soon." } }, "text");
    expect(completion).toEqual({ title: DEFAULT_COMPLETION_TITLE, message: "See you soon." });
  });
});

describe("validateParticipantCopy", () => {
  it("accepts null and copy with nothing in it as 'use the defaults'", () => {
    expect(validateParticipantCopy(null)).toEqual({ valid: true, value: null });
    expect(validateParticipantCopy(undefined)).toEqual({ valid: true, value: null });
    expect(validateParticipantCopy({})).toEqual({ valid: true, value: null });
    expect(
      validateParticipantCopy({
        intro: { tagline: "  ", facts: ["", " "] },
        completion: { title: "" },
      }),
    ).toEqual({ valid: true, value: null });
  });

  it("trims text and drops empty entries", () => {
    const result = validateParticipantCopy({
      intro: {
        tagline: "  Hello  ",
        facts: [" ~15 minutes ", "", "Free report"],
        steps: [
          { title: " One ", body: " First. " },
          { title: "", body: "" },
        ],
        consentNote: " We record. ",
      },
      completion: { title: " Thanks ", message: " Bye " },
    });

    expect(result).toEqual({
      valid: true,
      value: {
        intro: {
          tagline: "Hello",
          facts: ["~15 minutes", "Free report"],
          steps: [{ title: "One", body: "First." }],
          consentNote: "We record.",
        },
        completion: { title: "Thanks", message: "Bye" },
      },
    });
  });

  it("reports what is wrong", () => {
    const tooLong = "x".repeat(LIMITS.tagline + 1);
    const result = validateParticipantCopy({
      intro: {
        tagline: tooLong,
        facts: Array.from({ length: LIMITS.maxFacts + 1 }, (_, i) => `Fact ${i}`),
        steps: [{ title: "Only a title", body: "" }, 5],
      },
      completion: { message: 7 },
    });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    const text = result.errors.join("\n");
    expect(text).toMatch(/tagline is longer than 300/);
    expect(text).toMatch(/at most 6 facts/);
    expect(text).toMatch(/step 1 needs both a title and text/);
    expect(text).toMatch(/step 2 must be an object/);
    expect(text).toMatch(/ending message must be text/);
  });

  it("rejects input that is not an object", () => {
    expect(validateParticipantCopy("hello")).toEqual({
      valid: false,
      errors: ["copy must be an object"],
    });
    expect(validateParticipantCopy([1]).valid).toBe(false);
  });

  it("limits the number of steps", () => {
    const steps = Array.from({ length: LIMITS.maxSteps + 1 }, (_, i) => ({
      title: `T${i}`,
      body: "b",
    }));

    const result = validateParticipantCopy({ intro: { steps } });

    expect(result.valid).toBe(false);
  });
});

describe("withoutDefaults", () => {
  const description = "how you search";

  it("drops everything that equals the default, so the study keeps following the defaults", () => {
    const allDefaults = {
      intro: {
        tagline: defaultTagline(description),
        facts: DEFAULT_INTRO_FACTS,
        steps: DEFAULT_INTRO_STEPS,
        consentNote: DEFAULT_CONSENT_NOTE,
      },
      completion: { title: DEFAULT_COMPLETION_TITLE, message: defaultCompletionMessage("voice") },
    };

    expect(withoutDefaults(allDefaults, description)).toBeNull();
  });

  it("keeps only what was changed", () => {
    const result = withoutDefaults(
      {
        intro: {
          tagline: defaultTagline(description),
          facts: ["Free report"],
          consentNote: DEFAULT_CONSENT_NOTE,
        },
        completion: { title: "Thanks!", message: defaultCompletionMessage("voice") },
      },
      description,
    );

    expect(result).toEqual({ intro: { facts: ["Free report"] }, completion: { title: "Thanks!" } });
  });
});

describe("the job-search wording", () => {
  it("passes validation unchanged", () => {
    expect(validateParticipantCopy(JOB_SEARCH_PARTICIPANT_COPY)).toEqual({
      valid: true,
      value: JOB_SEARCH_PARTICIPANT_COPY,
    });
  });

  it("leads with the free report and states when it arrives, who sends it, and what it depends on", () => {
    const intro = resolveIntroCopy(JOB_SEARCH_PARTICIPANT_COPY, "x");
    const completion = resolveCompletionCopy(JOB_SEARCH_PARTICIPANT_COPY);

    expect(intro.tagline).toMatch(/free personalized job search report/);
    expect(intro.facts).toContain("Free personalized report");
    const lastStep = intro.steps.at(-1)!;
    for (const text of [lastStep.body, completion.message]) {
      expect(text).toMatch(/within a day/i);
      expect(text).toMatch(/jkim@discoverfirst\.co/);
      expect(text).toMatch(/spam folder/);
      expect(text).toMatch(/completed interview|whole conversation/);
    }
    // The consent wording is deliberately left at the default for now.
    expect(JOB_SEARCH_PARTICIPANT_COPY.intro?.consentNote).toBeUndefined();
  });
});
