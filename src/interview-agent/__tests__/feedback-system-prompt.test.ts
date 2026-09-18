import { describe, expect, it } from "vitest";
import { buildFeedbackSystemPrompt } from "../feedback-system-prompt";
import { FEEDBACK_TARGET_MINUTES } from "../termination";

const context = {
  participantFirstName: "Sam",
  studyTitle: "Post-webinar feedback",
  studyDescription: "quick check-in after today's session",
  feedbackQuestions: [
    "What did you think of the content and pacing?",
    "Would you recommend this session to a colleague?",
  ],
  customPrompt: null,
  isClosingTurn: false,
};

describe("buildFeedbackSystemPrompt", () => {
  it("includes the participant's name, study title, and description", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toContain("Sam");
    expect(prompt).toContain("Post-webinar feedback");
    expect(prompt).toContain("quick check-in after today's session");
  });

  it("mentions the target duration", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(new RegExp(`${FEEDBACK_TARGET_MINUTES} minutes`));
  });

  it("lists every feedback question as a priority to cover", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toContain("What did you think of the content and pacing?");
    expect(prompt).toContain("Would you recommend this session to a colleague?");
  });

  it("instructs splitting a bundled/double-barreled question into separate ones", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/split it into two separate questions/i);
  });

  it("instructs concrete-before-abstract phrasing", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/specific moment or memory/i);
  });

  it("instructs experience-before-judgment ordering", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/ask what happened before asking for a verdict/i);
  });

  it("instructs neutral, non-leading phrasing", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/never phrase a question in a way that hints at the answer/i);
  });

  it("instructs balancing what worked and what didn't", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/both what worked and what didn't/i);
  });

  it("instructs a guaranteed open-ended closing question before wrapping up", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/one final open-ended question before closing/i);
    expect(prompt).toMatch(/do not set shouldEndInterview to true until this final question/i);
  });

  it("does not include Discovery-only concepts (Mom Test, pain points)", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).not.toMatch(/mom test/i);
    expect(prompt).not.toMatch(/pain point/i);
  });

  it("appends the shared response contract", () => {
    const prompt = buildFeedbackSystemPrompt(context);
    expect(prompt).toMatch(/## Every response/);
  });

  it("is a pure function of its input", () => {
    expect(buildFeedbackSystemPrompt(context)).toBe(buildFeedbackSystemPrompt(context));
  });

  describe("closing turn", () => {
    it("appends nothing closing-specific when not the closing turn", () => {
      expect(buildFeedbackSystemPrompt(context)).not.toMatch(/## Closing/);
    });

    it("instructs a brief closing statement only, never another question, on the closing turn", () => {
      const prompt = buildFeedbackSystemPrompt({ ...context, isClosingTurn: true });

      expect(prompt).toMatch(/## Closing/);
      expect(prompt).toMatch(/do not ask another question/i);
      expect(prompt).toMatch(/system appends its own official closing line/i);
    });

    it("is positioned first in the prompt, not appended at the end", () => {
      const prompt = buildFeedbackSystemPrompt({ ...context, isClosingTurn: true });
      expect(prompt.indexOf("## Closing")).toBe(0);
    });
  });

  describe("with a custom prompt", () => {
    const customPrompt = "You are talking with {{participant_name}} about today's webinar.";

    it("interpolates {{participant_name}}", () => {
      const prompt = buildFeedbackSystemPrompt({ ...context, customPrompt });
      expect(prompt).toContain("You are talking with Sam about today's webinar.");
    });

    it("fully replaces the generated template, including the question-technique guidance", () => {
      const prompt = buildFeedbackSystemPrompt({ ...context, customPrompt });

      expect(prompt).toMatch(/## Every response/);
      expect(prompt).not.toMatch(/## Priorities to cover/);
      expect(prompt).not.toMatch(/split it into two separate questions/i);
      expect(prompt).not.toContain("What did you think of the content and pacing?");
    });

    it("still applies the closing-turn guidance ahead of the custom prompt", () => {
      const prompt = buildFeedbackSystemPrompt({ ...context, customPrompt, isClosingTurn: true });
      expect(prompt.indexOf("## Closing")).toBe(0);
    });

    it("is a pure function of its input", () => {
      const input = { ...context, customPrompt };
      expect(buildFeedbackSystemPrompt(input)).toBe(buildFeedbackSystemPrompt(input));
    });
  });
});
