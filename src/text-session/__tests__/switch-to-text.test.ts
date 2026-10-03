import { describe, expect, it } from "vitest";
import { SWITCH_TO_TEXT_GRACE_MS, SWITCH_TO_TEXT_WINDOW_MS } from "../constants";
import { switchToText } from "../switch-to-text";
import { setupTextSession } from "./test-helpers";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

/** A feedback voice interview whose call began `startedSecondsAgo` seconds ago, carrying everything a running call leaves behind. */
async function voiceCallInProgress(startedSecondsAgo: number | null = 10) {
  const s = await setupTextSession({ mode: "voice" });
  await s.interviewRepo.update(s.interview.id, {
    status: startedSecondsAgo === null ? "pending" : "in-progress",
    startedAt: startedSecondsAgo === null ? null : secondsAgo(startedSecondsAgo),
    transcript: [{ speaker: "interviewer", text: "Hi from the voice call", timestampMs: 0 }],
    vapiCallId: "call-1",
    elevenLabsConversationId: "conv-1",
    recordingUrl: "https://stored.example/recording.mp3",
    backgroundedAt: secondsAgo(5),
    timeCheckAskedAt: secondsAgo(4),
    extensionGranted: true,
    secondTimeCheckAskedAt: secondsAgo(3),
    openFloorAskedAt: secondsAgo(2),
    endedReason: "something",
  });
  const deps = {
    interviewRepo: s.interviewRepo,
    studyRepo: s.studyRepo,
    enabled: true,
    now: NOW,
  };
  return { ...s, deps };
}

describe("switchToText", () => {
  it("resets a started voice interview to a fresh, pending, text one, discarding everything the call left behind", async () => {
    const { deps, interview, interviewRepo } = await voiceCallInProgress(10);

    const result = await switchToText(deps, interview.id);

    expect(result).toEqual({ ok: true });
    const reset = await interviewRepo.getById(interview.id);
    expect(reset).toMatchObject({
      mode: "text",
      status: "pending",
      startedAt: null,
      transcript: null,
      endedReason: null,
      vapiCallId: null,
      elevenLabsConversationId: null,
      recordingUrl: null,
      backgroundedAt: null,
      timeCheckAskedAt: null,
      extensionGranted: null,
      secondTimeCheckAskedAt: null,
      openFloorAskedAt: null,
      lastActivityAt: null,
      idleNudgeSentAt: null,
    });
    expect(reset?.switchedToTextAt).toEqual(NOW);
  });

  it("keeps who the participant is", async () => {
    const { deps, interview, interviewRepo } = await voiceCallInProgress(10);
    await interviewRepo.update(interview.id, {
      roleDescription: "PM",
    });

    await switchToText(deps, interview.id);

    expect(await interviewRepo.getById(interview.id)).toMatchObject({
      firstName: "Sam",
      email: "sam@example.com",
      trackingId: "tracking-1",
      consentGivenAt: interview.consentGivenAt,
    });
  });

  it("works from the microphone-error screen, where the call never started", async () => {
    const { deps, interview, interviewRepo } = await voiceCallInProgress(null);

    const result = await switchToText(deps, interview.id);

    expect(result).toEqual({ ok: true });
    expect(await interviewRepo.getById(interview.id)).toMatchObject({
      mode: "text",
      status: "pending",
      switchedToTextAt: NOW,
    });
  });

  it("works at any time for a call whose start the server doesn't know yet (ElevenLabs reports it only afterwards)", async () => {
    const s = await setupTextSession({ mode: "voice" });
    await s.interviewRepo.update(s.interview.id, { status: "pending", startedAt: null });

    const result = await switchToText(
      { interviewRepo: s.interviewRepo, studyRepo: s.studyRepo, enabled: true, now: NOW },
      s.interview.id,
    );

    expect(result).toEqual({ ok: true });
  });

  describe("the time window", () => {
    const limit = (SWITCH_TO_TEXT_WINDOW_MS + SWITCH_TO_TEXT_GRACE_MS) / 1000;

    it("allows a switch right up to the window plus its grace", async () => {
      const { deps, interview } = await voiceCallInProgress(limit);

      expect(await switchToText(deps, interview.id)).toEqual({ ok: true });
    });

    it("refuses once past it, leaving the interview untouched", async () => {
      const { deps, interview, interviewRepo } = await voiceCallInProgress(limit + 1);

      const result = await switchToText(deps, interview.id);

      expect(result).toMatchObject({ ok: false, status: 409, code: "too-late" });
      expect(await interviewRepo.getById(interview.id)).toMatchObject({
        mode: "voice",
        status: "in-progress",
        vapiCallId: "call-1",
        switchedToTextAt: null,
      });
    });
  });

  describe("what it refuses", () => {
    it("refuses when text mode is off for the deploy", async () => {
      const { deps, interview, interviewRepo } = await voiceCallInProgress(10);

      const result = await switchToText({ ...deps, enabled: false }, interview.id);

      expect(result).toMatchObject({ ok: false, status: 403, code: "not-supported" });
      expect((await interviewRepo.getById(interview.id))?.mode).toBe("voice");
    });

    it("refuses a discovery study, which stays voice-only", async () => {
      const s = await setupTextSession({ studyType: "discovery", mode: "voice" });
      await s.interviewRepo.update(s.interview.id, {
        status: "in-progress",
        startedAt: secondsAgo(5),
      });

      const result = await switchToText(
        { interviewRepo: s.interviewRepo, studyRepo: s.studyRepo, enabled: true, now: NOW },
        s.interview.id,
      );

      expect(result).toMatchObject({ ok: false, status: 403, code: "not-supported" });
      expect((await s.interviewRepo.getById(s.interview.id))?.mode).toBe("voice");
    });

    it("refuses an interview that already ended", async () => {
      const { deps, interview, interviewRepo } = await voiceCallInProgress(10);
      await interviewRepo.update(interview.id, { status: "completed" });

      const result = await switchToText(deps, interview.id);

      expect(result).toMatchObject({ ok: false, status: 409, code: "interview-ended" });
      expect((await interviewRepo.getById(interview.id))?.status).toBe("completed");
    });

    it("refuses an expired interview", async () => {
      const { deps, interview, interviewRepo } = await voiceCallInProgress(10);
      await interviewRepo.update(interview.id, { status: "expired" });

      expect(await switchToText(deps, interview.id)).toMatchObject({
        ok: false,
        code: "interview-ended",
      });
    });

    it("reports an unknown interview", async () => {
      const { deps } = await voiceCallInProgress(10);

      expect(await switchToText(deps, "00000000-0000-0000-0000-000000000000")).toMatchObject({
        ok: false,
        status: 404,
        code: "interview-not-found",
      });
    });
  });

  describe("repeating the switch", () => {
    it("treats a repeat of a switch that already went through as success, changing nothing more", async () => {
      const { deps, interview, interviewRepo } = await voiceCallInProgress(10);
      await switchToText(deps, interview.id);
      const afterFirst = await interviewRepo.getById(interview.id);

      const result = await switchToText(
        { ...deps, now: new Date(NOW.getTime() + 5000) },
        interview.id,
      );

      expect(result).toEqual({ ok: true });
      expect(await interviewRepo.getById(interview.id)).toEqual(afterFirst);
    });

    it("never resets a typing chat that has already begun", async () => {
      const { deps, interview, interviewRepo, messageRepo } = await voiceCallInProgress(10);
      await switchToText(deps, interview.id);
      await interviewRepo.update(interview.id, { status: "in-progress", startedAt: secondsAgo(2) });
      await messageRepo.append({
        interviewId: interview.id,
        speaker: "interviewer",
        text: "Hi Sam!",
      });

      const result = await switchToText(deps, interview.id);

      expect(result).toMatchObject({ ok: false, status: 409, code: "already-typing" });
      expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
      expect((await interviewRepo.getById(interview.id))?.status).toBe("in-progress");
    });
  });

  it("does not undo the call's own completion if its webhook won the race", async () => {
    const { deps, interview, interviewRepo } = await voiceCallInProgress(10);
    const realGet = interviewRepo.getById.bind(interviewRepo);
    let completedBehindOurBack = false;
    interviewRepo.getById = async (id: string) => {
      const loaded = await realGet(id);
      if (!completedBehindOurBack) {
        completedBehindOurBack = true;
        await interviewRepo.updateIfNotCompleted(id, { status: "completed" });
      }
      return loaded;
    };

    const result = await switchToText(deps, interview.id);

    expect(result).toMatchObject({ ok: false, status: 409, code: "interview-ended" });
    expect(await realGet(interview.id)).toMatchObject({ status: "completed", mode: "voice" });
  });
});
