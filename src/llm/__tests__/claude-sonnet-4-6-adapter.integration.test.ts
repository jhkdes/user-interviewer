import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeSonnet46Adapter } from "../claude-sonnet-4-6-adapter";
import { hasAnthropicTestEnv } from "./test-env";

describe.skipIf(!hasAnthropicTestEnv)("ClaudeSonnet46Adapter (integration)", () => {
  const adapter = new ClaudeSonnet46Adapter(new Anthropic());

  it("generateInterviewerTurn returns a real structured response for the opening turn", async () => {
    const result = await adapter.generateInterviewerTurn({
      systemPrompt:
        "You are a calm, curious product research interviewer. Greet the participant briefly and ask an open-ended question about their day-to-day role. Keep it to one or two sentences.",
      conversationHistory: [],
    });

    expect(typeof result.utterance).toBe("string");
    expect(result.utterance.length).toBeGreaterThan(0);
    expect(typeof result.shouldEndInterview).toBe("boolean");
  }, 20000);

  it("generateInterviewerTurn continues a conversation with history", async () => {
    const result = await adapter.generateInterviewerTurn({
      systemPrompt:
        "You are a calm, curious product research interviewer using Mom Test-style probing. Never suggest solutions.",
      conversationHistory: [
        { speaker: "interviewer", text: "What does a typical Tuesday look like for you?" },
        {
          speaker: "participant",
          text: "I spend most of the morning manually copying data between two spreadsheets, it's really tedious.",
        },
      ],
    });

    expect(result.utterance.length).toBeGreaterThan(0);
    expect(typeof result.shouldEndInterview).toBe("boolean");
  }, 20000);

  it("generateSummary returns structured pain points, quotes, and takeaways", async () => {
    const result = await adapter.generateSummary({
      transcript: [
        { speaker: "interviewer", text: "Walk me through your morning routine at work." },
        {
          speaker: "participant",
          text: "Every morning I manually copy sales numbers from our CRM into a spreadsheet. It takes about an hour and I make mistakes sometimes, which is really frustrating.",
        },
      ],
    });

    expect(Array.isArray(result.painPoints)).toBe(true);
    expect(result.painPoints.length).toBeGreaterThan(0);
    expect(Array.isArray(result.notableQuotes)).toBe(true);
    expect(Array.isArray(result.takeaways)).toBe(true);
    expect(result.roleDescription === null || typeof result.roleDescription === "string").toBe(
      true,
    );
  }, 20000);

  it("generateStudyReport returns a themes array shaped per the schema", async () => {
    const result = await adapter.generateStudyReport({
      interviews: [
        {
          interviewId: "fixture-interview-1",
          transcript: [
            {
              speaker: "participant",
              text: "I manually reconcile invoices every week, it's a huge time sink.",
            },
          ],
          summary: {
            painPoints: ["Manual invoice reconciliation takes hours every week"],
            notableQuotes: ["it's a huge time sink"],
            takeaways: ["Strong automation candidate"],
          },
        },
      ],
    });

    expect(Array.isArray(result.themes)).toBe(true);
    for (const theme of result.themes) {
      expect(typeof theme.theme).toBe("string");
      expect(typeof theme.participantCount).toBe("number");
      expect(Array.isArray(theme.representativeQuotes)).toBe(true);
    }
  }, 20000);
});
