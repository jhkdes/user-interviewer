import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "../fake-llm-provider";

describe("FakeLLMProvider", () => {
  it("returns scripted interviewer turns in order and records calls", async () => {
    const fake = new FakeLLMProvider();
    fake.scriptInterviewerTurns([
      { utterance: "First", shouldEndInterview: false },
      { utterance: "Second", shouldEndInterview: true },
    ]);

    const input = { systemPrompt: "p", conversationHistory: [] };
    const first = await fake.generateInterviewerTurn(input);
    const second = await fake.generateInterviewerTurn(input);

    expect(first.utterance).toBe("First");
    expect(second.utterance).toBe("Second");
    expect(fake.calls.generateInterviewerTurn).toEqual([input, input]);
  });

  it("throws a clear error when the interviewer turn queue runs out", async () => {
    const fake = new FakeLLMProvider();
    await expect(
      fake.generateInterviewerTurn({ systemPrompt: "p", conversationHistory: [] }),
    ).rejects.toThrow(/no scripted interviewer turn left/);
  });

  it("returns the scripted summary and records the call", async () => {
    const fake = new FakeLLMProvider();
    const summary = { painPoints: ["p"], notableQuotes: ["q"], takeaways: ["t"] };
    fake.scriptSummary(summary);

    const input = { transcript: [] };
    expect(await fake.generateSummary(input)).toEqual(summary);
    expect(fake.calls.generateSummary).toEqual([input]);
  });

  it("throws a clear error when no summary is scripted", async () => {
    const fake = new FakeLLMProvider();
    await expect(fake.generateSummary({ transcript: [] })).rejects.toThrow(/no scripted summary/);
  });

  it("returns the scripted study report and records the call", async () => {
    const fake = new FakeLLMProvider();
    const report = { themes: [{ theme: "t", participantCount: 1, representativeQuotes: [] }] };
    fake.scriptStudyReport(report);

    const input = { interviews: [] };
    expect(await fake.generateStudyReport(input)).toEqual(report);
    expect(fake.calls.generateStudyReport).toEqual([input]);
  });

  it("throws a clear error when no study report is scripted", async () => {
    const fake = new FakeLLMProvider();
    await expect(fake.generateStudyReport({ interviews: [] })).rejects.toThrow(
      /no scripted study report/,
    );
  });
});
