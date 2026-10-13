import { describe, expect, it } from "vitest";
import {
  createOneQuestionLimiter,
  limitToOneQuestion,
  oneQuestionPerTurnEnabled,
} from "../one-question";

describe("limitToOneQuestion", () => {
  it("cuts a turn after its first question", () => {
    expect(
      limitToOneQuestion(
        "Got it. What is your job target? And have you asked your network what you are good at?",
      ),
    ).toBe("Got it. What is your job target?");
  });

  it("keeps a turn that asks one question, including text before it", () => {
    const turn = "Thanks, about fifteen of twenty. Roughly how long did that take you?";
    expect(limitToOneQuestion(turn)).toBe(turn);
  });

  it("leaves a turn with no question, like an opening statement or the closing thank-you, alone", () => {
    const closing = "That was very helpful, and your answers will be used to build your report.";
    expect(limitToOneQuestion(closing)).toBe(closing);
    expect(limitToOneQuestion("")).toBe("");
  });

  it("keeps closing punctuation that belongs to the question, and drops what follows", () => {
    expect(limitToOneQuestion('Did they say "what is next?" Then what happened?')).toBe(
      'Did they say "what is next?"',
    );
    expect(limitToOneQuestion("Really?! Tell me more. What else?")).toBe("Really?!");
    expect(limitToOneQuestion("Is that on purpose (or not decided)? Skip if you like.")).toBe(
      "Is that on purpose (or not decided)?",
    );
  });

  it("keeps an either/or about the same thing as one question", () => {
    const turn = "Is that open on purpose, or not decided yet?";
    expect(limitToOneQuestion(turn)).toBe(turn);
  });
});

describe("createOneQuestionLimiter", () => {
  const speakAll = (pieces: string[]) => {
    const limiter = createOneQuestionLimiter();
    return pieces.map((piece) => limiter.push(piece));
  };

  it("passes pieces through until the first question ends, then drops the rest", () => {
    expect(
      speakAll(["Got it. What ", "is your target", "? And have you ", "asked anyone?"]),
    ).toEqual(["Got it. What ", "is your target", "?", ""]);
  });

  it("cuts inside a piece that holds the question mark", () => {
    expect(speakAll(["What is your target? Also, ", "who did you ask?"])).toEqual([
      "What is your target?",
      "",
    ]);
  });

  it("passes everything through when there is no question", () => {
    expect(speakAll(["I'm Riley. ", "Thanks for ", "your time."])).toEqual([
      "I'm Riley. ",
      "Thanks for ",
      "your time.",
    ]);
  });

  it("gives the same text as limitToOneQuestion", () => {
    const text = "Understood. What role did AI play? What did you decide yourself?";
    const joined = speakAll(text.match(/.{1,7}/g)!).join("");
    expect(joined).toBe(limitToOneQuestion(text));
  });

  it("starts fresh for each reply", () => {
    const first = createOneQuestionLimiter();
    first.push("One? Two?");
    expect(createOneQuestionLimiter().push("Next question?")).toBe("Next question?");
  });
});

describe("oneQuestionPerTurnEnabled", () => {
  it("is on unless turned off", () => {
    expect(oneQuestionPerTurnEnabled({})).toBe(true);
    expect(oneQuestionPerTurnEnabled({ ONE_QUESTION_PER_TURN: "" })).toBe(true);
    expect(oneQuestionPerTurnEnabled({ ONE_QUESTION_PER_TURN: "true" })).toBe(true);
    for (const off of ["false", "FALSE", " 0 ", "no", "off"]) {
      expect(oneQuestionPerTurnEnabled({ ONE_QUESTION_PER_TURN: off }), off).toBe(false);
    }
  });
});
