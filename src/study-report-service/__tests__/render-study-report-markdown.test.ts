import { describe, expect, it } from "vitest";
import type { Study, StudyReport } from "@/domain";
import { renderStudyReportMarkdown } from "../render-study-report-markdown";

const study: Study = {
  id: "study-1",
  targetProfile: {
    industry: "SaaS",
    yearsOfExperience: "5+",
    jobTitle: "Engineering Manager",
    seniority: "Manager",
    responsibility: "Team delivery",
  },
  researchTopic: null,
  customPrompt: null,
  linkToken: "token-1",
  status: "open",
  voiceProvider: "vapi",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  closedAt: null,
};

const report: StudyReport = {
  id: "report-1",
  studyId: "study-1",
  version: 2,
  generatedAt: new Date("2026-08-27T12:00:00.000Z"),
  themes: [
    {
      theme: "Manual status reporting is a major time sink",
      participantCount: 2,
      representativeQuotes: [
        "I basically have a second job just making slides.",
        "I redo the same deck every Friday.",
      ],
    },
    {
      theme: "No one trusts the dashboard numbers",
      participantCount: 1,
      representativeQuotes: [],
    },
  ],
};

describe("renderStudyReportMarkdown", () => {
  it("renders the study title, version/timestamp, and each theme as a heading with quotes as blockquotes", () => {
    const markdown = renderStudyReportMarkdown(study, report);

    expect(markdown).toBe(
      `# Engineering Manager — Study Report

Version 2 · generated 2026-08-27T12:00:00.000Z

## Manual status reporting is a major time sink

2 participants

> I basically have a second job just making slides.

> I redo the same deck every Friday.

## No one trusts the dashboard numbers

1 participant
`,
    );
  });
});
