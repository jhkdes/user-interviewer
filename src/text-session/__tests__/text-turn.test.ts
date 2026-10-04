import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_FLOOR_UTTERANCE, TEXT_TIME_CAP_UTTERANCE } from "@/interview-agent";
import { FEEDBACK_HARD_CAP_MS, FEEDBACK_TEXT_HARD_CAP_MS } from "@/interview-agent/termination";
import {
  IDLE_NUDGE_TEXT,
  MAX_MESSAGE_CHARS,
  MAX_PARTICIPANT_MESSAGES,
  STALE_REPLY_MS,
} from "../constants";
import { countCharacters, startTextTurn } from "../text-turn";
import { drain, inMs, setupTextSession, streamedText } from "./test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

function reply(text: string, extra: { end?: boolean; leave?: boolean } = {}) {
  return {
    textChunks: [text.slice(0, 5), text.slice(5)],
    shouldEndInterview: extra.end ?? false,
    participantRequestedEnd: extra.leave ?? false,
  };
}

describe("startTextTurn", () => {
  describe("request validation", () => {
    it("rejects a missing or blank client message id", async () => {
      const { deps, interview } = await setupTextSession();

      for (const clientMessageId of ["", "   ", undefined as unknown as string]) {
        const result = await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId,
          message: "hi",
        });
        expect(result).toMatchObject({ ok: false, status: 400, code: "invalid-request" });
      }
    });

    it("rejects an over-long client message id", async () => {
      const { deps, interview } = await setupTextSession();

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "x".repeat(101),
        message: "hi",
      });

      expect(result).toMatchObject({ ok: false, status: 400, code: "invalid-request" });
    });

    it("rejects a non-text or whitespace-only message without touching the interview", async () => {
      const { deps, interview, interviewRepo, messageRepo } = await setupTextSession();

      for (const message of ["   \n ", 42 as unknown as string]) {
        const result = await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message,
        });
        expect(result).toMatchObject({ ok: false, status: 400, code: "invalid-request" });
      }
      expect((await interviewRepo.getById(interview.id))?.status).toBe("pending");
      expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
    });

    it("accepts a message of exactly the maximum length", async () => {
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("Thanks for that.")]);

      const start = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "a".repeat(MAX_MESSAGE_CHARS),
      });

      expect(start.ok).toBe(true);
    });

    it("rejects an over-long message with a friendly message that includes the counts, saving and generating nothing", async () => {
      const { deps, interview, startedWith, messageRepo, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "a".repeat(MAX_MESSAGE_CHARS + 340),
      });

      expect(result).toMatchObject({ ok: false, status: 422, code: "message-too-long" });
      if (!result.ok) {
        expect(result.message).toContain("2340 of 2000 characters");
        expect(result.message).toMatch(/shorten/i);
      }
      expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
      expect(llm.calls.generateInterviewerTurnStreaming).toHaveLength(0);
    });

    it("counts characters, not UTF-16 units, so emoji count once", async () => {
      expect(countCharacters("😀".repeat(MAX_MESSAGE_CHARS))).toBe(MAX_MESSAGE_CHARS);
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("Thanks for that.")]);

      const start = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "😀".repeat(MAX_MESSAGE_CHARS),
      });

      expect(start.ok).toBe(true);
    });

    it("trims the message before storing it", async () => {
      const { deps, interview, startedWith, messageRepo, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("Thanks for that.")]);

      await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "  Good session.  \n",
        }),
      );

      expect((await messageRepo.listByInterviewId(interview.id))[1].text).toBe("Good session.");
    });
  });

  describe("which interviews are accepted", () => {
    it("rejects an unknown interview", async () => {
      const { deps } = await setupTextSession();

      const result = await startTextTurn(deps, {
        interviewId: "00000000-0000-0000-0000-000000000000",
        clientMessageId: "m-1",
      });

      expect(result).toMatchObject({ ok: false, status: 404, code: "interview-not-found" });
    });

    it("rejects a discovery study's interview, even one marked as text", async () => {
      const { deps, interview } = await setupTextSession({ studyType: "discovery" });

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
      });

      expect(result).toMatchObject({ ok: false, status: 403, code: "not-supported" });
    });

    it("rejects a voice interview of a feedback study", async () => {
      const { deps, interview } = await setupTextSession({ mode: "voice" });

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
      });

      expect(result).toMatchObject({ ok: false, status: 409, code: "not-text-interview" });
    });

    it("rejects a completed interview and says why it ended", async () => {
      const { deps, interview, interviewRepo } = await setupTextSession();
      await interviewRepo.update(interview.id, {
        status: "completed",
        endedReason: "participant-inactive",
      });

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "hello?",
      });

      expect(result).toMatchObject({
        ok: false,
        status: 409,
        code: "interview-ended",
        endedReason: "participant-inactive",
      });
    });

    it("rejects an expired interview", async () => {
      const { deps, interview, interviewRepo } = await setupTextSession();
      await interviewRepo.update(interview.id, { status: "expired" });

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
      });

      expect(result).toMatchObject({ ok: false, status: 409, code: "interview-ended" });
    });
  });

  describe("opening greeting", () => {
    it("starts the interview, streams the greeting, and stores it as message 1", async () => {
      const { deps, interview, interviewRepo, messageRepo, llm } = await setupTextSession();
      llm.scriptInterviewerTurnStreams([reply("Hi Sam, thanks for joining.")]);

      const events = await drain(
        await startTextTurn(deps, { interviewId: interview.id, clientMessageId: "open-1" }),
      );

      expect(streamedText(events)).toBe("Hi Sam, thanks for joining.");
      expect(events[events.length - 1]).toEqual({
        type: "done",
        message: { seq: 1, text: "Hi Sam, thanks for joining." },
        interviewOver: false,
        endedReason: null,
      });
      const started = await interviewRepo.getById(interview.id);
      expect(started?.status).toBe("in-progress");
      expect(started?.startedAt).toBeInstanceOf(Date);
      expect(started?.lastActivityAt).toBeInstanceOf(Date);
      const stored = await messageRepo.listByInterviewId(interview.id);
      expect(stored.map((m) => [m.seq, m.speaker, m.text])).toEqual([
        [1, "interviewer", "Hi Sam, thanks for joining."],
      ]);
      // Generated from an empty history, with the written-chat prompt.
      const call = llm.calls.generateInterviewerTurnStreaming[0];
      expect(call.conversationHistory).toEqual([]);
      expect(call.systemPrompt).toContain("## This is a written chat");
    });

    it("refuses to open a second time", async () => {
      const { deps, interview, startedWith } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "open-2",
      });

      expect(result).toMatchObject({ ok: false, status: 409, code: "opening-already-done" });
    });
  });

  describe("a participant message", () => {
    it("stores it, streams the reply, stores the reply, and sends the whole conversation to the model", async () => {
      const { deps, interview, interviewRepo, messageRepo, llm, startedWith } =
        await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "It was a good session.",
        }),
      );

      expect(streamedText(events)).toBe("What stood out most?");
      expect(events[events.length - 1]).toMatchObject({
        type: "done",
        message: { seq: 3, text: "What stood out most?" },
        interviewOver: false,
        endedReason: null,
      });
      const stored = await messageRepo.listByInterviewId(interview.id);
      expect(stored.map((m) => [m.seq, m.speaker, m.text, m.clientMessageId])).toEqual([
        [1, "interviewer", "Hi Sam!", null],
        [2, "participant", "It was a good session.", "m-1"],
        [3, "interviewer", "What stood out most?", null],
      ]);
      expect(llm.calls.generateInterviewerTurnStreaming[0].conversationHistory).toEqual([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "It was a good session." },
      ]);
      expect((await interviewRepo.getById(interview.id))?.status).toBe("in-progress");
    });

    it("keeps the scripted idle nudge out of what the model sees", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "What stood out most?" },
        { speaker: "interviewer", text: IDLE_NUDGE_TEXT },
      ]);
      llm.scriptInterviewerTurnStreams([reply("Thanks, and the pacing?")]);

      await drain(
        await startTextTurn(
          { ...deps, now: inMs(5_000) },
          { interviewId: interview.id, clientMessageId: "m-1", message: "The demo." },
        ),
      );

      expect(llm.calls.generateInterviewerTurnStreaming[0].conversationHistory).toEqual([
        { speaker: "interviewer", text: "What stood out most?" },
        { speaker: "participant", text: "The demo." },
      ]);
      // The nudge stays in the stored conversation the participant sees.
      expect((await messageRepo.listByInterviewId(interview.id)).map((m) => m.text)).toContain(
        IDLE_NUDGE_TEXT,
      );
    });

    it("still recognizes the participant's answer to the open-floor question after a nudge", async () => {
      const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Thanks, that helps." },
        { speaker: "interviewer", text: OPEN_FLOOR_UTTERANCE },
        { speaker: "interviewer", text: IDLE_NUDGE_TEXT },
      ]);
      llm.scriptInterviewerTurnStreams([reply("Thanks so much, take care!")]);

      const events = await drain(
        await startTextTurn(
          { ...deps, now: inMs(5_000) },
          { interviewId: interview.id, clientMessageId: "m-1", message: "No, that's all." },
        ),
      );

      expect(events[events.length - 1]).toMatchObject({ type: "done", interviewOver: true });
      expect((await interviewRepo.getById(interview.id))?.status).toBe("completed");
    });

    it("counts the message as activity and clears a pending idle nudge", async () => {
      const { deps, interview, interviewRepo, llm, startedWith } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      await interviewRepo.update(interview.id, { idleNudgeSentAt: new Date() });
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);
      const now = inMs(5_000);

      await drain(
        await startTextTurn(
          { ...deps, now },
          { interviewId: interview.id, clientMessageId: "m-1", message: "Sorry, back now." },
        ),
      );

      const reloaded = await interviewRepo.getById(interview.id);
      expect(reloaded?.idleNudgeSentAt).toBeNull();
      expect(reloaded?.lastActivityAt).toBeInstanceOf(Date);
    });

    it("refuses a message before the interview has started", async () => {
      const { deps, interview } = await setupTextSession();

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "hello",
      });

      expect(result).toMatchObject({ ok: false, status: 409, code: "interview-not-started" });
    });

    it("refuses a new message while the previous one is still waiting for its reply", async () => {
      const { deps, interview, startedWith, messageRepo } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);

      const result = await startTextTurn(
        { ...deps, now: inMs(5_000) },
        { interviewId: interview.id, clientMessageId: "m-2", message: "Anyone there?" },
      );

      expect(result).toMatchObject({ ok: false, status: 409, code: "still-replying" });
      expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(2);
    });

    it("lets only one of two simultaneous messages through", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?"), reply("Anything else?")]);

      const [a, b] = await Promise.all([
        startTextTurn(deps, { interviewId: interview.id, clientMessageId: "a", message: "From A" }),
        startTextTurn(deps, { interviewId: interview.id, clientMessageId: "b", message: "From B" }),
      ]);

      const accepted = [a, b].filter((r) => r.ok);
      const rejected = [a, b].filter((r) => !r.ok);
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ ok: false, status: 409, code: "conflict" });
      await drain(accepted[0]);
      const participantMessages = (await messageRepo.listByInterviewId(interview.id)).filter(
        (m) => m.speaker === "participant",
      );
      expect(participantMessages).toHaveLength(1);
      expect(llm.calls.generateInterviewerTurnStreaming).toHaveLength(1);
    });
  });

  describe("retries", () => {
    it("answers a retry of an already-answered message with the stored reply, without another model call", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);
      await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "It was good.",
        }),
      );

      const events = await drain(
        await startTextTurn(
          { ...deps, now: inMs(5_000) },
          { interviewId: interview.id, clientMessageId: "m-1", message: "It was good." },
        ),
      );

      expect(events).toEqual([
        {
          type: "done",
          message: { seq: 3, text: "What stood out most?" },
          interviewOver: false,
          endedReason: null,
        },
      ]);
      expect(llm.calls.generateInterviewerTurnStreaming).toHaveLength(1);
      expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(3);
    });

    it("is not rate limited when it is a retry", async () => {
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);
      await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "It was good.",
        }),
      );

      const retry = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "It was good.",
      });

      expect(retry.ok).toBe(true);
    });

    it("says the reply is still being written when a fresh message has no reply yet", async () => {
      const { deps, interview, startedWith } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-1",
        message: "Hello.",
      });

      expect(result).toMatchObject({ ok: false, status: 409, code: "still-replying" });
    });

    it("regenerates the missing reply for a stale unanswered message, without duplicating the message", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);

      const events = await drain(
        await startTextTurn(
          { ...deps, now: inMs(STALE_REPLY_MS + 1_000) },
          { interviewId: interview.id, clientMessageId: "m-1", message: "Hello." },
        ),
      );

      expect(events[events.length - 1]).toMatchObject({
        type: "done",
        message: { seq: 3, text: "What stood out most?" },
      });
      const stored = await messageRepo.listByInterviewId(interview.id);
      expect(stored.map((m) => m.speaker)).toEqual(["interviewer", "participant", "interviewer"]);
    });

    it("regenerates a stale unanswered reply when asked to advance without a message", async () => {
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);

      const events = await drain(
        await startTextTurn(
          { ...deps, now: inMs(STALE_REPLY_MS + 1_000) },
          { interviewId: interview.id, clientMessageId: "advance-1" },
        ),
      );

      expect(events[events.length - 1]).toMatchObject({ type: "done", message: { seq: 3 } });
    });

    it("regenerates immediately when the client says its previous attempt failed", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "Hello.",
          retry: true,
        }),
      );

      expect(events[events.length - 1]).toMatchObject({ type: "done", message: { seq: 3 } });
      expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(3);
    });

    it("regenerates immediately on an advance request that says it is a retry", async () => {
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);

      const start = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "advance-1",
        retry: true,
      });

      expect(start.ok).toBe(true);
    });

    it("does not let retry bypass the check that an already-answered message is answered", async () => {
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);
      await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "It was good.",
        }),
      );

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "It was good.",
          retry: true,
        }),
      );

      expect(events).toHaveLength(1);
      expect(llm.calls.generateInterviewerTurnStreaming).toHaveLength(1);
    });

    it("refuses to advance while a recent message is still being answered", async () => {
      const { deps, interview, startedWith } = await setupTextSession();
      await startedWith([
        { speaker: "interviewer", text: "Hi Sam!" },
        { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
      ]);

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "advance-1",
      });

      expect(result).toMatchObject({ ok: false, status: 409, code: "still-replying" });
    });
  });

  describe("abuse limits", () => {
    it("rate limits a second message sent within two seconds of the first", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);
      await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "First.",
        }),
      );

      const result = await startTextTurn(deps, {
        interviewId: interview.id,
        clientMessageId: "m-2",
        message: "Second, too soon.",
      });

      expect(result).toMatchObject({ ok: false, status: 429, code: "rate-limited" });
      expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(3);
    });

    it("allows the next message once the two-second gap has passed", async () => {
      const { deps, interview, startedWith, llm } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?"), reply("And the pacing?")]);
      await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "First.",
        }),
      );

      const result = await startTextTurn(
        { ...deps, now: inMs(2_500) },
        { interviewId: interview.id, clientMessageId: "m-2", message: "Second." },
      );

      expect(result.ok).toBe(true);
    });

    it("rate limits more than ten participant messages in a rolling minute", async () => {
      const { deps, interview, startedWith } = await setupTextSession();
      const seed = [];
      for (let i = 0; i < 10; i++) {
        seed.push({ speaker: "interviewer" as const, text: `Q${i}` });
        seed.push({ speaker: "participant" as const, text: `A${i}`, clientMessageId: `m-${i}` });
      }
      seed.push({ speaker: "interviewer" as const, text: "Q10" });
      await startedWith(seed);

      const result = await startTextTurn(
        { ...deps, now: inMs(5_000) },
        { interviewId: interview.id, clientMessageId: "m-10", message: "One more." },
      );

      expect(result).toMatchObject({ ok: false, status: 429, code: "rate-limited" });
    });

    it("completes the interview with message-limit when the participant message cap is reached", async () => {
      const { deps, interview, startedWith, interviewRepo, messageRepo, llm } =
        await setupTextSession();
      const seed = [];
      for (let i = 0; i < MAX_PARTICIPANT_MESSAGES; i++) {
        seed.push({ speaker: "interviewer" as const, text: `Q${i}` });
        seed.push({ speaker: "participant" as const, text: `A${i}`, clientMessageId: `m-${i}` });
      }
      seed.push({ speaker: "interviewer" as const, text: "Last question" });
      await startedWith(seed);

      const result = await startTextTurn(
        { ...deps, now: inMs(5_000) },
        { interviewId: interview.id, clientMessageId: "m-over", message: "Yet another." },
      );

      expect(result).toMatchObject({
        ok: false,
        status: 409,
        code: "interview-ended",
        endedReason: "message-limit",
      });
      const reloaded = await interviewRepo.getById(interview.id);
      expect(reloaded?.status).toBe("completed");
      expect(reloaded?.endedReason).toBe("message-limit");
      expect(reloaded?.transcript).toHaveLength(MAX_PARTICIPANT_MESSAGES * 2 + 1);
      expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
      expect(llm.calls.generateInterviewerTurnStreaming).toHaveLength(0);
    });
  });

  describe("how the interview ends", () => {
    it("ends when the participant says they need to go, recording participant-requested and running the completion side effects", async () => {
      const { deps, interview, startedWith, llm, interviewRepo, messageRepo, emailClient } =
        await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("Of course, thanks!", { leave: true })]);

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "I need to go, sorry.",
        }),
      );

      expect(events[events.length - 1]).toEqual({
        type: "done",
        message: { seq: 3, text: "Of course, thanks!" },
        interviewOver: true,
        endedReason: "participant-requested",
      });
      const reloaded = await interviewRepo.getById(interview.id);
      expect(reloaded?.status).toBe("completed");
      expect(reloaded?.endedReason).toBe("participant-requested");
      expect(reloaded?.transcript?.map((e) => e.text)).toEqual([
        "Hi Sam!",
        "I need to go, sorry.",
        "Of course, thanks!",
      ]);
      expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
      expect(emailClient.sent).toHaveLength(1);
    });

    it("ends with the fixed closing line when the time cap has passed", async () => {
      const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession();
      await startedWith(
        [{ speaker: "interviewer", text: "Hi Sam!" }],
        new Date(Date.now() - FEEDBACK_TEXT_HARD_CAP_MS - 60_000),
      );
      llm.scriptInterviewerTurnStreams([reply("Thanks, that helps.")]);

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "One more thought.",
        }),
      );

      const text = `Thanks, that helps. ${TEXT_TIME_CAP_UTTERANCE}`;
      expect(streamedText(events)).toBe(text);
      expect(events[events.length - 1]).toMatchObject({
        type: "done",
        message: { text },
        interviewOver: true,
        endedReason: "time-cap",
      });
      expect((await interviewRepo.getById(interview.id))?.endedReason).toBe("time-cap");
      expect(llm.calls.generateInterviewerTurnStreaming[0].systemPrompt).toContain("## Time is up");
    });

    it("keeps going past the spoken seven-minute limit, since a typed interview has 15 minutes", async () => {
      const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession();
      await startedWith(
        [{ speaker: "interviewer", text: "Hi Sam!" }],
        new Date(Date.now() - FEEDBACK_HARD_CAP_MS - 60_000),
      );
      llm.scriptInterviewerTurnStreams([reply("And the pacing?")]);

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "Sorry, I was multitasking.",
        }),
      );

      expect(events[events.length - 1]).toMatchObject({
        type: "done",
        message: { text: "And the pacing?" },
        interviewOver: false,
      });
      expect((await interviewRepo.getById(interview.id))?.status).toBe("in-progress");
      expect(llm.calls.generateInterviewerTurnStreaming[0].systemPrompt).not.toContain(
        "## Time is up",
      );
    });

    it("asks the open-floor question when the model thinks it is done, then closes on the next reply", async () => {
      const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("Thanks, that's really helpful.", { end: true })]);

      const first = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "That covers it.",
        }),
      );

      expect(first[first.length - 1]).toMatchObject({
        type: "done",
        message: { text: `Thanks, that's really helpful. ${OPEN_FLOOR_UTTERANCE}` },
        interviewOver: false,
      });
      expect((await interviewRepo.getById(interview.id))?.openFloorAskedAt).toBeInstanceOf(Date);

      llm.scriptInterviewerTurnStreams([reply("Thanks so much, take care!")]);
      const second = await drain(
        await startTextTurn(
          { ...deps, now: inMs(5_000) },
          { interviewId: interview.id, clientMessageId: "m-2", message: "No, that's all." },
        ),
      );

      expect(second[second.length - 1]).toMatchObject({
        type: "done",
        interviewOver: true,
        endedReason: "text-interview-ended",
      });
      expect((await interviewRepo.getById(interview.id))?.status).toBe("completed");
    });
  });

  describe("failures while replying", () => {
    it("reports a generation failure, keeps the participant's message, and saves no reply", async () => {
      const { deps, interview, startedWith, messageRepo } = await setupTextSession();
      vi.spyOn(console, "error").mockImplementation(() => {});
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      // No scripted stream: the fake model throws.

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "Hello.",
        }),
      );

      expect(events[events.length - 1]).toMatchObject({
        type: "error",
        code: "generation-failed",
      });
      expect((await messageRepo.listByInterviewId(interview.id)).map((m) => m.speaker)).toEqual([
        "interviewer",
        "participant",
      ]);
    });

    it("drops the reply and reports a conflict when another interviewer message got in first", async () => {
      const { deps, interview, startedWith, llm, messageRepo } = await setupTextSession();
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("What stood out most?")]);
      const realAppend = messageRepo.append.bind(messageRepo);
      let injected = false;
      vi.spyOn(messageRepo, "append").mockImplementation(async (input) => {
        if (input.speaker === "interviewer" && !injected) {
          injected = true;
          await realAppend({
            interviewId: input.interviewId,
            speaker: "interviewer",
            text: "Hey!",
          });
        }
        return realAppend(input);
      });

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "Hello.",
        }),
      );

      expect(events[events.length - 1]).toMatchObject({ type: "error", code: "conflict" });
      const texts = (await messageRepo.listByInterviewId(interview.id)).map((m) => m.text);
      expect(texts).toEqual(["Hi Sam!", "Hello.", "Hey!"]);
    });

    it("still tells the participant the interview ended if completing it fails", async () => {
      const { deps, interview, startedWith, llm, interviewRepo } = await setupTextSession();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await startedWith([{ speaker: "interviewer", text: "Hi Sam!" }]);
      llm.scriptInterviewerTurnStreams([reply("Of course, thanks!", { leave: true })]);
      vi.spyOn(interviewRepo, "updateIfNotCompleted").mockRejectedValue(new Error("db down"));

      const events = await drain(
        await startTextTurn(deps, {
          interviewId: interview.id,
          clientMessageId: "m-1",
          message: "I need to go.",
        }),
      );

      expect(events[events.length - 1]).toMatchObject({ type: "done", interviewOver: true });
      expect(error).toHaveBeenCalled();
    });
  });
});
