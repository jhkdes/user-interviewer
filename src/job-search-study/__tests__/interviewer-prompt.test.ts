import { describe, expect, it } from "vitest";
import { extractInterviewerPrompt, loadJobSearchInterviewerPrompt } from "../interviewer-prompt";

describe("extractInterviewerPrompt", () => {
  it("returns only the text between the markers", () => {
    const markdown = [
      "# Title",
      "team notes before",
      "## PROMPT START",
      "You are Riley.",
      "",
      "## Goal",
      "Learn things.",
      "## PROMPT END",
      "team notes after",
    ].join("\n");

    expect(extractInterviewerPrompt(markdown)).toBe("You are Riley.\n\n## Goal\nLearn things.");
  });

  it("throws when a marker is missing", () => {
    expect(() => extractInterviewerPrompt("no markers here")).toThrow(/PROMPT START/);
  });

  it("throws when the end marker comes before the start marker", () => {
    expect(() => extractInterviewerPrompt("## PROMPT END\n## PROMPT START")).toThrow();
  });
});

describe("loadJobSearchInterviewerPrompt", () => {
  const prompt = loadJobSearchInterviewerPrompt();

  it("keeps the participant name placeholder the app interpolates", () => {
    expect(prompt).toContain("{{participant_name}}");
  });

  it("does not leak the team notes into the prompt", () => {
    expect(prompt).not.toContain("Notes for the team");
    expect(prompt).not.toContain("PROMPT END");
  });

  it("asks how they found the role and how old the posting was, but not for alerts or sources the screener covers", () => {
    expect(prompt).toContain("how old the posting was");
    expect(prompt).toContain("about how long had it been posted when you applied");
    expect(prompt).toContain("alerts or saved searches");
  });

  it("includes the closing and time-check guidance", () => {
    expect(prompt).toContain("If the system checks the time");
    expect(prompt).toContain("one part of your job search");
  });
});
