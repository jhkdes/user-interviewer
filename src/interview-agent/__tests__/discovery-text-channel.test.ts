import { describe, expect, it } from "vitest";
import { FakeLLMProvider, type InterviewTurn } from "@/llm";
import {
  DISCOVERY_TEXT_TIME_CAP_UTTERANCE,
  InterviewAgent,
  TIME_CHECK_UTTERANCE,
  type InterviewAgentStreamEvent,
} from "../interview-agent";
import { buildInterviewSystemPrompt, DISCOVERY_TEXT_CHANNEL_GUIDANCE } from "../system-prompt";
import {
  DISCOVERY_TEXT_HARD_CAP_MS,
  DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS,
  SOFT_CAP_MS,
} from "../termination";

const baseContext = {
  participantFirstName: "Jordan",
  participantRoleDescription: null,
  studyTitle: "How AI Actually Shows Up in a PM's Day",
  studyDescription: "how product managers really use AI at work",
  researchTopic: null,
  customPrompt: null,
  screenerAnswers: null,
};
const promptContext = { ...baseContext, isDecisionTurn: false, isFinalWrapTurn: false };
const START = new Date("2026-01-01T00:00:00.000Z");
const at = (ms: number) => new Date(START.getTime() + ms);

function history(participantTurns: number): InterviewTurn[] {
  const turns: InterviewTurn[] = [];
  for (let i = 0; i < participantTurns; i++) {
    turns.push({ speaker: "interviewer", text: `Question ${i}?` });
    turns.push({ speaker: "participant", text: `Answer ${i}` });
  }
  return turns;
}

describe("buildInterviewSystemPrompt, text channel", () => {
  it("is unchanged for the voice channel, whether channel is omitted or 'voice'", () => {
    const omitted = buildInterviewSystemPrompt(promptContext);
    const voice = buildInterviewSystemPrompt({ ...promptContext, channel: "voice" });
    expect(voice).toBe(omitted);
    expect(omitted).toContain("live, spoken user-research interview");
    expect(omitted).not.toContain("written chat");
  });

  it("leaves a voice custom prompt unchanged too", () => {
    const custom = { ...promptContext, customPrompt: "Talk to {{participant_name}} out loud." };
    expect(buildInterviewSystemPrompt({ ...custom, channel: "voice" })).toBe(
      buildInterviewSystemPrompt(custom),
    );
  });

  it("writes the generated prompt for a chat: no spoken wording, no warm-up turn, written-chat guidance", () => {
    const prompt = buildInterviewSystemPrompt({ ...promptContext, channel: "text" });

    expect(prompt).toContain("written chat");
    expect(prompt).toContain(DISCOVERY_TEXT_CHANNEL_GUIDANCE);
    expect(prompt).not.toContain("live, spoken");
    expect(prompt).not.toMatch(/warm-up only/i);
    expect(prompt).not.toContain("read aloud");
    expect(prompt).toContain("shown to the participant in the chat verbatim");
    expect(prompt).toMatch(/role and day-to-day responsibilities/i);
    expect(prompt).toMatch(/about 15 minutes/);
  });

  it("appends the chat guidance after a custom prompt, with the written-chat response contract", () => {
    const prompt = buildInterviewSystemPrompt({
      ...promptContext,
      customPrompt: "Open with a warm-up about {{participant_name}}'s week.",
      channel: "text",
    });

    expect(prompt.startsWith("Open with a warm-up about Jordan's week.")).toBe(true);
    expect(prompt.indexOf(DISCOVERY_TEXT_CHANNEL_GUIDANCE)).toBeGreaterThan(
      prompt.indexOf("warm-up"),
    );
    expect(prompt).toContain("shown to the participant in the chat verbatim");
    expect(prompt).not.toContain("read aloud");
  });

  it("states the minimum number of participant messages before the AI may wrap up", () => {
    expect(DISCOVERY_TEXT_CHANNEL_GUIDANCE).toContain(
      `at least ${DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS} messages`,
    );
  });

  it("never carries the voice time-check guidance into a chat", () => {
    const prompt = buildInterviewSystemPrompt({
      ...promptContext,
      isDecisionTurn: true,
      isFinalWrapTurn: false,
      channel: "text",
    });
    expect(prompt).not.toContain("## Time check");
  });

  it("adds the time-up note only when the cap has passed", () => {
    const text = { ...promptContext, channel: "text" as const };
    expect(buildInterviewSystemPrompt(text)).not.toContain("## Time is up");
    expect(buildInterviewSystemPrompt({ ...text, timeUp: true }).startsWith("## Time is up")).toBe(
      true,
    );
  });
});

describe("InterviewAgent, text channel", () => {
  function setup(utterance: string, extra: { end?: boolean; leave?: boolean } = {}) {
    const llm = new FakeLLMProvider();
    llm.scriptInterviewerTurns([
      {
        utterance,
        shouldEndInterview: extra.end ?? false,
        participantRequestedEnd: extra.leave ?? false,
      },
    ]);
    return { llm, agent: new InterviewAgent(llm) };
  }
  const textContext = { ...baseContext, channel: "text" as const };

  it("does not inject the voice time check once the soft cap passes", async () => {
    const { llm, agent } = setup("What happened next?");

    const result = await agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(3),
      interviewStartedAt: START,
      now: at(SOFT_CAP_MS + 60_000),
    });

    expect(result.utterance).toBe("What happened next?");
    expect(result.timeCheckJustAsked).toBe(false);
    expect(result.utterance).not.toBe(TIME_CHECK_UTTERANCE);
    expect(llm.calls.generateInterviewerTurn).toHaveLength(1);
  });

  it("does not turn a typed '...' into a 'cannot hear you' notice", async () => {
    const { llm, agent } = setup("Take your time.");
    const turns = [...history(1), { speaker: "participant" as const, text: "..." }];
    turns.push(
      { speaker: "interviewer", text: "Anything?" },
      { speaker: "participant", text: "..." },
    );

    await agent.generateNextTurn({
      context: textContext,
      conversationHistory: turns,
      interviewStartedAt: START,
      now: at(60_000),
    });

    expect(llm.calls.generateInterviewerTurn).toHaveLength(1);
  });

  it("withholds the AI's own end until the minimum number of participant messages", async () => {
    const before = setup("Thank you, that covers it.", { end: true });
    const early = await before.agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS - 1),
      interviewStartedAt: START,
      now: at(10 * 60_000),
    });
    expect(early.isInterviewOver).toBe(false);

    const after = setup("Thank you, that covers it.", { end: true });
    const enough = await after.agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS),
      interviewStartedAt: START,
      now: at(10 * 60_000),
    });
    expect(enough).toMatchObject({ isInterviewOver: true, terminationReason: "llm-self-assessed" });
  });

  it("never ends on a message that asks a question", async () => {
    const { agent } = setup("Before we finish, anything else?", { end: true });

    const result = await agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS),
      interviewStartedAt: START,
      now: at(10 * 60_000),
    });

    expect(result.isInterviewOver).toBe(false);
  });

  it("honors an explicit request to leave at any point", async () => {
    const { agent } = setup("Of course, thanks!", { leave: true });

    const result = await agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(1),
      interviewStartedAt: START,
      now: at(60_000),
    });

    expect(result).toMatchObject({
      isInterviewOver: true,
      terminationReason: "participant-requested",
      utterance: "Of course, thanks!",
    });
  });

  it("ends at the 60-minute cap with the fixed closing note, in both paths", async () => {
    const expected = `Thanks, that's helpful. ${DISCOVERY_TEXT_TIME_CAP_UTTERANCE}`;

    const plain = setup("Thanks, that's helpful.");
    const result = await plain.agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(4),
      interviewStartedAt: START,
      now: at(DISCOVERY_TEXT_HARD_CAP_MS),
    });
    expect(result).toMatchObject({
      utterance: expected,
      isInterviewOver: true,
      terminationReason: "time-cap",
    });
    expect(plain.llm.calls.generateInterviewerTurn[0].systemPrompt).toContain("## Time is up");

    const streaming = new FakeLLMProvider();
    streaming.scriptInterviewerTurnStreams([
      {
        textChunks: ["Thanks, that's ", "helpful."],
        shouldEndInterview: false,
        participantRequestedEnd: false,
      },
    ]);
    const events: InterviewAgentStreamEvent[] = [];
    for await (const event of new InterviewAgent(streaming).generateNextTurnStreaming({
      context: textContext,
      conversationHistory: history(4),
      interviewStartedAt: START,
      now: at(DISCOVERY_TEXT_HARD_CAP_MS),
    })) {
      events.push(event);
    }
    const streamed = events.flatMap((e) => (e.type === "text-delta" ? [e.text] : [])).join("");
    expect(streamed).toBe(expected);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      result: { utterance: expected, terminationReason: "time-cap" },
    });
  });

  it("keeps going just before the cap", async () => {
    const { llm, agent } = setup("Tell me more.");

    const result = await agent.generateNextTurn({
      context: textContext,
      conversationHistory: history(4),
      interviewStartedAt: START,
      now: at(DISCOVERY_TEXT_HARD_CAP_MS - 1000),
    });

    expect(result.isInterviewOver).toBe(false);
    expect(llm.calls.generateInterviewerTurn[0].systemPrompt).not.toContain("## Time is up");
  });
});
