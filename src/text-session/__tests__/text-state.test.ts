import { describe, expect, it } from "vitest";
import { getTextState } from "../text-state";
import { setupTextSession } from "./test-helpers";

describe("getTextState", () => {
  it("returns the running interview's messages in order", async () => {
    const { deps, interview, startedWith } = await setupTextSession();
    await startedWith([
      { speaker: "interviewer", text: "Hi Sam!" },
      { speaker: "participant", text: "Hello.", clientMessageId: "m-1" },
    ]);

    const state = await getTextState(deps, {
      interviewId: interview.id,
      linkToken: "feedback-token",
    });

    expect(state).toMatchObject({
      mode: "text",
      status: "in-progress",
      endedReason: null,
      firstName: "Sam",
    });
    expect(state?.startedAt).toEqual(expect.any(String));
    expect(state?.messages.map((m) => [m.seq, m.speaker, m.text])).toEqual([
      [1, "interviewer", "Hi Sam!"],
      [2, "participant", "Hello."],
    ]);
    expect(state?.messages[0].createdAt).toEqual(expect.any(String));
  });

  it("returns an empty message list for an interview that has not started", async () => {
    const { deps, interview } = await setupTextSession();

    const state = await getTextState(deps, {
      interviewId: interview.id,
      linkToken: "feedback-token",
    });

    expect(state).toMatchObject({ status: "pending", startedAt: null, messages: [] });
  });

  it("reads a completed interview from its transcript, since the raw messages are deleted", async () => {
    const { deps, interview, interviewRepo } = await setupTextSession();
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    await interviewRepo.update(interview.id, {
      status: "completed",
      startedAt,
      endedReason: "time-cap",
      transcript: [
        { speaker: "interviewer", text: "Hi Sam!", timestampMs: 2000 },
        { speaker: "participant", text: "Hello.", timestampMs: 65_000 },
      ],
    });

    const state = await getTextState(deps, {
      interviewId: interview.id,
      linkToken: "feedback-token",
    });

    expect(state).toMatchObject({ status: "completed", endedReason: "time-cap" });
    expect(state?.messages).toEqual([
      { seq: 1, speaker: "interviewer", text: "Hi Sam!", createdAt: "2026-01-01T00:00:02.000Z" },
      { seq: 2, speaker: "participant", text: "Hello.", createdAt: "2026-01-01T00:01:05.000Z" },
    ]);
  });

  it("reports why an inactive interview ended", async () => {
    const { deps, interview, interviewRepo } = await setupTextSession();
    await interviewRepo.update(interview.id, {
      status: "completed",
      startedAt: new Date(),
      endedReason: "participant-inactive",
      transcript: [{ speaker: "interviewer", text: "Hi Sam!", timestampMs: 0 }],
    });

    const state = await getTextState(deps, {
      interviewId: interview.id,
      linkToken: "feedback-token",
    });

    expect(state?.endedReason).toBe("participant-inactive");
  });

  it("answers null for an unknown interview", async () => {
    const { deps } = await setupTextSession();

    expect(
      await getTextState(deps, {
        interviewId: "00000000-0000-0000-0000-000000000000",
        linkToken: "feedback-token",
      }),
    ).toBeNull();
  });

  it("answers null when the link token belongs to a different study", async () => {
    const { deps, interview } = await setupTextSession();

    expect(
      await getTextState(deps, { interviewId: interview.id, linkToken: "some-other-token" }),
    ).toBeNull();
  });

  it("answers null for a voice interview", async () => {
    const { deps, interview } = await setupTextSession({ mode: "voice" });

    expect(
      await getTextState(deps, { interviewId: interview.id, linkToken: "feedback-token" }),
    ).toBeNull();
  });

  it("answers null for a discovery study", async () => {
    const { deps, interview } = await setupTextSession({ studyType: "discovery" });

    expect(
      await getTextState(deps, { interviewId: interview.id, linkToken: "feedback-token" }),
    ).toBeNull();
  });
});
