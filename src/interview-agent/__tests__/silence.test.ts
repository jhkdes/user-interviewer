import { describe, expect, it } from "vitest";
import { FakeLLMProvider, type InterviewTurn } from "@/llm";
import { InterviewAgent } from "../interview-agent";
import {
  CANT_HEAR_UTTERANCE,
  isSilentTurn,
  silenceNotice,
  STILL_CANT_HEAR_UTTERANCE,
  trailingSilentTurns,
} from "../silence";

const say = (speaker: InterviewTurn["speaker"], text: string): InterviewTurn => ({ speaker, text });

describe("isSilentTurn", () => {
  it("treats empty text and punctuation-only text as silence", () => {
    expect(isSilentTurn("")).toBe(true);
    expect(isSilentTurn("   ")).toBe(true);
    expect(isSilentTurn("...")).toBe(true);
    expect(isSilentTurn("…")).toBe(true);
  });

  it("treats any words as speech, however short", () => {
    expect(isSilentTurn("Hello.")).toBe(false);
    expect(isSilentTurn("um")).toBe(false);
    expect(isSilentTurn("42")).toBe(false);
  });
});

describe("silenceNotice", () => {
  const silentPair = [
    say("interviewer", "What are you best at?"),
    say("participant", "..."),
    say("interviewer", "Take your time."),
    say("participant", "..."),
  ];

  it("says nothing for a single silent turn", () => {
    expect(trailingSilentTurns(silentPair.slice(0, 2))).toBe(1);
    expect(silenceNotice(silentPair.slice(0, 2))).toBeNull();
  });

  it("says it cannot hear the participant after two silent turns in a row", () => {
    expect(silenceNotice(silentPair)).toBe(CANT_HEAR_UTTERANCE);
  });

  it("changes its wording if the silence continues", () => {
    const history = [
      ...silentPair,
      say("interviewer", CANT_HEAR_UTTERANCE),
      say("participant", ""),
    ];
    expect(trailingSilentTurns(history)).toBe(3);
    expect(silenceNotice(history)).toBe(STILL_CANT_HEAR_UTTERANCE);
  });

  it("starts over once the participant speaks", () => {
    const history = [...silentPair, say("participant", "Sorry, I was muted. I'm a designer.")];
    expect(trailingSilentTurns(history)).toBe(0);
    expect(silenceNotice(history)).toBeNull();
  });

  it("does not count a silent turn that came before spoken ones", () => {
    const history = [
      say("participant", "..."),
      say("participant", "..."),
      say("participant", "Hi"),
    ];
    expect(silenceNotice(history)).toBeNull();
  });
});

describe("the interviewer when it cannot hear the participant", () => {
  const context = {
    participantFirstName: "Sarah",
    participantRoleDescription: null,
    studyTitle: "Job search",
    studyDescription: "how you search",
    researchTopic: null,
    customPrompt: null,
    screenerAnswers: null,
  };
  const START = new Date("2026-01-01T00:00:00.000Z");
  const history = [
    say("interviewer", "Hi Sarah."),
    say("participant", "Hello."),
    say("interviewer", "What are you best at?"),
    say("participant", "..."),
    say("interviewer", "Take your time."),
    say("participant", "..."),
  ];
  const input = {
    context,
    conversationHistory: history,
    interviewStartedAt: START,
    now: new Date(START.getTime() + 60_000),
  };

  it("says so without asking the model, and keeps the interview going", async () => {
    const llm = new FakeLLMProvider();
    const result = await new InterviewAgent(llm).generateNextTurn(input);

    expect(result.utterance).toBe(CANT_HEAR_UTTERANCE);
    expect(result.isInterviewOver).toBe(false);
    expect(llm.calls.generateInterviewerTurn).toHaveLength(0);
  });

  it("does the same on the streaming path", async () => {
    const llm = new FakeLLMProvider();
    const events = [];
    for await (const event of new InterviewAgent(llm).generateNextTurnStreaming(input)) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "text-delta", text: CANT_HEAR_UTTERANCE });
    expect(llm.calls.generateInterviewerTurn).toHaveLength(0);
  });
});
