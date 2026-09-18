import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "@/llm";
import { FeedbackAgent, OPEN_FLOOR_UTTERANCE } from "../feedback-agent";
import { FEEDBACK_HARD_CAP_MS } from "../termination";

const context = {
  participantFirstName: "Sam",
  studyTitle: "Post-webinar feedback",
  studyDescription: "quick check-in after today's session",
  feedbackQuestions: ["What did you think of the content?"],
  customPrompt: null,
};

const START = new Date("2026-01-01T00:00:00.000Z");

describe("FeedbackAgent.generateNextTurn", () => {
  it("passes a feedback system prompt built from the context to the LLM adapter", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Hi Sam", shouldEndInterview: false }]);
    const agent = new FeedbackAgent(llm);

    await agent.generateNextTurn({
      context,
      conversationHistory: [],
      interviewStartedAt: START,
      now: START,
    });

    const call = llm.calls.generateInterviewerTurn[0];
    expect(call.systemPrompt).toContain("Sam");
    expect(call.systemPrompt).toContain("What did you think of the content?");
    expect(call.conversationHistory).toEqual([]);
  });

  it("returns the LLM's utterance and keeps the call going when nothing terminates it", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Tell me more", shouldEndInterview: false }]);
    const agent = new FeedbackAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "It was fine." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
    });

    expect(result).toEqual({
      utterance: "Tell me more",
      isInterviewOver: false,
      terminationReason: null,
      openFloorJustAsked: false,
    });
  });

  it("ends immediately when the LLM signals an explicit participant request to end, with no minimum-depth gate", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "Of course, thanks for the time.", shouldEndInterview: false, participantRequestedEnd: true },
    ]);
    const agent = new FeedbackAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "I have to go." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 30_000),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("participant-requested");
  });

  it("appends OPEN_FLOOR_UTTERANCE to the model's own utterance, rather than replacing it, the first time shouldEndInterview is true", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "Thanks, that covers everything I wanted to ask.", shouldEndInterview: true },
    ]);
    const agent = new FeedbackAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "It was great." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
    });

    expect(result.utterance).toBe(
      `Thanks, that covers everything I wanted to ask. ${OPEN_FLOOR_UTTERANCE}`,
    );
    expect(result.isInterviewOver).toBe(false);
    expect(result.openFloorJustAsked).toBe(true);
  });

  it("does not append the open floor question again, and does not force a close, once it's already been asked and a normal turn followed", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "Got it, thanks for sharing that.", shouldEndInterview: true },
    ]);
    const agent = new FeedbackAgent(llm);

    const history = [
      { speaker: "interviewer" as const, text: OPEN_FLOOR_UTTERANCE },
      { speaker: "participant" as const, text: "Actually, one more thing." },
      { speaker: "interviewer" as const, text: "Sure, go ahead." },
      { speaker: "participant" as const, text: "The onboarding email was confusing." },
    ];

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: history,
      interviewStartedAt: START,
      now: new Date(START.getTime() + 90_000),
    });

    // isClosingTurn is only true when the open floor question was the single
    // most recent interviewer utterance — here it wasn't ("Sure, go ahead."
    // was), so the deterministic forced-close doesn't apply, and the open
    // floor line is never re-appended once it's already been asked once.
    expect(result.utterance).toBe("Got it, thanks for sharing that.");
    expect(result.isInterviewOver).toBe(false);
    expect(result.openFloorJustAsked).toBe(false);
  });

  it("forces a close on the turn immediately following the open-floor question, regardless of the model's own signal", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "Got it, thanks so much for your time today!", shouldEndInterview: false },
    ]);
    const agent = new FeedbackAgent(llm);

    const history = [
      {
        speaker: "interviewer" as const,
        text: "Thanks for that. Before we wrap up, is there anything else on your mind about today's session?",
      },
      { speaker: "participant" as const, text: "Nope, that's everything." },
    ];

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: history,
      interviewStartedAt: START,
      now: new Date(START.getTime() + 90_000),
    });

    expect(result.utterance).toBe("Got it, thanks so much for your time today!");
    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("llm-self-assessed");
    expect(result.openFloorJustAsked).toBe(false);
  });

  it("still recognizes the open floor question as already asked when the provider replays a slightly reworded version of it", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Wonderful, thanks!", shouldEndInterview: true }]);
    const agent = new FeedbackAgent(llm);

    const history = [
      {
        speaker: "interviewer" as const,
        text: "Great — is there anything else on your mind about today's session before we finish up?",
      },
      { speaker: "participant" as const, text: "No, all good." },
    ];

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: history,
      interviewStartedAt: START,
      now: new Date(START.getTime() + 90_000),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.openFloorJustAsked).toBe(false);
  });

  it("ends the call at the hard cap even if the LLM wants to continue", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "One more thing...", shouldEndInterview: false }]);
    const agent = new FeedbackAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "..." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + FEEDBACK_HARD_CAP_MS),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("time-cap");
    // The hard cap wins outright — it doesn't get the open-floor append treatment.
    expect(result.utterance).toBe("One more thing...");
  });

  it("prioritizes the hard cap over the open-floor append when both would apply on the same turn", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "I think we've covered everything.", shouldEndInterview: true },
    ]);
    const agent = new FeedbackAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "..." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + FEEDBACK_HARD_CAP_MS),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("time-cap");
    expect(result.utterance).toBe("I think we've covered everything.");
    expect(result.openFloorJustAsked).toBe(false);
  });

  it("honors shouldEndInterview even with a single participant turn — no minimum-depth floor for feedback studies", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Great, thanks!", shouldEndInterview: true }]);
    const agent = new FeedbackAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "It was good." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 30_000),
    });

    // Not ended outright — the open-floor question gets appended first.
    expect(result.isInterviewOver).toBe(false);
    expect(result.openFloorJustAsked).toBe(true);
  });
});

describe("FeedbackAgent.generateNextTurnStreaming", () => {
  it("yields the model's text-deltas unchanged, live, before the done event resolves", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["Tell ", "me more."], shouldEndInterview: false },
    ]);
    const agent = new FeedbackAgent(llm);

    const events = [];
    for await (const event of agent.generateNextTurnStreaming({
      context,
      conversationHistory: [{ speaker: "participant", text: "It was fine." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "text-delta", text: "Tell " });
    expect(events[1]).toEqual({ type: "text-delta", text: "me more." });
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      result: { utterance: "Tell me more.", isInterviewOver: false },
    });
  });

  it("appends the open-floor question as one additional text-delta after the model's own text, never retracting what was already streamed", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["That covers ", "everything."], shouldEndInterview: true },
    ]);
    const agent = new FeedbackAgent(llm);

    const events = [];
    for await (const event of agent.generateNextTurnStreaming({
      context,
      conversationHistory: [{ speaker: "participant", text: "It was great." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 60_000),
    })) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas.map((e) => e.text)).toEqual([
      "That covers ",
      "everything.",
      ` ${OPEN_FLOOR_UTTERANCE}`,
    ]);
    const done = events[events.length - 1];
    expect(done).toMatchObject({
      type: "done",
      result: {
        utterance: `That covers everything. ${OPEN_FLOOR_UTTERANCE}`,
        isInterviewOver: false,
        openFloorJustAsked: true,
      },
    });
  });

  it("produces the same result as the non-streaming path on the hard cap", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurnStreams([
      { textChunks: ["One more thing..."], shouldEndInterview: false },
    ]);
    const agent = new FeedbackAgent(llm);

    const events = [];
    for await (const event of agent.generateNextTurnStreaming({
      context,
      conversationHistory: [{ speaker: "participant", text: "..." }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + FEEDBACK_HARD_CAP_MS),
    })) {
      events.push(event);
    }

    const done = events[events.length - 1];
    expect(done).toMatchObject({
      type: "done",
      result: {
        utterance: "One more thing...",
        isInterviewOver: true,
        terminationReason: "time-cap",
      },
    });
  });
});
