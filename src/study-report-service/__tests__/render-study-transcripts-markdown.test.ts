import { describe, expect, it } from "vitest";
import type { Interview, PreInterviewQuestion, Study } from "@/domain";
import { renderStudyTranscriptsMarkdown } from "../render-study-transcripts-markdown";

const preInterviewQuestions: PreInterviewQuestion[] = [
  { id: "level", label: "What's your current role?", type: "single", options: ["PM", "EM"] },
];

const discoveryStudy: Study = {
  id: "study-1",
  type: "discovery",
  title: "How AI Actually Shows Up in a PM's Day",
  description: "how product managers really use AI at work",
  preInterviewQuestions,
  feedbackQuestions: [],
  researchTopic: "where AI tools get abandoned after the first try",
  customPrompt: null,
  linkToken: "token-1",
  status: "open",
  voiceProvider: "vapi",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  closedAt: null,
  linkExtendedAt: null,
};

function makeInterview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: "interview-1",
    studyId: "study-1",
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: null,
    status: "completed",
    consentGivenAt: new Date(),
    transcript: [
      { speaker: "interviewer", text: "Tell me about your day.", timestampMs: 0 },
      { speaker: "participant", text: "Buried in status reports.", timestampMs: 65_000 },
    ],
    recordingUrl: null,
    vapiCallId: null,
    voiceProvider: "vapi",
    elevenLabsConversationId: null,
    createdAt: new Date("2026-08-02T00:00:00Z"),
    startedAt: null,
    completedAt: null,
    summaryEmailSentAt: null,
    deviceType: null,
    endedReason: null,
    backgroundedAt: null,
    screenerAnswers: null,
    timeCheckAskedAt: null,
    extensionGranted: null,
    secondTimeCheckAskedAt: null,
    openFloorAskedAt: null,
    trackingId: null,
    redactedTranscript: null,
    redactedAt: null,
    mode: "voice",
    lastActivityAt: null,
    idleNudgeSentAt: null,
    switchedToTextAt: null,
    ...overrides,
  };
}

describe("renderStudyTranscriptsMarkdown", () => {
  it("renders the study title, description, and research focus at the top", () => {
    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [makeInterview()]);

    expect(markdown).toContain("# How AI Actually Shows Up in a PM's Day\n");
    expect(markdown).toContain("how product managers really use AI at work");
    expect(markdown).toContain("## Study questions");
    expect(markdown).toContain("Research focus: where AI tools get abandoned after the first try");
  });

  it("renders a feedback-type study's feedbackQuestions as a bullet list instead of a research focus", () => {
    const feedbackStudy: Study = {
      ...discoveryStudy,
      type: "feedback",
      researchTopic: null,
      feedbackQuestions: ["What did you think of the content?", "Would you recommend this?"],
    };

    const markdown = renderStudyTranscriptsMarkdown(feedbackStudy, [makeInterview()]);

    expect(markdown).toContain("## Study questions");
    expect(markdown).toContain("- What did you think of the content?");
    expect(markdown).toContain("- Would you recommend this?");
    expect(markdown).not.toContain("Research focus");
  });

  it("labels each participant section with their name and role, and formats timestamps per line", () => {
    const interview = makeInterview({ firstName: "Sam", roleDescription: "Engineering manager" });

    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [interview]);

    expect(markdown).toContain("## Participant 1: Sam — Engineering manager");
    expect(markdown).toContain("### Transcript");
    expect(markdown).toContain("[0:00] Interviewer: Tell me about your day.");
    expect(markdown).toContain("[1:05] Sam: Buried in status reports.");
  });

  it("omits the role suffix when roleDescription is null", () => {
    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [makeInterview()]);
    expect(markdown).toContain("## Participant 1: Jordan\n");
  });

  it("includes resolved pre-interview questionnaire answers when present", () => {
    const interview = makeInterview({
      screenerAnswers: { level: "Senior Product Manager" },
    });

    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [interview]);

    expect(markdown).toContain("### Pre-interview questionnaire");
    expect(markdown).toContain("- **What's your current role?**: Senior Product Manager");
  });

  it("omits the questionnaire section entirely when there are no answers", () => {
    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [makeInterview()]);
    expect(markdown).not.toContain("Pre-interview questionnaire");
  });

  it("never includes a summary section", () => {
    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [makeInterview()]);
    expect(markdown).not.toMatch(/## Summary/i);
    expect(markdown).not.toMatch(/pain point/i);
  });

  it("orders multiple participants by createdAt ascending and numbers them sequentially", () => {
    const first = makeInterview({
      id: "i1",
      firstName: "Alex",
      createdAt: new Date("2026-08-03T00:00:00Z"),
    });
    const second = makeInterview({
      id: "i2",
      firstName: "Priya",
      createdAt: new Date("2026-08-02T00:00:00Z"),
    });

    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [first, second]);

    expect(markdown.indexOf("Participant 1: Priya")).toBeLessThan(
      markdown.indexOf("Participant 2: Alex"),
    );
  });

  describe("typed interviews", () => {
    const typedTranscript = [
      { speaker: "interviewer" as const, text: "Hi Sam, what stood out?", timestampMs: 2_000 },
      { speaker: "participant" as const, text: "The live demo.", timestampMs: 71_000 },
    ];

    it("includes a typed interview's transcript with its timestamps, and says it was typed", () => {
      const typed = makeInterview({
        firstName: "Sam",
        mode: "text",
        transcript: typedTranscript,
      });

      const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [typed]);

      expect(markdown).toContain("## Participant 1: Sam");
      expect(markdown).toContain("_Interview mode: typed (written chat), not voice._");
      expect(markdown).toContain("[0:02] Interviewer: Hi Sam, what stood out?");
      expect(markdown).toContain("[1:11] Sam: The live demo.");
    });

    it("leaves voice interviews' output exactly as before, with no mode line", () => {
      const voice = makeInterview({ firstName: "Alex" });

      const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [voice]);

      expect(markdown).not.toContain("Interview mode");
      expect(markdown).not.toContain("typed");
    });

    it("labels only the typed interview in a study that mixes voice and typed", () => {
      const voice = makeInterview({
        id: "i1",
        firstName: "Alex",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      });
      const typed = makeInterview({
        id: "i2",
        firstName: "Sam",
        mode: "text",
        transcript: typedTranscript,
        createdAt: new Date("2026-08-02T00:00:00Z"),
      });

      const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [typed, voice]);

      expect(markdown.match(/Interview mode: typed/g)).toHaveLength(1);
      expect(markdown.indexOf("Alex")).toBeLessThan(markdown.indexOf("Interview mode: typed"));
      expect(markdown.indexOf("Interview mode: typed")).toBeLessThan(
        markdown.indexOf("## Participant 2: Sam") + 100,
      );
    });

    it("leaves out a typed interview still in progress, which has no transcript yet", () => {
      const inProgress = makeInterview({
        firstName: "Sam",
        mode: "text",
        status: "in-progress",
        transcript: null,
      });

      const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [inProgress]);

      expect(markdown).not.toContain("Sam");
      expect(markdown).toContain("No interviews with a transcript yet.");
    });
  });

  it("skips interviews with no transcript", () => {
    const withTranscript = makeInterview({ id: "i1", firstName: "Alex" });
    const withoutTranscript = makeInterview({
      id: "i2",
      firstName: "NoTranscript",
      transcript: null,
    });

    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [
      withTranscript,
      withoutTranscript,
    ]);

    expect(markdown).toContain("Alex");
    expect(markdown).not.toContain("NoTranscript");
  });

  it("skips interviews with an empty transcript array", () => {
    const empty = makeInterview({ transcript: [] });
    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, [empty]);
    expect(markdown).not.toContain("Participant 1");
  });

  it("notes when no interviews have a transcript yet", () => {
    const markdown = renderStudyTranscriptsMarkdown(discoveryStudy, []);
    expect(markdown).toContain("No interviews with a transcript yet.");
  });
});
