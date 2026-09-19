import { describe, expect, it } from "vitest";
import type { Interview, PreInterviewQuestion, Study } from "@/domain";
import { resolveScreenerAnswers } from "../resolve-screener-answers";

const preInterviewQuestions: PreInterviewQuestion[] = [
  { id: "level", label: "What's your current role?", type: "single", options: ["PM", "EM"] },
  {
    id: "aiToolsUsed",
    label: "Which AI tools do you use?",
    type: "multi",
    options: ["ChatGPT", "Claude"],
  },
];

const baseStudy: Study = {
  id: "study-1",
  type: "discovery",
  title: "How AI Actually Shows Up in a PM's Day",
  description: "how product managers really use AI at work",
  preInterviewQuestions,
  feedbackQuestions: [],
  researchTopic: null,
  customPrompt: null,
  linkToken: "token",
  status: "open",
  voiceProvider: "vapi",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  closedAt: null,
  linkExtendedAt: null,
};

const baseInterview: Interview = {
  id: "interview-1",
  studyId: "study-1",
  firstName: "Jae",
  email: "jae@example.com",
  roleDescription: null,
  status: "completed",
  consentGivenAt: new Date(),
  transcript: null,
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
};

describe("resolveScreenerAnswers", () => {
  it("resolves each answer's question id to its label text", () => {
    const interview = {
      ...baseInterview,
      screenerAnswers: { level: "Senior Product Manager" },
    };

    expect(resolveScreenerAnswers(baseStudy, interview)).toEqual([
      { label: "What's your current role?", answer: "Senior Product Manager" },
    ]);
  });

  it("joins multi-select array answers with a comma", () => {
    const interview = {
      ...baseInterview,
      screenerAnswers: { aiToolsUsed: ["ChatGPT", "Claude", "Other: an internal tool"] },
    };

    expect(resolveScreenerAnswers(baseStudy, interview)).toEqual([
      { label: "Which AI tools do you use?", answer: "ChatGPT, Claude, Other: an internal tool" },
    ]);
  });

  it("falls back to the raw key as the label when the question no longer exists on the study", () => {
    const interview = {
      ...baseInterview,
      screenerAnswers: { yearsInRole: "3-5" },
    };

    expect(resolveScreenerAnswers(baseStudy, interview)).toEqual([
      { label: "yearsInRole", answer: "3-5" },
    ]);
  });

  it("returns an empty array when screenerAnswers is null", () => {
    expect(resolveScreenerAnswers(baseStudy, baseInterview)).toEqual([]);
  });

  it("returns an empty array for a feedback-type study, which never has screenerAnswers or preInterviewQuestions", () => {
    const feedbackStudy: Study = { ...baseStudy, type: "feedback", preInterviewQuestions: [] };
    expect(resolveScreenerAnswers(feedbackStudy, baseInterview)).toEqual([]);
  });

  it("resolves multiple answers in the order they appear", () => {
    const interview = {
      ...baseInterview,
      screenerAnswers: {
        level: "Senior Product Manager",
        aiToolsUsed: ["ChatGPT"],
      },
    };

    expect(resolveScreenerAnswers(baseStudy, interview)).toEqual([
      { label: "What's your current role?", answer: "Senior Product Manager" },
      { label: "Which AI tools do you use?", answer: "ChatGPT" },
    ]);
  });
});
