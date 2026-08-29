import { describe, expect, it } from "vitest";
import { buildInterviewSystemPrompt, INTERVIEWER_NAME } from "../system-prompt";
import { HARD_CAP_MINUTES } from "../termination";

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
  researchTopic: null,
  customPrompt: null,
  screenerAnswers: null,
  timeRunningLow: false,
};

describe("buildInterviewSystemPrompt", () => {
  it("includes the participant's name", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toContain("Jordan");
  });

  it("instructs opening the interview by asking about role and day-to-day responsibilities (M13 — no longer pre-collected at intake)", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(/role and day-to-day responsibilities/i);
    expect(prompt).toMatch(/always your first substantive question/i);
  });

  it("instructs the interviewer to introduce itself by name before the first question (#1)", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toContain(INTERVIEWER_NAME);
    expect(prompt).toMatch(/introduc(e|ing) yourself as/i);
  });

  it("instructs a warm-up-only opening turn, waiting for a reply before introducing itself or previewing the topic/count", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(/warm-up only/i);
    expect(prompt).toMatch(/stop and wait for their actual reply/i);
    expect(prompt).toMatch(
      /do not introduce yourself, mention the study, or ask anything substantive in this same turn/i,
    );
    expect(prompt).toMatch(/roughly how many things you'll cover/i);
  });

  it("instructs explicitly stating the interview will take about the hard-cap duration", () => {
    const prompt = buildInterviewSystemPrompt(context);
    expect(prompt).toMatch(new RegExp(`mention it'll take about ${HARD_CAP_MINUTES} minutes`, "i"));
    expect(prompt).toMatch(/the .*-minute figure should always be stated/i);
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

  it("includes the research topic and steering language when set", () => {
    const prompt = buildInterviewSystemPrompt({
      ...context,
      researchTopic: "How AI actually shows up in a PM's day",
    });

    expect(prompt).toContain("How AI actually shows up in a PM's day");
    expect(prompt).toMatch(/research focus/i);
    expect(prompt).toMatch(/top-priority thread/i);
  });

  it("still instructs opening broadly before drilling into the research topic", () => {
    const prompt = buildInterviewSystemPrompt({
      ...context,
      researchTopic: "How AI actually shows up in a PM's day",
    });

    expect(prompt).toMatch(/open(s|ing)? broadly/i);
  });

  it("instructs proactively asking about the research focus if it hasn't surfaced naturally", () => {
    const prompt = buildInterviewSystemPrompt({
      ...context,
      researchTopic: "How AI actually shows up in a PM's day",
    });

    expect(prompt).toMatch(/proactively ask/i);
    expect(prompt).toMatch(/hasn't come up naturally/i);
  });

  it("instructs exploring the research focus from multiple angles and not ending on a surface mention", () => {
    const prompt = buildInterviewSystemPrompt({
      ...context,
      researchTopic: "How AI actually shows up in a PM's day",
    });

    expect(prompt).toMatch(/multiple angles/i);
    expect(prompt).toMatch(/single surface mention.*not enough/i);
  });

  it("requires depth on the research focus specifically before allowing the interview to end", () => {
    const prompt = buildInterviewSystemPrompt({
      ...context,
      researchTopic: "How AI actually shows up in a PM's day",
    });

    expect(prompt).toMatch(/real depth specifically on the research focus/i);
  });

  it("tells the interviewer to steer back to the research focus rather than follow tangents", () => {
    const prompt = buildInterviewSystemPrompt({
      ...context,
      researchTopic: "How AI actually shows up in a PM's day",
    });

    expect(prompt).toMatch(/steer back to the research focus/i);
  });

  it("produces the exact same prompt as no-topic context when researchTopic is null", () => {
    expect(buildInterviewSystemPrompt({ ...context, researchTopic: null })).toBe(
      buildInterviewSystemPrompt(context),
    );
    expect(buildInterviewSystemPrompt(context)).not.toMatch(/research focus/i);
  });

  describe("screener context", () => {
    const screenerAnswers = {
      level: "Senior Product Manager",
      aiToolsUsed: ["ChatGPT", "Claude"],
    };

    it("appends a section listing screener answers when present", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, screenerAnswers });

      expect(prompt).toMatch(/What we already know about this participant/i);
      expect(prompt).toMatch(/don't re-ask these/i);
      expect(prompt).toContain("- level: Senior Product Manager");
      expect(prompt).toContain("- aiToolsUsed: ChatGPT, Claude");
    });

    it("appends nothing when there are no screener answers", () => {
      expect(buildInterviewSystemPrompt(context)).not.toMatch(
        /What we already know about this participant/i,
      );
    });

    it("also appends the screener section for a customPrompt-driven study", () => {
      const prompt = buildInterviewSystemPrompt({
        ...context,
        customPrompt: "You are talking with {{participant_name}}.",
        screenerAnswers,
      });

      expect(prompt).toMatch(/What we already know about this participant/i);
      expect(prompt).toContain("- level: Senior Product Manager");
    });

    it.each(["Yes, regularly", "Yes, occasionally"])(
      "instructs distinguishing work vs. side-project AI usage, work first, when sideAiProject is %s",
      (sideAiProject) => {
        const prompt = buildInterviewSystemPrompt({
          ...context,
          screenerAnswers: { ...screenerAnswers, sideAiProject },
        });

        expect(prompt).toMatch(/keep work AI usage and side-project AI usage clearly distinct/i);
        expect(prompt).toMatch(/steer toward their \*\*work\*\* AI usage first/i);
      },
    );

    it.each(["No, but I'd like to", "No, not interested"])(
      "does not add side-project guidance when sideAiProject is %s",
      (sideAiProject) => {
        const prompt = buildInterviewSystemPrompt({
          ...context,
          screenerAnswers: { ...screenerAnswers, sideAiProject },
        });

        expect(prompt).not.toMatch(/side-project AI usage/i);
      },
    );

    it("does not add side-project guidance when sideAiProject wasn't answered", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, screenerAnswers });

      expect(prompt).not.toMatch(/side-project AI usage/i);
    });
  });

  describe("time check", () => {
    it("appends nothing when time isn't running low", () => {
      expect(buildInterviewSystemPrompt({ ...context, timeRunningLow: false })).not.toMatch(
        /Time check/i,
      );
    });

    it("instructs reacting to the already-asked check-in rather than asking it again itself", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, timeRunningLow: true });

      expect(prompt).toMatch(/## Time check/);
      expect(prompt).toMatch(/you've already asked the participant/i);
      expect(prompt).toMatch(/do not ask that again/i);
      expect(prompt).toMatch(
        /if they said they can keep going, ask at most one more focused question/i,
      );
      expect(prompt).toMatch(/if they said they can't.*close immediately instead/i);
    });

    it("is positioned first in the prompt, not appended at the end", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, timeRunningLow: true });

      expect(prompt.indexOf("## Time check")).toBe(0);
      expect(prompt.indexOf("## Time check")).toBeLessThan(prompt.indexOf("## Structure"));
    });

    it("instructs a closing-statement-only turn once they do wrap up, never mixed with a new question, and requires setting shouldEndInterview", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, timeRunningLow: true });

      expect(prompt).toMatch(/that turn's utterance must be a closing statement only/i);
      expect(prompt).toMatch(/never mixed with a new question/i);
      expect(prompt).toMatch(/you must set shouldEndInterview to true on that same turn/i);
    });

    it("also appends the time-check section for a customPrompt-driven study", () => {
      const prompt = buildInterviewSystemPrompt({
        ...context,
        customPrompt: "You are talking with {{participant_name}}.",
        timeRunningLow: true,
      });

      expect(prompt).toMatch(/## Time check/);
    });
  });

  describe("with a custom prompt", () => {
    const customPrompt =
      "You are talking with {{participant_name}}, who described their role as: {{participant_role}}. Focus on how AI shows up in their day.";

    it("interpolates {{participant_name}} and {{participant_role}}", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, customPrompt });

      expect(prompt).toContain("You are talking with Jordan");
      expect(prompt).toContain("described their role as: Product Manager");
      expect(prompt).not.toContain("{{participant_name}}");
      expect(prompt).not.toContain("{{participant_role}}");
    });

    it("appends the response contract but not the generated template", () => {
      const prompt = buildInterviewSystemPrompt({ ...context, customPrompt });

      expect(prompt).toMatch(/## Every response/);
      expect(prompt).toMatch(/honest assessment of whether the interview should end/i);
      expect(prompt).not.toMatch(/## Structure/);
      expect(prompt).not.toMatch(/## Who you're talking to/);
      expect(prompt).not.toMatch(/Mom Test-aligned/);
    });

    it("ignores researchTopic entirely when customPrompt is also set", () => {
      const prompt = buildInterviewSystemPrompt({
        ...context,
        researchTopic: "How AI actually shows up in a PM's day",
        customPrompt,
      });

      expect(prompt).not.toMatch(/research focus/i);
      expect(prompt).not.toContain("How AI actually shows up in a PM's day");
    });

    it("is a pure function of its input", () => {
      const input = { ...context, customPrompt };
      expect(buildInterviewSystemPrompt(input)).toBe(buildInterviewSystemPrompt(input));
    });
  });
});
