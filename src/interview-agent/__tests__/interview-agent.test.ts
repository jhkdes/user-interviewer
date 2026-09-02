import { describe, expect, it } from "vitest";
import { FakeLLMProvider, type InterviewTurn } from "@/llm";
import {
  InterviewAgent,
  SECOND_TIME_CHECK_UTTERANCE,
  TIME_CHECK_UTTERANCE,
} from "../interview-agent";
import {
  EXTENDED_HARD_CAP_MS,
  EXTENDED_SOFT_CAP_MS,
  HARD_CAP_MS,
  MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END,
  SOFT_CAP_MS,
} from "../termination";

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
  researchTopic: null,
  customPrompt: null,
  screenerAnswers: null,
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
      timeCheckJustAsked: false,
      secondTimeCheckJustAsked: false,
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

  it("ends the interview immediately when the participant explicitly asked to end it, even on a very shallow, early conversation", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      {
        utterance: "Of course — take care, and thanks so much for the time you did give me.",
        shouldEndInterview: false,
        participantRequestedEnd: true,
      },
    ]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "I gotta run, can you end this?" }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + 30_000),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("participant-requested");
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

  it("deterministically injects TIME_CHECK_UTTERANCE once the soft cap has elapsed, without calling the LLM", async () => {
    const llm = new FakeLLMProvider();
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "Still going" }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + SOFT_CAP_MS),
    });

    expect(result).toEqual({
      utterance: TIME_CHECK_UTTERANCE,
      isInterviewOver: false,
      terminationReason: null,
      timeCheckJustAsked: true,
      secondTimeCheckJustAsked: false,
    });
    // The LLM proved unreliable at initiating this on its own (verified against
    // the real API) — it's scripted instead, so the LLM is never even called here.
    expect(llm.calls.generateInterviewerTurn).toHaveLength(0);
  });

  it("does not re-inject the check-in once it's already been asked — falls through to a normal LLM turn guided by the reactive Time check section", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      {
        utterance: "Great — one more question: what do you usually rework before using it?",
        shouldEndInterview: false,
      },
    ]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [
        { speaker: "interviewer", text: TIME_CHECK_UTTERANCE },
        { speaker: "participant", text: "Yeah, a few more minutes is fine." },
      ],
      interviewStartedAt: START,
      now: new Date(START.getTime() + SOFT_CAP_MS + 30_000),
    });

    expect(result.timeCheckJustAsked).toBe(false);
    expect(result.isInterviewOver).toBe(false);
    expect(result.utterance).toBe(
      "Great — one more question: what do you usually rework before using it?",
    );
    // A trailing "?" on this specific turn is read as the participant having
    // agreed to extend — persisted by the caller as Interview.extensionGranted.
    expect(result.extensionDecision).toBe(true);
    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).toMatch(/## Time check/);
    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).toMatch(
      /you've already asked the participant/i,
    );
  });

  it("still recognizes the check-in as already asked when the provider replays a slightly reworded version of it (confirmed via a real Vapi call, 2026-09-02)", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      {
        utterance: "Great — one more question: what do you usually rework before using it?",
        shouldEndInterview: false,
      },
    ]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [
        {
          speaker: "interviewer",
          // Real text Vapi's conversation history replayed back, verbatim —
          // contractions and punctuation differ from TIME_CHECK_UTTERANCE,
          // but the substance survives.
          text: "Hey. I wanna flag that we're running a little low on time. Are you able to keep going for a few more minutes?",
        },
        { speaker: "participant", text: "Yeah, a few more minutes is fine." },
      ],
      interviewStartedAt: START,
      now: new Date(START.getTime() + SOFT_CAP_MS + 30_000),
    });

    // Must be treated as the reactive decision turn (Time check guidance
    // applied, extensionDecision computed) rather than a normal turn that
    // then gets force-ended once elapsed time crosses the un-extended hard
    // cap — the exact bug this fragment-based matching fixes.
    expect(result.extensionDecision).toBe(true);
    expect(result.isInterviewOver).toBe(false);
    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).toMatch(/## Time check/);
  });

  it("treats a non-question utterance on the reactive time-check turn as a close, even if the LLM's own shouldEndInterview flag says otherwise", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      {
        utterance: "No worries at all — thanks so much for sharing, Jordan.",
        shouldEndInterview: false, // The exact real-API failure mode this override guards against.
      },
    ]);
    const agent = new InterviewAgent(llm);

    const deepHistory: InterviewTurn[] = [
      { speaker: "interviewer", text: TIME_CHECK_UTTERANCE },
      ...Array.from({ length: MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END }, (_, i) => ({
        speaker: "participant" as const,
        text: `Detail ${i + 1}`,
      })),
    ];

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: deepHistory,
      interviewStartedAt: START,
      now: new Date(START.getTime() + SOFT_CAP_MS + 30_000),
    });

    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("llm-self-assessed");
    expect(result.extensionDecision).toBe(false);
  });

  it("does not apply the non-question-means-close override outside the reactive time-check turn", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      { utterance: "Got it, that makes sense.", shouldEndInterview: false },
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
      now: new Date(START.getTime() + 60_000), // well before the soft cap
    });

    expect(result.isInterviewOver).toBe(false);
  });

  it("does not inject or warn about time before the soft cap", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Tell me more", shouldEndInterview: false }]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "Still going" }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + SOFT_CAP_MS - 1000),
    });

    expect(result.timeCheckJustAsked).toBe(false);
    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).not.toMatch(/## Time check/);
  });

  it("falls through to a normal (hard-cap) LLM turn instead of the scripted check-in, if the hard cap is already reached by the time the check-in would fire", async () => {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([{ utterance: "Wrapping up now...", shouldEndInterview: false }]);
    const agent = new InterviewAgent(llm);

    const result = await agent.generateNextTurn({
      context,
      conversationHistory: [{ speaker: "participant", text: "Still going" }],
      interviewStartedAt: START,
      now: new Date(START.getTime() + HARD_CAP_MS),
    });

    expect(result.utterance).toBe("Wrapping up now...");
    expect(result.isInterviewOver).toBe(true);
    expect(result.terminationReason).toBe("time-cap");
    expect(result.timeCheckJustAsked).toBe(false);
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

  describe("extension past the base 15-minute cap", () => {
    it("continues normally (no one-more-question constraint) past the base hard cap once the participant has agreed to extend", async () => {
      const llm = new FakeLLMProvider();
      llm.scriptInterviewerTurns([
        {
          utterance: "Great, let's dig into that a bit more — what happens next?",
          shouldEndInterview: false,
        },
      ]);
      const agent = new InterviewAgent(llm);

      const result = await agent.generateNextTurn({
        context,
        conversationHistory: [{ speaker: "participant", text: "Still going" }],
        interviewStartedAt: START,
        now: new Date(START.getTime() + HARD_CAP_MS + 60_000), // past the base cap
        extensionGranted: true,
      });

      expect(result.isInterviewOver).toBe(false);
      expect(result.terminationReason).toBeNull();
      expect(result.utterance).toBe("Great, let's dig into that a bit more — what happens next?");
      // No "## Time check" guidance on an ordinary extended-interview turn.
      expect(llm.calls.generateInterviewerTurn[0].systemPrompt).not.toMatch(/## Time check/);
    });

    it("ends at the base hard cap regardless of the LLM's signal when the participant declined to extend", async () => {
      const llm = new FakeLLMProvider();
      llm.scriptInterviewerTurns([
        { utterance: "One more question...", shouldEndInterview: false },
      ]);
      const agent = new InterviewAgent(llm);

      const result = await agent.generateNextTurn({
        context,
        conversationHistory: [{ speaker: "participant", text: "Still going" }],
        interviewStartedAt: START,
        now: new Date(START.getTime() + HARD_CAP_MS),
        extensionGranted: false,
      });

      expect(result.isInterviewOver).toBe(true);
      expect(result.terminationReason).toBe("time-cap");
    });

    it("deterministically injects SECOND_TIME_CHECK_UTTERANCE approaching the extended cap, only once extension was granted", async () => {
      const llm = new FakeLLMProvider();
      const agent = new InterviewAgent(llm);

      const result = await agent.generateNextTurn({
        context,
        conversationHistory: [{ speaker: "participant", text: "Still going" }],
        interviewStartedAt: START,
        now: new Date(START.getTime() + EXTENDED_SOFT_CAP_MS),
        extensionGranted: true,
      });

      expect(result).toEqual({
        utterance: SECOND_TIME_CHECK_UTTERANCE,
        isInterviewOver: false,
        terminationReason: null,
        timeCheckJustAsked: false,
        secondTimeCheckJustAsked: true,
      });
      expect(llm.calls.generateInterviewerTurn).toHaveLength(0);
    });

    it("does not inject the second check-in if extension was never granted, even past the extended soft cap", async () => {
      const llm = new FakeLLMProvider();
      llm.scriptInterviewerTurns([{ utterance: "Wrapping up now...", shouldEndInterview: false }]);
      const agent = new InterviewAgent(llm);

      const result = await agent.generateNextTurn({
        context,
        conversationHistory: [{ speaker: "participant", text: "Still going" }],
        interviewStartedAt: START,
        now: new Date(START.getTime() + EXTENDED_SOFT_CAP_MS),
        extensionGranted: null,
      });

      expect(result.utterance).not.toBe(SECOND_TIME_CHECK_UTTERANCE);
    });

    it("closes on the turn reacting to SECOND_TIME_CHECK_UTTERANCE when the utterance isn't a question", async () => {
      const llm = new FakeLLMProvider();
      llm.scriptInterviewerTurns([
        {
          utterance: "That's everything — thank you so much for your time today.",
          shouldEndInterview: false,
        },
      ]);
      const agent = new InterviewAgent(llm);

      const deepHistory: InterviewTurn[] = [
        { speaker: "interviewer", text: TIME_CHECK_UTTERANCE },
        { speaker: "participant", text: "Sure, happy to keep going." },
        { speaker: "interviewer", text: SECOND_TIME_CHECK_UTTERANCE },
        ...Array.from({ length: MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END }, (_, i) => ({
          speaker: "participant" as const,
          text: `Detail ${i + 1}`,
        })),
      ];

      const result = await agent.generateNextTurn({
        context,
        conversationHistory: deepHistory,
        interviewStartedAt: START,
        now: new Date(START.getTime() + EXTENDED_SOFT_CAP_MS + 30_000),
        extensionGranted: true,
      });

      expect(result.isInterviewOver).toBe(true);
      expect(result.terminationReason).toBe("llm-self-assessed");
    });

    it("ends at the extended hard cap even if the LLM wants to continue", async () => {
      const llm = new FakeLLMProvider();
      llm.scriptInterviewerTurns([
        { utterance: "One more question...", shouldEndInterview: false },
      ]);
      const agent = new InterviewAgent(llm);

      const deepHistory: InterviewTurn[] = [
        { speaker: "interviewer", text: TIME_CHECK_UTTERANCE },
        { speaker: "participant", text: "Sure, happy to keep going." },
        { speaker: "interviewer", text: SECOND_TIME_CHECK_UTTERANCE },
        { speaker: "participant", text: "Sounds good." },
      ];

      const result = await agent.generateNextTurn({
        context,
        conversationHistory: deepHistory,
        interviewStartedAt: START,
        now: new Date(START.getTime() + EXTENDED_HARD_CAP_MS),
        extensionGranted: true,
      });

      expect(result.isInterviewOver).toBe(true);
      expect(result.terminationReason).toBe("time-cap");
    });
  });
});
