import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "@/llm";
import { draftPreInterviewQuestions } from "../draft-pre-interview-questions";

describe("draftPreInterviewQuestions", () => {
  it("assigns a unique id to each drafted question and preserves the rest", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptDraftPreInterviewQuestions({
      questions: [
        {
          label: "What's your current role?",
          type: "single",
          options: ["Controller", "Assistant Controller"],
          allowOther: true,
        },
        {
          label: "How many years in the role?",
          type: "single",
          options: ["<1", "1-3", "3+"],
          allowOther: false,
        },
      ],
    });

    const questions = await draftPreInterviewQuestions(
      { llm },
      { title: "How Controllers Keep Financial Clean", description: "reconciliation challenges" },
    );

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      label: "What's your current role?",
      type: "single",
      options: ["Controller", "Assistant Controller"],
      allowOther: true,
    });
    expect(questions[0].id).toBeTruthy();
    expect(questions[1].id).toBeTruthy();
    expect(questions[0].id).not.toBe(questions[1].id);
  });

  it("passes the title and description through to the LLM adapter", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptDraftPreInterviewQuestions({ questions: [] });

    await draftPreInterviewQuestions(
      { llm },
      { title: "How Controllers Keep Financial Clean", description: "reconciliation challenges" },
    );

    expect(llm.calls.draftPreInterviewQuestions[0]).toEqual({
      title: "How Controllers Keep Financial Clean",
      description: "reconciliation challenges",
    });
  });

  it("returns an empty array when the LLM drafts no questions", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptDraftPreInterviewQuestions({ questions: [] });

    const questions = await draftPreInterviewQuestions(
      { llm },
      { title: "Title", description: "description" },
    );

    expect(questions).toEqual([]);
  });
});
