import { describe, expect, it } from "vitest";
import { chooseTextMode } from "../choose-text-mode";
import { setupTextSession } from "./test-helpers";

describe("chooseTextMode", () => {
  it("marks a pending feedback interview as a text interview", async () => {
    const { interview, interviewRepo, studyRepo } = await setupTextSession({ mode: "voice" });

    const result = await chooseTextMode({ interviewRepo, studyRepo, enabled: true }, interview.id);

    expect(result).toEqual({ ok: true });
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("text");
  });

  it("is idempotent", async () => {
    const { interview, interviewRepo, studyRepo } = await setupTextSession({ mode: "voice" });
    const deps = { interviewRepo, studyRepo, enabled: true };

    await chooseTextMode(deps, interview.id);
    const second = await chooseTextMode(deps, interview.id);

    expect(second).toEqual({ ok: true });
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("text");
  });

  it("refuses when text mode is not enabled for the deploy", async () => {
    const { interview, interviewRepo, studyRepo } = await setupTextSession({ mode: "voice" });

    const result = await chooseTextMode({ interviewRepo, studyRepo, enabled: false }, interview.id);

    expect(result).toMatchObject({ ok: false, status: 403, code: "not-supported" });
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("voice");
  });

  it("refuses a discovery study, which stays voice-only", async () => {
    const { interview, interviewRepo, studyRepo } = await setupTextSession({
      studyType: "discovery",
      mode: "voice",
    });

    const result = await chooseTextMode({ interviewRepo, studyRepo, enabled: true }, interview.id);

    expect(result).toMatchObject({ ok: false, status: 403, code: "not-supported" });
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("voice");
  });

  it("refuses once the interview has started", async () => {
    const { interview, interviewRepo, studyRepo } = await setupTextSession({ mode: "voice" });
    await interviewRepo.update(interview.id, { status: "in-progress" });

    const result = await chooseTextMode({ interviewRepo, studyRepo, enabled: true }, interview.id);

    expect(result).toMatchObject({ ok: false, status: 409, code: "interview-already-started" });
    expect((await interviewRepo.getById(interview.id))?.mode).toBe("voice");
  });

  it("reports an unknown interview", async () => {
    const { interviewRepo, studyRepo } = await setupTextSession({ mode: "voice" });

    const result = await chooseTextMode(
      { interviewRepo, studyRepo, enabled: true },
      "00000000-0000-0000-0000-000000000000",
    );

    expect(result).toMatchObject({ ok: false, status: 404, code: "interview-not-found" });
  });
});
