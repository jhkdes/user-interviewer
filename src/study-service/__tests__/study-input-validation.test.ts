import { describe, expect, it } from "vitest";
import { validateStudyInput } from "../study-input-validation";

const validInput = {
  title: "How Controllers Keep Financial Clean",
  description: "challenges in keeping financial statements clean and reconciled",
  preInterviewQuestions: [
    {
      id: "role",
      label: "What's your current role?",
      type: "single" as const,
      options: ["Controller", "Assistant Controller"],
    },
  ],
};

describe("validateStudyInput", () => {
  it("is valid for a well-formed input", () => {
    expect(validateStudyInput(validInput)).toEqual({ valid: true, errors: [] });
  });

  it("is valid with no pre-interview questions", () => {
    expect(validateStudyInput({ ...validInput, preInterviewQuestions: [] })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("requires a title", () => {
    const result = validateStudyInput({ ...validInput, title: "  " });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("title is required");
  });

  it("requires a description", () => {
    const result = validateStudyInput({ ...validInput, description: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("description is required");
  });

  it("requires each question to have a label", () => {
    const result = validateStudyInput({
      ...validInput,
      preInterviewQuestions: [{ ...validInput.preInterviewQuestions[0], label: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("question 1: label is required");
  });

  it("requires each question to have at least 2 options", () => {
    const result = validateStudyInput({
      ...validInput,
      preInterviewQuestions: [{ ...validInput.preInterviewQuestions[0], options: ["Only one"] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("question 1: at least 2 options are required");
  });

  it("reports errors for multiple invalid questions with 1-based indices", () => {
    const result = validateStudyInput({
      ...validInput,
      preInterviewQuestions: [
        { ...validInput.preInterviewQuestions[0], label: "" },
        { ...validInput.preInterviewQuestions[0], options: [] },
      ],
    });
    expect(result.errors).toContain("question 1: label is required");
    expect(result.errors).toContain("question 2: at least 2 options are required");
  });

  describe("feedback-type input", () => {
    const validFeedbackInput = {
      type: "feedback" as const,
      title: "Post-webinar feedback",
      description: "quick check-in after today's session",
      preInterviewQuestions: [],
      feedbackQuestions: ["What did you think of the content?"],
    };

    it("is valid for a well-formed feedback-type input", () => {
      expect(validateStudyInput(validFeedbackInput)).toEqual({ valid: true, errors: [] });
    });

    it("requires at least one feedback question", () => {
      const result = validateStudyInput({ ...validFeedbackInput, feedbackQuestions: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("at least one feedback question is required");
    });

    it("rejects a blank feedback question", () => {
      const result = validateStudyInput({
        ...validFeedbackInput,
        feedbackQuestions: ["  "],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("feedback question 1: text is required");
    });

    it("ignores preInterviewQuestions content for feedback-type input", () => {
      const result = validateStudyInput({
        ...validFeedbackInput,
        preInterviewQuestions: [{ id: "x", label: "", type: "single", options: [] }],
      });
      expect(result.valid).toBe(true);
    });
  });
});
