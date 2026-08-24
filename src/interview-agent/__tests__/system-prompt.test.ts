import { describe, expect, it } from "vitest";
import { buildInterviewSystemPrompt } from "../system-prompt";

const context = {
  participantFirstName: "Jordan",
  participantRoleDescription: null,
  targetProfile: {
    industry: "Fintech",
    yearsOfExperience: "5-10 years",
    jobTitle: "Product Manager",
    seniority: "Senior",
    responsibility: "Owns the payments roadmap",
  },
};

describe("buildInterviewSystemPrompt", () => {
  it("includes the participant's name", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toContain("Jordan");
  });

  it("instructs opening the interview by asking about role and day-to-day responsibilities (M13 — no longer pre-collected at intake)", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(/open by asking .*role and day-to-day responsibilities/i);
    expect(prompt).toMatch(/always your first question/i);
  });

  it("includes the study's target profile fields", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toContain("Fintech");
    expect(prompt).toContain("5-10 years");
    expect(prompt).toContain("Product Manager");
    expect(prompt).toContain("Senior");
    expect(prompt).toContain("Owns the payments roadmap");
  });

  it("instructs Mom Test-style behavior: no pitching, no leading questions", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(/never pitch/i);
    expect(prompt).toMatch(/leading questions/i);
  });

  it("instructs the broad-to-narrow depth heuristic", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(/one or two follow-up layers deep/i);
    expect(prompt).toMatch(/surface-level complaint/i);
  });

  it("instructs a neutral, conversational tone with brief turns", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(/neutral, curious, conversational/i);
    expect(prompt).toMatch(/no long monologues/i);
  });

  it("builds correctly when participantRoleDescription is null", () => {
    expect(() => buildInterviewSystemPrompt(context)).not.toThrow();
  });

  it("is a pure function of its input — same context produces the same prompt", () => {
    expect(buildInterviewSystemPrompt(context)).toBe(buildInterviewSystemPrompt(context));
  });
});
