import { describe, expect, it } from "vitest";
import { FakeLLMProvider, type InterviewTurn } from "@/llm";
import { InterviewAgent } from "../interview-agent";
import { HARD_CAP_MS, MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END } from "../termination";

const context = {
  participantFirstName: "Jordan",
  participantRoleDescription: "Engineering manager",
  targetProfile: {
    industry: "Fintech",
    yearsOfExperience: "5-10 years",
    jobTitle: "Product Manager",
    seniority: "Senior",
    responsibility: "Owns the payments roadmap",
  },
};

const START = new Date("2026-01-01T00:00:00.000Z");

describe("InterviewAgent.generateNextTurn", () => {
  it("passes a Mom Test system prompt built from the context to the LLM adapter", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Hi Jordan", shouldEndInterview: false }]);
    const agent = new InterviewAgent(llm);

    await agent.generateNextTurn({
      context,
      conversationHistory: [],
      interviewStartedAt: START,
      now: START,
    });

    const call = llm.calls.generateInterviewerTurn[0];
    expect(call.systemPrompt).toContain("Jordan");
    expect(call.systemPrompt).toContain("Fintech");
    expect(call.conversationHistory).toEqual([]);
  });

  it("returns the LLM's utterance and keeps the interview going when nothing terminates it", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Tell me more", shouldEndInterview: false }]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "Hello" }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
    });

    expect(result).toEqual({
      utterance: "Tell me more",
      isInterviewOver: false,
      terminationReason: null,
    });
  });

  it("does not end the interview on a premature LLM self-assessment before minimum depth", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Great, thanks!", shouldEndInterview: true }]);
    const agent = new InterviewAgent(llm);

    const shallowHistory: InterviewTurn[] = [{ speaker: "participant", text: "It's fine I guess" }];

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: shallowHistory,
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
    });

    expect(result.isInterviewOver).toBe(false);
    expect(result.terminationReason).toBeNull();
  });

  it("ends the interview once the LLM self-assesses after sufficient depth", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "That's really helpful, thank you!", shouldEndInterview: true },
    ]);
    const agent = new InterviewAgent(llm);

    const deepHistory: InterviewTurn[] = Array.from(
      { length: MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END },
      (_, i) => ({ speaker: "participant" as const, text: `Detail ${i + 1}` }),
    );

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: deepHistory,
      interviewStartedAt: START,
      now: new Date(START.getTime() + 5 * 60_000),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("llm-self-assessed");
  });

  it("ends the interview at the hard time cap even if the LLM wants to continue", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "One more question...", shouldEndInterview: false }]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "Still going" }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + HARD_CAP_MS),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("time-cap");
    // Still returns the LLM's utterance for this final turn rather than a canned line.
    expect(result.utterance).toBe("One more question...");
  });

  it("drives a realistic multi-turn conversation: keeps probing, then terminates on depth", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "What does your day-to-day look like?", shouldEndInterview: false },
      { utterance: "Tell me more about that spreadsheet process.", shouldEndInterview: false },
      { utterance: "How often does that happen?", shouldEndInterview: false },
      { utterance: "What do you do when it goes wrong?", shouldEndInterview: false },
      { utterance: "That's really useful context, thank you!", shouldEndInterview: true },
    ]);
    const agent = new InterviewAgent(llm);

    const history: InterviewTurn[] = [];
    const participantReplies = [
      "I manage a platform team.",
      "We copy data between two spreadsheets every morning.",
      "Every single day, it takes about an hour.",
      "We just redo it manually and hope we don't make mistakes.",
    ];

    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await agent.generateNextTurn({
        context,
        conversationHistory: history,
        interviewStartedAt: START,
        now: new Date(START.getTime() + i * 60_000),
      });

      // Earlier turns must not end the interview — still building depth.
      if (i < 4) {
        expect(lastResult.isInterviewOver).toBe(false);
      }

      history.push({ speaker: "interviewer", text: lastResult.utterance });
      if (i < participantReplies.length) {
        history.push({ speaker: "participant", text: participantReplies[i] });
      }
    }

    expect(lastResult?.isInterviewOver).toBe(true);
    expect(lastResult?.terminationReason).toBe("llm-self-assessed");

    // Each call saw the conversation as it stood *before* that turn, growing each time.
    const historyLengthsSeen = llm.calls.generateInterviewerTurn.map(
      (c) => c.conversationHistory.length,
    );
    expect(historyLengthsSeen).toEqual([0, 2, 4, 6, 8]);
  });
});
