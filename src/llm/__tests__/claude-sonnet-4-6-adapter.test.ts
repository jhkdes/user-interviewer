import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ClaudeSonnet46Adapter } from "../claude-sonnet-4-6-adapter";
import { interviewerTurnSchema, studyReportSchema, summarySchema } from "../schemas";

function textResponse(json: unknown): Anthropic.Message {
  return {
    content: [{ type: "text", text: JSON.stringify(json) }],
  } as Anthropic.Message;
}

function makeMockClient(response: Anthropic.Message) {
  return {
    messages: { create: vi.fn().mockResolvedValue(response) },
  } as unknown as Anthropic;
}

describe("ClaudeSonnet46Adapter.generateInterviewerTurn", () => {
  it("sends the system prompt with a cache_control breakpoint", async () => {
    const client = makeMockClient(textResponse({ utterance: "Hi", shouldEndInterview: false }));
    const adapter = new ClaudeSonnet46Adapter(client);

    await adapter.generateInterviewerTurn({
      systemPrompt: "You are an interviewer.",
      conversationHistory: [{ speaker: "participant", text: "Hello" }],
    });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.system).toEqual([
      { type: "text", text: "You are an interviewer.", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("requests structured output with the interviewer turn schema at low effort", async () => {
    const client = makeMockClient(textResponse({ utterance: "Hi", shouldEndInterview: false }));
    const adapter = new ClaudeSonnet46Adapter(client);

    await adapter.generateInterviewerTurn({
      systemPrompt: "prompt",
      conversationHistory: [{ speaker: "participant", text: "Hello" }],
    });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    expect(call.output_config).toEqual({
      format: { type: "json_schema", schema: interviewerTurnSchema },
      effort: "low",
    });
  });

  it("puts a cache_control breakpoint on the last message and maps speakers to roles", async () => {
    const client = makeMockClient(textResponse({ utterance: "Hi", shouldEndInterview: false }));
    const adapter = new ClaudeSonnet46Adapter(client);

    await adapter.generateInterviewerTurn({
      systemPrompt: "prompt",
      conversationHistory: [
        { speaker: "participant", text: "Hello" },
        { speaker: "interviewer", text: "Tell me more" },
        { speaker: "participant", text: "Sure, so..." },
      ],
    });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Tell me more" },
      {
        role: "user",
        content: [{ type: "text", text: "Sure, so...", cache_control: { type: "ephemeral" } }],
      },
    ]);
  });

  it("prepends a synthetic user turn when history is empty (first call of the interview)", async () => {
    const client = makeMockClient(
      textResponse({ utterance: "Hi there", shouldEndInterview: false }),
    );
    const adapter = new ClaudeSonnet46Adapter(client);

    await adapter.generateInterviewerTurn({ systemPrompt: "prompt", conversationHistory: [] });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    expect(call.messages).toHaveLength(1);
    expect((call.messages as Anthropic.MessageParam[])[0].role).toBe("user");
  });

  it("prepends a synthetic user turn when history starts with the interviewer", async () => {
    const client = makeMockClient(
      textResponse({ utterance: "Hi there", shouldEndInterview: false }),
    );
    const adapter = new ClaudeSonnet46Adapter(client);

    await adapter.generateInterviewerTurn({
      systemPrompt: "prompt",
      conversationHistory: [{ speaker: "interviewer", text: "Welcome!" }],
    });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    const messages = call.messages as Anthropic.MessageParam[];
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("returns the parsed structured output", async () => {
    const client = makeMockClient(
      textResponse({ utterance: "Tell me more", shouldEndInterview: true }),
    );
    const adapter = new ClaudeSonnet46Adapter(client);

    const result = await adapter.generateInterviewerTurn({
      systemPrompt: "prompt",
      conversationHistory: [{ speaker: "participant", text: "Hello" }],
    });

    expect(result).toEqual({ utterance: "Tell me more", shouldEndInterview: true });
  });

  it("wraps API errors with a clear message", async () => {
    const client = {
      messages: { create: vi.fn().mockRejectedValue(new Error("network down")) },
    } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    await expect(
      adapter.generateInterviewerTurn({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    ).rejects.toThrow("Failed to generate interviewer turn");
  });

  it("throws a clear error when the response has no text block", async () => {
    const client = makeMockClient({ content: [] } as unknown as Anthropic.Message);
    const adapter = new ClaudeSonnet46Adapter(client);

    await expect(
      adapter.generateInterviewerTurn({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    ).rejects.toThrow(/no text block/);
  });

  it("throws a clear error when the response text isn't valid JSON", async () => {
    const client = makeMockClient({
      content: [{ type: "text", text: "not json" }],
    } as unknown as Anthropic.Message);
    const adapter = new ClaudeSonnet46Adapter(client);

    await expect(
      adapter.generateInterviewerTurn({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    ).rejects.toThrow(/failed to parse/i);
  });

  it("retries once and returns the retry's result when the first utterance is a degenerate placeholder", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(textResponse({ utterance: "...", shouldEndInterview: false }))
      .mockResolvedValueOnce(
        textResponse({
          utterance: "Sorry about that, could you say more?",
          shouldEndInterview: false,
        }),
      );
    const client = { messages: { create } } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    const result = await adapter.generateInterviewerTurn({
      systemPrompt: "prompt",
      conversationHistory: [{ speaker: "participant", text: "Hello" }],
    });

    expect(result.utterance).toBe("Sorry about that, could you say more?");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("treats blank/whitespace-only utterances as non-substantive too", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(textResponse({ utterance: "   ", shouldEndInterview: false }))
      .mockResolvedValueOnce(
        textResponse({ utterance: "Let's continue.", shouldEndInterview: false }),
      );
    const client = { messages: { create } } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    const result = await adapter.generateInterviewerTurn({
      systemPrompt: "prompt",
      conversationHistory: [{ speaker: "participant", text: "Hello" }],
    });

    expect(result.utterance).toBe("Let's continue.");
  });

  it("throws a clear error if every attempt returns a non-substantive utterance", async () => {
    const client = makeMockClient(textResponse({ utterance: "...", shouldEndInterview: false }));
    const adapter = new ClaudeSonnet46Adapter(client);

    await expect(
      adapter.generateInterviewerTurn({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    ).rejects.toThrow(/non-substantive utterance after 2 attempts/);
  });
});

describe("ClaudeSonnet46Adapter.generateSummary", () => {
  it("sends the transcript and requests the summary schema", async () => {
    const client = makeMockClient(
      textResponse({
        painPoints: ["p1"],
        notableQuotes: ["q1"],
        takeaways: ["t1"],
        roleDescription: "Engineering manager",
      }),
    );
    const adapter = new ClaudeSonnet46Adapter(client);

    const result = await adapter.generateSummary({
      transcript: [
        { speaker: "interviewer", text: "How do you handle X?" },
        { speaker: "participant", text: "It's painful." },
      ],
    });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    expect(call.output_config).toEqual({ format: { type: "json_schema", schema: summarySchema } });
    expect(call.messages).toEqual([
      {
        role: "user",
        content:
          "Interview transcript:\n\nInterviewer: How do you handle X?\nParticipant: It's painful.",
      },
    ]);
    expect(result).toEqual({
      painPoints: ["p1"],
      notableQuotes: ["q1"],
      takeaways: ["t1"],
      roleDescription: "Engineering manager",
    });
  });
});

describe("ClaudeSonnet46Adapter.generateStudyReport", () => {
  it("sends each interview's summary and transcript and requests the study report schema", async () => {
    const client = makeMockClient(
      textResponse({
        themes: [{ theme: "Manual reporting", participantCount: 2, representativeQuotes: ["ugh"] }],
      }),
    );
    const adapter = new ClaudeSonnet46Adapter(client);

    const result = await adapter.generateStudyReport({
      interviews: [
        {
          interviewId: "interview-1",
          transcript: [{ speaker: "participant", text: "It's painful." }],
          summary: { painPoints: ["manual work"], notableQuotes: ["ugh"], takeaways: ["automate"] },
        },
      ],
    });

    const call = vi.mocked(client.messages.create).mock.calls[0][0];
    expect(call.output_config).toEqual({
      format: { type: "json_schema", schema: studyReportSchema },
    });
    expect(call.messages[0].content).toContain("interview-1");
    expect(call.messages[0].content).toContain("manual work");
    expect(result.themes[0].theme).toBe("Manual reporting");
  });
});
