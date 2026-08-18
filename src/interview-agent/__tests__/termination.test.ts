import { describe, expect, it } from "vitest";
import type { InterviewTurn } from "@/llm";
import {
  checkTermination,
  HARD_CAP_MS,
  MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END,
} from "../termination";

const START = new Date("2026-01-01T00:00:00.000Z");

function participantTurns(count: number): InterviewTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    speaker: "participant" as const,
    text: `Turn ${i + 1}`,
  }));
}

describe("checkTermination", () => {
  it("returns null when nothing triggers termination", () => {
    const result = checkTermination({
      conversationHistory: participantTurns(2),
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
      llmSuggestsEnd: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when the LLM suggests ending but the minimum depth hasn't been reached", () => {
    const result = checkTermination({
      conversationHistory: participantTurns(MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END - 1),
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
      llmSuggestsEnd: true,
    });
    expect(result).toBeNull();
  });

  it("returns 'llm-self-assessed' once minimum depth is reached and the LLM suggests ending", () => {
    const result = checkTermination({
      conversationHistory: participantTurns(MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END),
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
      llmSuggestsEnd: true,
    });
    expect(result).toBe("llm-self-assessed");
  });

  it("ignores interviewer turns when counting depth", () => {
    const history: InterviewTurn[] = [
      { speaker: "interviewer", text: "..." },
      { speaker: "interviewer", text: "..." },
      { speaker: "interviewer", text: "..." },
      { speaker: "interviewer", text: "..." },
      { speaker: "interviewer", text: "..." },
      ...participantTurns(1),
    ];
    const result = checkTermination({
      conversationHistory: history,
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
      llmSuggestsEnd: true,
    });
    expect(result).toBeNull();
  });

  it("returns 'time-cap' once the hard cap has elapsed, regardless of the LLM's signal", () => {
    const result = checkTermination({
      conversationHistory: participantTurns(1),
      interviewStartedAt: START,
      now: new Date(START.getTime() + HARD_CAP_MS),
      llmSuggestsEnd: false,
    });
    expect(result).toBe("time-cap");
  });

  it("prioritizes 'time-cap' over 'llm-self-assessed' when both conditions hold", () => {
    const result = checkTermination({
      conversationHistory: participantTurns(MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END),
      interviewStartedAt: START,
      now: new Date(START.getTime() + HARD_CAP_MS + 1000),
      llmSuggestsEnd: true,
    });
    expect(result).toBe("time-cap");
  });

  it("does not trigger the hard cap just under the threshold", () => {
    const result = checkTermination({
      conversationHistory: participantTurns(1),
      interviewStartedAt: START,
      now: new Date(START.getTime() + HARD_CAP_MS - 1000),
      llmSuggestsEnd: false,
    });
    expect(result).toBeNull();
  });
});
