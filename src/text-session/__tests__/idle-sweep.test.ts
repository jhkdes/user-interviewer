import { afterEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import { IDLE_NUDGE_TEXT, MAX_COMPLETIONS_PER_SWEEP } from "../constants";
import { decideIdleAction, runTextIdleSweep } from "../idle-sweep";
import { setupTextSession } from "./test-helpers";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

function interviewWith(
  base: Interview,
  fields: { ageMinutes: number; idleMinutes: number | null; nudged?: boolean },
): Interview {
  return {
    ...base,
    status: "in-progress",
    startedAt: minutesAgo(fields.ageMinutes),
    lastActivityAt: fields.idleMinutes === null ? null : minutesAgo(fields.idleMinutes),
    idleNudgeSentAt: fields.nudged ? minutesAgo(1) : null,
  };
}

describe("decideIdleAction", () => {
  async function base() {
    const { interview } = await setupTextSession();
    return interview;
  }
  const INACTIVE = { action: "complete", endedReason: "participant-inactive" };

  it("does nothing while the participant has been active within five minutes", async () => {
    const i = interviewWith(await base(), { ageMinutes: 8, idleMinutes: 4.9 });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "none" });
  });

  it("nudges after five minutes of no activity when the participant has something to answer", async () => {
    const i = interviewWith(await base(), { ageMinutes: 8, idleMinutes: 5 });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "nudge" });
  });

  it("nudges only once", async () => {
    const i = interviewWith(await base(), { ageMinutes: 8, idleMinutes: 6, nudged: true });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "none" });
  });

  it("does not nudge a participant who is waiting on a reply that never came", async () => {
    const i = interviewWith(await base(), { ageMinutes: 8, idleMinutes: 6 });
    expect(decideIdleAction(i, "participant", NOW)).toEqual({ action: "none" });
  });

  it("does not nudge an interview with no messages at all", async () => {
    const i = interviewWith(await base(), { ageMinutes: 8, idleMinutes: 6 });
    expect(decideIdleAction(i, null, NOW)).toEqual({ action: "none" });
  });

  it("leaves a participant who takes up to four minutes per answer alone, however far along the interview is", async () => {
    for (const ageMinutes of [4, 8, 12, 14]) {
      const i = interviewWith(await base(), { ageMinutes, idleMinutes: Math.min(4, ageMinutes) });
      expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "none" });
    }
  });

  it("measures idleness from the start when no activity has been recorded", async () => {
    const i = interviewWith(await base(), { ageMinutes: 6, idleMinutes: null });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "nudge" });
  });

  it("ends the interview, without a nudge, once the 15-minute cap has passed and five minutes are idle", async () => {
    const i = interviewWith(await base(), { ageMinutes: 16, idleMinutes: 5 });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual(INACTIVE);
  });

  it("nudges rather than ends at five idle minutes while the cap has not yet passed", async () => {
    const i = interviewWith(await base(), { ageMinutes: 14.9, idleMinutes: 5 });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "nudge" });
  });

  it("waits past the cap while the participant has been active within five minutes", async () => {
    const i = interviewWith(await base(), { ageMinutes: 16, idleMinutes: 4 });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "none" });
  });

  it("ends the interview after ten minutes with no activity, even before the cap", async () => {
    const i = interviewWith(await base(), { ageMinutes: 12, idleMinutes: 10, nudged: true });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual(INACTIVE);
  });

  it("does not end at nine minutes idle when the cap has not been passed and a nudge was sent", async () => {
    const i = interviewWith(await base(), { ageMinutes: 12, idleMinutes: 9, nudged: true });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual({ action: "none" });
  });

  it("ends an interview older than thirty minutes however active it looks", async () => {
    const i = interviewWith(await base(), { ageMinutes: 30, idleMinutes: 0.2 });
    expect(decideIdleAction(i, "interviewer", NOW)).toEqual(INACTIVE);
  });
});

describe("runTextIdleSweep", () => {
  async function session() {
    const s = await setupTextSession();
    async function seed(
      fields: { ageMinutes: number; idleMinutes: number; nudged?: boolean },
      messages: { speaker: "interviewer" | "participant"; text: string }[] = [
        { speaker: "interviewer", text: "Hi Sam!" },
      ],
    ) {
      await s.startedWith(messages, minutesAgo(fields.ageMinutes));
      await s.interviewRepo.update(s.interview.id, {
        lastActivityAt: minutesAgo(fields.idleMinutes),
        idleNudgeSentAt: fields.nudged ? minutesAgo(1) : null,
      });
    }
    /** Another in-progress text interview of the same study, started and last active the given minutes ago. */
    async function addInterview(name: string, ageMinutes: number, idleMinutes: number) {
      const created = await s.interviewRepo.create({
        studyId: s.study.id,
        firstName: name,
        email: `${name.toLowerCase()}@example.com`,
        mode: "text",
      });
      await s.interviewRepo.update(created.id, {
        status: "in-progress",
        startedAt: minutesAgo(ageMinutes),
        lastActivityAt: minutesAgo(idleMinutes),
      });
      return created;
    }
    return { ...s, seed, addInterview };
  }

  it("leaves an interview alone while the participant is taking their time, four minutes into an answer", async () => {
    const { deps, seed, messageRepo, interview } = await session();
    await seed({ ageMinutes: 10, idleMinutes: 4 });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result).toMatchObject({ nudged: [], completed: [], deferred: 0 });
    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
  });

  it("does nothing to an active interview", async () => {
    const { deps, seed, messageRepo, interview } = await session();
    await seed({ ageMinutes: 2, idleMinutes: 1 });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result).toMatchObject({ checked: 1, nudged: [], completed: [], deferred: 0 });
    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
  });

  it("appends the nudge as an interviewer message and records it, without counting it as activity", async () => {
    const { deps, seed, messageRepo, interview, interviewRepo } = await session();
    await seed({ ageMinutes: 8, idleMinutes: 5 });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.nudged).toEqual([interview.id]);
    const messages = await messageRepo.listByInterviewId(interview.id);
    expect(messages.map((m) => [m.seq, m.speaker, m.text])).toEqual([
      [1, "interviewer", "Hi Sam!"],
      [2, "interviewer", IDLE_NUDGE_TEXT],
    ]);
    const reloaded = await interviewRepo.getById(interview.id);
    expect(reloaded?.idleNudgeSentAt).toEqual(NOW);
    expect(reloaded?.lastActivityAt).toEqual(minutesAgo(5));
  });

  it("nudges only once across sweeps", async () => {
    const { deps, seed, messageRepo, interview } = await session();
    await seed({ ageMinutes: 8, idleMinutes: 5 });

    await runTextIdleSweep(deps, NOW);
    const second = await runTextIdleSweep(deps, new Date(NOW.getTime() + 60_000));

    expect(second.nudged).toEqual([]);
    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(2);
  });

  it("drops the nudge when a participant message landed after the sweep looked", async () => {
    const { deps, seed, messageRepo, interview, interviewRepo } = await session();
    await seed({ ageMinutes: 8, idleMinutes: 5 });
    const realAppend = messageRepo.append.bind(messageRepo);
    vi.spyOn(messageRepo, "append").mockImplementation(async (input) => {
      // The participant replies between the sweep's read and its write.
      await realAppend({
        interviewId: input.interviewId,
        speaker: "participant",
        text: "Sorry, I'm here!",
        clientMessageId: "m-1",
      });
      return realAppend(input);
    });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.nudged).toEqual([]);
    const texts = (await messageRepo.listByInterviewId(interview.id)).map((m) => m.text);
    expect(texts).toEqual(["Hi Sam!", "Sorry, I'm here!"]);
    expect((await interviewRepo.getById(interview.id))?.idleNudgeSentAt).toBeNull();
  });

  it("ends an interview that stayed quiet after the nudge, writing the transcript and deleting the raw messages", async () => {
    const { deps, seed, messageRepo, interview, interviewRepo, emailClient } = await session();
    await seed({ ageMinutes: 12, idleMinutes: 10, nudged: true }, [
      { speaker: "interviewer", text: "Hi Sam!" },
      { speaker: "participant", text: "Hello." },
      { speaker: "interviewer", text: IDLE_NUDGE_TEXT },
    ]);

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.completed).toEqual([
      { interviewId: interview.id, endedReason: "participant-inactive" },
    ]);
    const reloaded = await interviewRepo.getById(interview.id);
    expect(reloaded?.status).toBe("completed");
    expect(reloaded?.endedReason).toBe("participant-inactive");
    expect(reloaded?.transcript?.map((e) => e.text)).toEqual([
      "Hi Sam!",
      "Hello.",
      IDLE_NUDGE_TEXT,
    ]);
    expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
    expect(emailClient.sent).toHaveLength(1);
  });

  it("ends the interview without a nudge when the cap has passed and five minutes are idle", async () => {
    const { deps, seed, messageRepo, interview, interviewRepo } = await session();
    await seed({ ageMinutes: 16, idleMinutes: 5 });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.nudged).toEqual([]);
    expect(result.completed).toEqual([
      { interviewId: interview.id, endedReason: "participant-inactive" },
    ]);
    expect((await interviewRepo.getById(interview.id))?.endedReason).toBe("participant-inactive");
    expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
  });

  it("ends an interview past the thirty-minute backstop even if the participant looks active", async () => {
    const { deps, seed, interview, interviewRepo } = await session();
    await seed({ ageMinutes: 31, idleMinutes: 0.5 });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.completed).toEqual([
      { interviewId: interview.id, endedReason: "participant-inactive" },
    ]);
    expect((await interviewRepo.getById(interview.id))?.status).toBe("completed");
  });

  it("ignores voice interviews and ones that are not in progress", async () => {
    const { deps, seed, interviewRepo, interview } = await session();
    await seed({ ageMinutes: 40, idleMinutes: 40 });
    const voice = await interviewRepo.create({
      studyId: interview.studyId,
      firstName: "V",
      email: "v@example.com",
    });
    await interviewRepo.update(voice.id, {
      status: "in-progress",
      startedAt: minutesAgo(40),
      lastActivityAt: minutesAgo(40),
    });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.checked).toBe(1);
    expect((await interviewRepo.getById(voice.id))?.status).toBe("in-progress");
  });

  it("ends at most the per-sweep limit of interviews and defers the rest", async () => {
    const { deps, addInterview } = await session();
    const total = MAX_COMPLETIONS_PER_SWEEP + 2;
    for (let i = 0; i < total; i++) await addInterview(`P${i}`, 40, 40);

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.completed).toHaveLength(MAX_COMPLETIONS_PER_SWEEP);
    expect(result.deferred).toBe(2);
  });

  it("keeps going when one interview fails", async () => {
    const { deps, addInterview } = await session();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = await addInterview("Broken", 40, 40);
    const fine = await addInterview("Fine", 40, 40);
    const real = deps.messageRepo.listByInterviewId.bind(deps.messageRepo);
    vi.spyOn(deps.messageRepo, "listByInterviewId").mockImplementation(async (id) => {
      if (id === broken.id) throw new Error("db hiccup");
      return real(id);
    });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.completed.map((c) => c.interviewId)).toEqual([fine.id]);
  });

  it("deletes raw messages left behind by a completed interview, but never a running one's", async () => {
    const { deps, seed, messageRepo, interview, interviewRepo } = await session();
    await seed({ ageMinutes: 2, idleMinutes: 1 });
    const done = await interviewRepo.create({
      studyId: interview.studyId,
      firstName: "Done",
      email: "done@example.com",
      mode: "text",
    });
    await interviewRepo.update(done.id, { status: "in-progress" });
    await messageRepo.append({ interviewId: done.id, speaker: "interviewer", text: "left over" });
    await interviewRepo.update(done.id, { status: "completed" });

    const result = await runTextIdleSweep(deps, NOW);

    expect(result.cleanedUp).toEqual([done.id]);
    expect(await messageRepo.listByInterviewId(done.id)).toEqual([]);
    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
  });
});
