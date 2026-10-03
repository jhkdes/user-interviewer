import { describe, expect, it } from "vitest";
import { messagesToOpenAI } from "../messages-to-openai";

describe("messagesToOpenAI", () => {
  it("maps interviewer to assistant and participant to user, in order", () => {
    expect(
      messagesToOpenAI([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello." },
        { speaker: "interviewer", text: "What stood out?" },
      ]),
    ).toEqual([
      { role: "assistant", content: "Hi Sam!" },
      { role: "user", content: "Hello." },
      { role: "assistant", content: "What stood out?" },
    ]);
  });

  it("returns an empty list for no messages", () => {
    expect(messagesToOpenAI([])).toEqual([]);
  });
});
