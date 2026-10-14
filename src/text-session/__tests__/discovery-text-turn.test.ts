import { afterEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_TEXT_TIME_CAP_UTTERANCE } from "@/interview-agent";
import {
  DISCOVERY_TEXT_HARD_CAP_MS,
  FEEDBACK_TEXT_HARD_CAP_MS,
  HARD_CAP_MS,
  SOFT_CAP_MS,
} from "@/interview-agent/termination";
import { textLimitsFor } from "../constants";
import { startTextTurn } from "../text-turn";
import type { TextSessionDeps } from "../types";
import { drain, setupTextSession, streamedText } from "./test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Runs a turn a little later than the seeded messages: the in-memory repositories
 * stamp them with the real clock, which would otherwise trip the per-minute rate limit.
 */
function turn(deps: TextSessionDeps, input: Parameters<typeof startTextTurn>[1]) {
  return startTextTurn({ ...deps, now: new Date(Date.now() + 65_000) }, input);
}

function reply(text: string, extra: { end?: boolean; leave?: boolean } = {}) {
  return {
    textChunks: [text.slice(0, 5), text.slice(5)],
    shouldEndInterview: extra.end ?? false,
    participantRequestedEnd: extra.leave ?? false,
  };
}

/** `count` earlier exchanges: an interviewer question, then the participant's answer. */
function exchanges(count: number) {
  const seed = [];
  for (let i = 0; i < count; i++) {
    seed.push({ speaker: "interviewer" as const, text: `Question ${i}?` });
    seed.push({ speaker: "participant" as const, text: `Answer ${i}`, clientMessageId: `m-${i}` });
  }
  seed.push({ speaker: "interviewer" as const, text: "And then what happened?" });
  return seed;
}

describe("typed discovery interviews", () => {
  it("limits: 100 participant messages, a 60-minute cap, no inactivity end", () => {
    const discovery = textLimitsFor("discovery");
    expect(discovery.maxParticipantMessages).toBe(100);
    expect(discovery.hardCapMs).toBe(60 * 60_000);
    expect(discovery.idleEndAfterMs).toBeNull();
    expect(discovery.maxAgeEndedReason).toBe("time-cap");

    const feedback = textLimitsFor("feedback");
    expect(feedback.maxParticipantMessages).toBe(50);
    expect(feedback.idleEndAfterMs).toBe(10 * 60_000);
  });

  it("opens with the written-chat discovery prompt, not the spoken one", async () => {
    const { deps, interview, llm } = await setupTextSession({ studyType: "discovery" });
    llm.scriptInterviewerTurnStreams([reply("Hi Sam! What is your role?")]);

    const events = await drain(
      await turn(deps, { interviewId: interview.id, clientMessageId: "open-1" }),
    );

    expect(streamedText(events)).toBe("Hi Sam! What is your role?");
    const prompt = llm.calls.generateInterviewerTurnStreaming[0].systemPrompt;
    expect(prompt).toContain("written chat");
    expect(prompt).not.toContain("live, spoken");
    expect(prompt).not.toContain("How their day or week");
  });

  it("does not ask the voice time check at 15 minutes, nor end at the voice 18-minute cap", async () => {
    const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession({
      studyType: "discovery",
    });
    await startedWith(
      exchanges(2),
      new Date(Date.now() - HARD_CAP_MS - 60_000), // past the spoken interview's hard cap
    );
    llm.scriptInterviewerTurnStreams([reply("What did you do next?")]);

    const events = await drain(
      await turn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-new",
        message: "We built a spreadsheet.",
      }),
    );

    expect(streamedText(events)).toBe("What did you do next?");
    const stored = await interviewRepo.getById(interview.id);
    expect(stored?.status).toBe("in-progress");
    expect(stored?.timeCheckAskedAt).toBeNull();
    expect(HARD_CAP_MS).toBeGreaterThan(SOFT_CAP_MS);
    expect(DISCOVERY_TEXT_HARD_CAP_MS).toBeGreaterThan(FEEDBACK_TEXT_HARD_CAP_MS);
  });

  it("will not let the AI end the interview before 12 participant messages", async () => {
    const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession({
      studyType: "discovery",
    });
    // 10 earlier answers + the new one = 11 participant messages.
    await startedWith(exchanges(10));
    llm.scriptInterviewerTurnStreams([reply("Thank you, that covers it.", { end: true })]);

    await drain(
      await turn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-new",
        message: "That's about it.",
      }),
    );

    expect((await interviewRepo.getById(interview.id))?.status).toBe("in-progress");
  });

  it("lets the AI end it once the 12th participant message is in", async () => {
    const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession({
      studyType: "discovery",
    });
    await startedWith(exchanges(11));
    llm.scriptInterviewerTurnStreams([reply("Thank you, that covers it.", { end: true })]);

    const events = await drain(
      await turn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-new",
        message: "That's about it.",
      }),
    );

    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      interviewOver: true,
      endedReason: "text-interview-ended",
    });
    const stored = await interviewRepo.getById(interview.id);
    expect(stored?.status).toBe("completed");
    // The open-floor question is a feedback feature; discovery just closes.
    expect(streamedText(events)).toBe("Thank you, that covers it.");
  });

  it("ends at once when the participant says they need to go, even in the first exchange", async () => {
    const { deps, interview, startedWith, llm, interviewRepo, emailClient } =
      await setupTextSession({ studyType: "discovery" });
    await startedWith([{ speaker: "interviewer", text: "Hi Sam! What do you do?" }]);
    llm.scriptInterviewerTurnStreams([reply("Of course, thanks for your time!", { leave: true })]);

    const events = await drain(
      await turn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "Sorry, I have to run.",
      }),
    );

    expect(events[events.length - 1]).toMatchObject({
      interviewOver: true,
      endedReason: "participant-requested",
    });
    expect((await interviewRepo.getById(interview.id))?.status).toBe("completed");
    expect(emailClient.sent).toHaveLength(1);
  });

  it("closes the session with the fixed note once 60 minutes have passed", async () => {
    const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession({
      studyType: "discovery",
    });
    await startedWith(exchanges(3), new Date(Date.now() - DISCOVERY_TEXT_HARD_CAP_MS - 60_000));
    llm.scriptInterviewerTurnStreams([reply("Thanks, that's helpful to hear.")]);

    const events = await drain(
      await turn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-new",
        message: "One more thing.",
      }),
    );

    const text = `Thanks, that's helpful to hear. ${DISCOVERY_TEXT_TIME_CAP_UTTERANCE}`;
    expect(streamedText(events)).toBe(text);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      message: { text },
      interviewOver: true,
      endedReason: "time-cap",
    });
    const stored = await interviewRepo.getById(interview.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.endedReason).toBe("time-cap");
    expect(llm.calls.generateInterviewerTurnStreaming[0].systemPrompt).toContain("## Time is up");
  });

  it("keeps going between the feedback chat's 15 minutes and the 60-minute cap", async () => {
    const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession({
      studyType: "discovery",
    });
    await startedWith(exchanges(3), new Date(Date.now() - 45 * 60_000));
    llm.scriptInterviewerTurnStreams([reply("How often does that happen?")]);

    await drain(
      await turn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-new",
        message: "It takes a while.",
      }),
    );

    expect((await interviewRepo.getById(interview.id))?.status).toBe("in-progress");
    expect(llm.calls.generateInterviewerTurnStreaming[0].systemPrompt).not.toContain(
      "## Time is up",
    );
  });

  it("accepts 100 participant messages and ends the interview on the 101st with message-limit", async () => {
    const { deps, interview, startedWith, interviewRepo } = await setupTextSession({
      studyType: "discovery",
    });
    await startedWith(exchanges(100));

    const result = await turn(deps, {
      interviewId: interview.id,
      clientMessageId: "m-over",
      message: "Yet another.",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: "interview-ended",
      endedReason: "message-limit",
    });
    expect((await interviewRepo.getById(interview.id))?.endedReason).toBe("message-limit");
  });

  it("still accepts the 100th message", async () => {
    const { deps, interview, startedWith, llm } = await setupTextSession({
      studyType: "discovery",
    });
    await startedWith(exchanges(99));
    llm.scriptInterviewerTurnStreams([reply("Understood. Anything else?")]);

    const result = await turn(deps, {
      interviewId: interview.id,
      clientMessageId: "m-100",
      message: "One more.",
    });

    expect(result.ok).toBe(true);
    await drain(result);
  });
});
