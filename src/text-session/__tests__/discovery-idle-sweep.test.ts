import { afterEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import { IDLE_NUDGE_TEXT, textLimitsFor } from "../constants";
import { decideIdleAction, runTextIdleSweep } from "../idle-sweep";
import { setupTextSession } from "./test-helpers";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const limits = textLimitsFor("discovery");

afterEach(() => {
  vi.restoreAllMocks();
});

function interviewWith(
  base: Interview,
  fields: { ageMinutes: number; idleMinutes: number; nudged?: boolean },
): Interview {
  return {
    ...base,
    status: "in-progress",
    startedAt: minutesAgo(fields.ageMinutes),
    lastActivityAt: minutesAgo(fields.idleMinutes),
    idleNudgeSentAt: fields.nudged ? minutesAgo(1) : null,
  };
}

describe("decideIdleAction for a typed discovery interview", () => {
  async function base() {
    const { interview } = await setupTextSession({ studyType: "discovery" });
    return interview;
  }

  it("nudges after five minutes of no activity, as feedback does", async () => {
    const i = interviewWith(await base(), { ageMinutes: 20, idleMinutes: 5 });
    expect(decideIdleAction(i, "interviewer", NOW, limits)).toEqual({ action: "nudge" });
  });

  it("does not end a silent participant after ten, thirty or fifty-five idle minutes", async () => {
    for (const idleMinutes of [10, 30, 55]) {
      const i = interviewWith(await base(), {
        ageMinutes: 55,
        idleMinutes,
        nudged: true,
      });
      expect(decideIdleAction(i, "interviewer", NOW, limits)).toEqual({ action: "none" });
    }
  });

  it("ends the session at 60 minutes as time-cap, however active the participant is", async () => {
    const i = interviewWith(await base(), { ageMinutes: 60, idleMinutes: 0.1 });
    expect(decideIdleAction(i, "participant", NOW, limits)).toEqual({
      action: "complete",
      endedReason: "time-cap",
    });
  });

  it("does not end an active session at 59 minutes", async () => {
    const i = interviewWith(await base(), { ageMinutes: 59, idleMinutes: 0.1 });
    expect(decideIdleAction(i, "interviewer", NOW, limits)).toEqual({ action: "none" });
  });

  it("keeps the feedback timings for a feedback interview", async () => {
    const { interview } = await setupTextSession();
    const i = interviewWith(interview, { ageMinutes: 12, idleMinutes: 10, nudged: true });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({
      action: "complete",
      endedReason: "participant-inactive",
    });
  });
});

describe("runTextIdleSweep with typed discovery interviews", () => {
  it("nudges once at five minutes, leaves it open at 30 idle minutes, and closes it at 60 minutes with time-cap", async () => {
    const s = await setupTextSession({ studyType: "discovery" });
    await s.startedWith([{ speaker: "interviewer", text: "Hi Sam!" }], minutesAgo(20));
    await s.interviewRepo.update(s.interview.id, { lastActivityAt: minutesAgo(6) });

    const first = await runTextIdleSweep(s.deps, NOW);
    expect(first.nudged).toEqual([s.interview.id]);
    const messages = await s.messageRepo.listByInterviewId(s.interview.id);
    expect(messages[messages.length - 1].text).toBe(IDLE_NUDGE_TEXT);

    // Half an hour later with no word from the participant: still open.
    const later = new Date(NOW.getTime() + 30 * 60_000);
    const second = await runTextIdleSweep(s.deps, later);
    expect(second.completed).toEqual([]);
    expect((await s.interviewRepo.getById(s.interview.id))?.status).toBe("in-progress");

    // At the 60-minute mark (started 20 minutes before NOW) the session closes.
    const end = new Date(NOW.getTime() + 40 * 60_000);
    const third = await runTextIdleSweep(s.deps, end);
    expect(third.completed).toEqual([{ interviewId: s.interview.id, endedReason: "time-cap" }]);
    const stored = await s.interviewRepo.getById(s.interview.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.endedReason).toBe("time-cap");
    expect(stored?.transcript?.length).toBeGreaterThan(0);
    expect(await s.messageRepo.listByInterviewId(s.interview.id)).toEqual([]);
  });
});
