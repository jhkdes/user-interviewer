import { describe, expect, it } from "vitest";
import { buildStreamingCompletionBody } from "../openai-response";

describe("buildStreamingCompletionBody", () => {
  it("emits an SSE body with a content chunk, a finish chunk, and a terminating [DONE]", () => {
    const body = buildStreamingCompletionBody("Tell me more about that.", "gpt-4o");
    const dataLines = body
      .split("\n\n")
      .filter(Boolean)
      .map((line) => line.replace(/^data: /, ""));

    expect(dataLines).toHaveLength(3);
    expect(dataLines[2]).toBe("[DONE]");

    const contentChunk = JSON.parse(dataLines[0]);
    expect(contentChunk.object).toBe("chat.completion.chunk");
    expect(contentChunk.model).toBe("gpt-4o");
    expect(contentChunk.choices[0].delta).toEqual({
      role: "assistant",
      content: "Tell me more about that.",
    });
    expect(contentChunk.choices[0].finish_reason).toBeNull();

    const finalChunk = JSON.parse(dataLines[1]);
    expect(finalChunk.choices[0].finish_reason).toBe("stop");
    expect(finalChunk.choices[0].delta).toEqual({});
    // Both chunks belong to the same completion.
    expect(finalChunk.id).toBe(contentChunk.id);
  });
});
