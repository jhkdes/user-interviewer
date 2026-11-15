import { describe, expect, it } from "vitest";
import { buildFeedbackSystemPrompt } from "@/interview-agent/feedback-system-prompt";
import { RESPONSE_CONTRACT, TEXT_RESPONSE_CONTRACT } from "@/interview-agent/shared-prompt-parts";
import { interviewerTurnSchema } from "@/llm/schemas";

/**
 * UI promises PFA that the interviewer's end-of-interview signal is named
 * `shouldEndInterview` and that the response contract UI appends to a partner's
 * prompt names it too (spec section 10, "End-of-interview signal"). PFA's prompt
 * may refer to it by that name. If you rename it, this test fails on purpose:
 * tell PFA first, keep the old name working for a while, then change the names
 * here and in the spec.
 */
const SIGNAL = "shouldEndInterview";
const LEAVE_SIGNAL = "participantRequestedEnd";

describe("the end-of-interview signal named in the partner spec", () => {
  it("is a required field of the interviewer's structured output", () => {
    expect(Object.keys(interviewerTurnSchema.properties)).toContain(SIGNAL);
    expect(interviewerTurnSchema.required).toContain(SIGNAL);
    expect(Object.keys(interviewerTurnSchema.properties)).toContain(LEAVE_SIGNAL);
    expect(interviewerTurnSchema.required).toContain(LEAVE_SIGNAL);
  });

  it("is named in both response contracts UI appends", () => {
    for (const contract of [RESPONSE_CONTRACT, TEXT_RESPONSE_CONTRACT]) {
      expect(contract).toContain(SIGNAL);
      expect(contract).toContain(LEAVE_SIGNAL);
    }
  });

  it.each(["voice", "text"] as const)(
    "is named at the end of a partner prompt on the %s channel",
    (channel) => {
      const prompt = buildFeedbackSystemPrompt({
        participantFirstName: "Sam",
        studyTitle: "Check-in",
        studyDescription: "a check-in",
        feedbackQuestions: [],
        customPrompt: "You are interviewing about a colleague.",
        isClosingTurn: false,
        channel,
      } as Parameters<typeof buildFeedbackSystemPrompt>[0]);
      expect(prompt).toContain("You are interviewing about a colleague.");
      expect(prompt).toContain(SIGNAL);
      expect(prompt).toContain(LEAVE_SIGNAL);
    },
  );
});
