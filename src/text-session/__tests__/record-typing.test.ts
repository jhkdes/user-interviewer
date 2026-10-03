import { describe, expect, it } from "vitest";
import { recordTyping } from "../record-typing";
import { setupTextSession } from "./test-helpers";

const NOW = new Date("2026-01-01T12:00:00.000Z");

async function runningInterview(lastActivityAt: Date | null) {
  const s = await setupTextSession();
  await s.interviewRepo.update(s.interview.id, {
    status: "in-progress",
    startedAt: new Date(NOW.getTime() - 60_000),
    lastActivityAt,
  });
  const deps = { interviewRepo: s.interviewRepo, studyRepo: s.studyRepo, now: NOW };
  return { ...s, deps };
}

describe("recordTyping", () => {
  it("counts a typing signal as activity", async () => {
    const { deps, interview, interviewRepo } = await runningInterview(
      new Date(NOW.getTime() - 2 * 60_000),
    );

    const result = await recordTyping(deps, interview.id);

    expect(result).toEqual({ ok: true, recorded: true });
    expect((await interviewRepo.getById(interview.id))?.lastActivityAt).toEqual(NOW);
  });

  it("records the first signal for an interview with no activity yet", async () => {
    const { deps, interview } = await runningInterview(null);

    expect(await recordTyping(deps, interview.id)).toEqual({ ok: true, recorded: true });
  });

  it("accepts but ignores a signal that follows other activity within ten seconds", async () => {
    const lastActivityAt = new Date(NOW.getTime() - 9_000);
    const { deps, interview, interviewRepo } = await runningInterview(lastActivityAt);

    const result = await recordTyping(deps, interview.id);

    expect(result).toEqual({ ok: true, recorded: false });
    expect((await interviewRepo.getById(interview.id))?.lastActivityAt).toEqual(lastActivityAt);
  });

  it("records a signal once ten seconds have passed", async () => {
    const { deps, interview } = await runningInterview(new Date(NOW.getTime() - 10_000));

    expect(await recordTyping(deps, interview.id)).toEqual({ ok: true, recorded: true });
  });

  it("does not touch the idle-nudge flag", async () => {
    const { deps, interview, interviewRepo } = await runningInterview(
      new Date(NOW.getTime() - 2 * 60_000),
    );
    const nudgedAt = new Date(NOW.getTime() - 30_000);
    await interviewRepo.update(interview.id, { idleNudgeSentAt: nudgedAt });

    await recordTyping(deps, interview.id);

    expect((await interviewRepo.getById(interview.id))?.idleNudgeSentAt).toEqual(nudgedAt);
  });

  it("rejects an unknown interview", async () => {
    const { deps } = await runningInterview(null);

    expect(await recordTyping(deps, "00000000-0000-0000-0000-000000000000")).toEqual({
      ok: false,
      status: 404,
      code: "interview-not-found",
    });
  });

  it("rejects a completed interview", async () => {
    const { deps, interview, interviewRepo } = await runningInterview(null);
    await interviewRepo.update(interview.id, { status: "completed" });

    expect(await recordTyping(deps, interview.id)).toEqual({
      ok: false,
      status: 409,
      code: "interview-ended",
    });
  });

  it("rejects a voice interview", async () => {
    const s = await setupTextSession({ mode: "voice" });

    expect(
      await recordTyping(
        { interviewRepo: s.interviewRepo, studyRepo: s.studyRepo },
        s.interview.id,
      ),
    ).toEqual({ ok: false, status: 409, code: "not-text-interview" });
  });

  it("rejects a discovery study's interview", async () => {
    const s = await setupTextSession({ studyType: "discovery" });

    expect(
      await recordTyping(
        { interviewRepo: s.interviewRepo, studyRepo: s.studyRepo },
        s.interview.id,
      ),
    ).toEqual({ ok: false, status: 409, code: "not-text-interview" });
  });
});
