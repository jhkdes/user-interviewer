import { describe, expect, it } from "vitest";
import type { Study, StudyReport } from "@/domain";
import { renderStudyReportMarkdown } from "../render-study-report-markdown";

const study: Study = {
  id: "study-1",
  type: "discovery",
  title: "Engineering Manager",
  description: "how engineering managers keep delivery on track",
  preInterviewQuestions: [],
  feedbackQuestions: [],
  researchTopic: null,
  customPrompt: null,
  reportPipeline: null,
  linkToken: "token-1",
  status: "open",
  voiceProvider: "vapi",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  closedAt: null,
  linkExtendedAt: null,
};

const report: StudyReport = {
  id: "report-1",
  studyId: "study-1",
  version: 2,
  type: "discovery",
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
  whatWorkedWell: [],
  whatCouldBeImproved: [],
  topicsForFuture: [],
  otherInsights: [],
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

  it("renders a feedback-type report's four named sections instead of themes, omitting empty ones", () => {
    const feedbackStudy: Study = { ...study, type: "feedback" };
    const feedbackReport: StudyReport = {
      ...report,
      type: "feedback",
      themes: [],
      whatWorkedWell: [
        {
          theme: "The live Q&A format",
          participantCount: 3,
          representativeQuotes: ["Loved being able to ask questions in real time."],
        },
      ],
      whatCouldBeImproved: [
        { theme: "Audio cut out occasionally", participantCount: 2, representativeQuotes: [] },
      ],
      topicsForFuture: [],
      otherInsights: [],
    };

    const markdown = renderStudyReportMarkdown(feedbackStudy, feedbackReport);

    expect(markdown).toBe(
      `# Engineering Manager — Study Report

Version 2 · generated 2026-08-27T12:00:00.000Z

## What worked well

### The live Q&A format

3 participants

> Loved being able to ask questions in real time.

## What could be improved

### Audio cut out occasionally

2 participants
`,
    );
    expect(markdown).not.toContain("Topics for future sessions");
    expect(markdown).not.toContain("Other insights");
  });
});
