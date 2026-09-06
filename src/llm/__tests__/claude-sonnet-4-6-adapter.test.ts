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
    expect(call.model).toBe("claude-sonnet-5");
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

describe("ClaudeSonnet46Adapter.generateInterviewerTurnStreaming", () => {
  async function drain(gen: AsyncGenerator<unknown, void, unknown>) {
    const events: unknown[] = [];
    for await (const event of gen) events.push(event);
    return events;
  }

  /** Builds a fake `MessageStream`: async-iterable over `partialJsonChunks` as `input_json_delta` events, `finalMessage()` resolves to a tool_use block with `toolInput`. */
  function makeToolCallStream(partialJsonChunks: string[], toolInput: Record<string, unknown>) {
    const finalMessage = {
      content: [{ type: "tool_use", name: "speak_and_decide", input: toolInput }],
      usage: {},
    } as unknown as Anthropic.Message;
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const partial_json of partialJsonChunks) {
          yield { type: "content_block_delta", delta: { type: "input_json_delta", partial_json } };
        }
      },
      finalMessage: vi.fn().mockResolvedValue(finalMessage),
    };
  }

  it("yields text-delta events decoded from the forced tool call's streamed JSON, then a done event from the fully-parsed input", async () => {
    const stream = makeToolCallStream(
      ['{"utterance": "Tell', ' me more.", "shouldEndInterview": false, "participantRequestedEnd": false}'],
      { utterance: "Tell me more.", shouldEndInterview: false, participantRequestedEnd: false },
    );
    const streamFn = vi.fn().mockReturnValue(stream);
    const client = { messages: { stream: streamFn } } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    const events = await drain(
      adapter.generateInterviewerTurnStreaming({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    );

    expect(events).toEqual([
      { type: "text-delta", text: "Tell" },
      { type: "text-delta", text: " me more." },
      {
        type: "done",
        utterance: "Tell me more.",
        shouldEndInterview: false,
        participantRequestedEnd: false,
      },
    ]);

    const call = streamFn.mock.calls[0][0];
    expect(call.tools).toEqual([expect.objectContaining({ name: "speak_and_decide" })]);
    expect(call.tool_choice).toEqual({ type: "tool", name: "speak_and_decide" });
    expect(call.output_config).toBeUndefined();
  });

  it("defaults both decision flags to false when the parsed tool input omits them", async () => {
    const stream = makeToolCallStream(['{"utterance": "Just text."}'], { utterance: "Just text." });
    const client = { messages: { stream: vi.fn().mockReturnValue(stream) } } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    const events = await drain(
      adapter.generateInterviewerTurnStreaming({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    );

    expect(events.at(-1)).toEqual({
      type: "done",
      utterance: "Just text.",
      shouldEndInterview: false,
      participantRequestedEnd: false,
    });
  });

  it("wraps errors from finalMessage() with a clear message", async () => {
    const stream = {
      [Symbol.asyncIterator]: async function* () {},
      finalMessage: vi.fn().mockRejectedValue(new Error("stream broke")),
    };
    const client = { messages: { stream: vi.fn().mockReturnValue(stream) } } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    await expect(
      drain(
        adapter.generateInterviewerTurnStreaming({
          systemPrompt: "prompt",
          conversationHistory: [{ speaker: "participant", text: "Hello" }],
        }),
      ),
    ).rejects.toThrow("Failed to generate interviewer turn (streaming)");
  });

  it("silently retries a turn whose utterance field decoded to nothing and succeeds on the retry", async () => {
    const emptyStream = makeToolCallStream(['{"utterance": "", "shouldEndInterview": false, "participantRequestedEnd": false}'], {
      utterance: "",
      shouldEndInterview: false,
      participantRequestedEnd: false,
    });
    const spokenStream = makeToolCallStream(['{"utterance": "Sorry, could you say that again?", "shouldEndInterview": false, "participantRequestedEnd": false}'], {
      utterance: "Sorry, could you say that again?",
      shouldEndInterview: false,
      participantRequestedEnd: false,
    });
    const streamFn = vi.fn().mockReturnValueOnce(emptyStream).mockReturnValueOnce(spokenStream);
    const client = { messages: { stream: streamFn } } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    const events = await drain(
      adapter.generateInterviewerTurnStreaming({
        systemPrompt: "prompt",
        conversationHistory: [{ speaker: "participant", text: "Hello" }],
      }),
    );

    // No trace of the empty attempt reaches the caller — only the retry's events.
    expect(events).toEqual([
      { type: "text-delta", text: "Sorry, could you say that again?" },
      {
        type: "done",
        utterance: "Sorry, could you say that again?",
        shouldEndInterview: false,
        participantRequestedEnd: false,
      },
    ]);
    expect(streamFn).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error if every attempt's utterance field decodes to nothing", async () => {
    const emptyStream = makeToolCallStream(['{"utterance": "", "shouldEndInterview": true, "participantRequestedEnd": false}'], {
      utterance: "",
      shouldEndInterview: true,
      participantRequestedEnd: false,
    });
    const client = {
      messages: { stream: vi.fn().mockReturnValue(emptyStream) },
    } as unknown as Anthropic;
    const adapter = new ClaudeSonnet46Adapter(client);

    await expect(
      drain(
        adapter.generateInterviewerTurnStreaming({
          systemPrompt: "prompt",
          conversationHistory: [{ speaker: "participant", text: "Hello" }],
        }),
      ),
    ).rejects.toThrow(/produced no spoken text after 2 attempts/);
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
