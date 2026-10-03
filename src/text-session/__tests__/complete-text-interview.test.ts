import { afterEach, describe, expect, it, vi } from "vitest";
import { completeTextInterview, messagesToTranscript } from "../complete-text-interview";
import { setupTextSession } from "./test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messagesToTranscript", () => {
  it("measures timestampMs from the start, like voice transcripts", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");

    expect(
      messagesToTranscript(
        [
          {
            speaker: "interviewer",
            text: "Hi Sam!",
            createdAt: new Date("2026-01-01T00:00:03.000Z"),
          },
          {
            speaker: "participant",
            text: "Hello.",
            createdAt: new Date("2026-01-01T00:01:05.500Z"),
          },
        ],
        startedAt,
      ),
    ).toEqual([
      { speaker: "interviewer", text: "Hi Sam!", timestampMs: 3000 },
      { speaker: "participant", text: "Hello.", timestampMs: 65500 },
    ]);
  });

  it("never produces a negative timestamp", () => {
    const [entry] = messagesToTranscript(
      [{ speaker: "interviewer", text: "Hi", createdAt: new Date("2025-12-31T23:59:59.000Z") }],
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(entry.timestampMs).toBe(0);
  });
});

describe("completeTextInterview", () => {
  it("writes the transcript, completes the interview, runs the side effects, and deletes the raw messages", async () => {
    const { deps, interview, interviewRepo, messageRepo, emailClient, webhookClient, llm } =
      await setupTextSession();
    await interviewRepo.update(interview.id, { status: "in-progress", startedAt: new Date() });
    await messageRepo.append({
      interviewId: interview.id,
      speaker: "interviewer",
      text: "Hi Sam!",
    });
    await messageRepo.append({ interviewId: interview.id, speaker: "participant", text: "Hello." });

    const completed = await completeTextInterview(deps, {
      interviewId: interview.id,
      endedReason: "text-interview-ended",
      source: "text-turn",
    });

    expect(completed).toBe(true);
    const reloaded = await interviewRepo.getById(interview.id);
    expect(reloaded?.status).toBe("completed");
    expect(reloaded?.endedReason).toBe("text-interview-ended");
    expect(reloaded?.recordingUrl).toBeNull();
    expect(reloaded?.completedAt).toBeInstanceOf(Date);
    expect(reloaded?.transcript?.map((e) => [e.speaker, e.text])).toEqual([
      ["interviewer", "Hi Sam!"],
      ["participant", "Hello."],
    ]);
    expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
    expect(llm.calls.generateFeedbackSummary).toHaveLength(1);
    expect(emailClient.sent).toHaveLength(1);
    expect(webhookClient.sent).toHaveLength(1);
  });

  it("is a no-op for a second completion: returns false, warns, and leaves things alone", async () => {
    const { deps, interview, interviewRepo, messageRepo, emailClient, webhookClient } =
      await setupTextSession();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await interviewRepo.update(interview.id, { status: "in-progress", startedAt: new Date() });
    await messageRepo.append({
      interviewId: interview.id,
      speaker: "interviewer",
      text: "Hi Sam!",
    });
    await completeTextInterview(deps, {
      interviewId: interview.id,
      endedReason: "text-interview-ended",
      source: "text-turn",
    });

    const second = await completeTextInterview(deps, {
      interviewId: interview.id,
      endedReason: "participant-inactive",
      source: "idle-sweep",
    });

    expect(second).toBe(false);
    expect((await interviewRepo.getById(interview.id))?.endedReason).toBe("text-interview-ended");
    expect(emailClient.sent).toHaveLength(1);
    expect(webhookClient.sent).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("idle-sweep");
  });

  it("keeps the raw messages when it did not complete the interview", async () => {
    const { deps, interview, interviewRepo, messageRepo } = await setupTextSession();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await interviewRepo.update(interview.id, { status: "in-progress", startedAt: new Date() });
    await messageRepo.append({ interviewId: interview.id, speaker: "interviewer", text: "Hi" });
    await interviewRepo.updateIfNotCompleted(interview.id, { status: "completed" });

    await completeTextInterview(deps, {
      interviewId: interview.id,
      endedReason: "participant-inactive",
      source: "idle-sweep",
    });

    expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
  });

  it("still succeeds, and logs, when deleting the raw messages fails", async () => {
    const { deps, interview, interviewRepo, messageRepo } = await setupTextSession();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await interviewRepo.update(interview.id, { status: "in-progress", startedAt: new Date() });
    await messageRepo.append({ interviewId: interview.id, speaker: "interviewer", text: "Hi" });
    vi.spyOn(messageRepo, "deleteByInterviewId").mockRejectedValue(new Error("db down"));

    const completed = await completeTextInterview(deps, {
      interviewId: interview.id,
      endedReason: "text-interview-ended",
      source: "text-turn",
    });

    expect(completed).toBe(true);
    expect((await interviewRepo.getById(interview.id))?.status).toBe("completed");
    expect(error).toHaveBeenCalled();
  });

  it("rejects for an unknown interview", async () => {
    const { deps } = await setupTextSession();

    await expect(
      completeTextInterview(deps, {
        interviewId: "00000000-0000-0000-0000-000000000000",
        endedReason: "x",
        source: "test",
      }),
    ).rejects.toThrow();
  });
});
