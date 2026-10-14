import { afterEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_TEXT_HARD_CAP_MS } from "@/interview-agent/termination";
import { closeIfCapped } from "../close-if-capped";
import { getTextState } from "../text-state";
import { setupTextSession } from "./test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const seed = [
  { speaker: "interviewer" as const, text: "Hi Sam!" },
  { speaker: "participant" as const, text: "Hello", clientMessageId: "m-1" },
  { speaker: "interviewer" as const, text: "What do you do?" },
];

describe("closeIfCapped", () => {
  it("ends a typed discovery interview that has reached 60 minutes, as time-cap", async () => {
    const s = await setupTextSession({ studyType: "discovery" });
    await s.startedWith(seed, new Date(Date.now() - DISCOVERY_TEXT_HARD_CAP_MS - 1000));

    expect(await closeIfCapped(s.deps, s.interview.id)).toBe(true);

    const stored = await s.interviewRepo.getById(s.interview.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.endedReason).toBe("time-cap");
    expect(stored?.transcript?.map((e) => e.text)).toEqual(seed.map((m) => m.text));
    expect(await s.messageRepo.listByInterviewId(s.interview.id)).toEqual([]);
    expect(s.emailClient.sent).toHaveLength(1);
  });

  it("leaves an interview alone before the cap", async () => {
    const s = await setupTextSession({ studyType: "discovery" });
    await s.startedWith(seed, new Date(Date.now() - DISCOVERY_TEXT_HARD_CAP_MS + 60_000));

    expect(await closeIfCapped(s.deps, s.interview.id)).toBe(false);
    expect((await s.interviewRepo.getById(s.interview.id))?.status).toBe("in-progress");
  });

  it("does nothing for a feedback interview, even a very old one", async () => {
    const s = await setupTextSession();
    await s.startedWith(seed, new Date(Date.now() - DISCOVERY_TEXT_HARD_CAP_MS - 1000));

    expect(await closeIfCapped(s.deps, s.interview.id)).toBe(false);
    expect((await s.interviewRepo.getById(s.interview.id))?.status).toBe("in-progress");
  });

  it("does nothing for a voice interview or an unknown one", async () => {
    const s = await setupTextSession({ studyType: "discovery", mode: "voice" });
    await s.startedWith(seed, new Date(Date.now() - DISCOVERY_TEXT_HARD_CAP_MS - 1000));

    expect(await closeIfCapped(s.deps, s.interview.id)).toBe(false);
    expect(await closeIfCapped(s.deps, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("completes only once however often it is called, and the state then reports why", async () => {
    const s = await setupTextSession({ studyType: "discovery" });
    await s.startedWith(seed, new Date(Date.now() - DISCOVERY_TEXT_HARD_CAP_MS - 1000));

    const first = await closeIfCapped(s.deps, s.interview.id);
    const second = await closeIfCapped(s.deps, s.interview.id);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(s.emailClient.sent).toHaveLength(1);
    expect(
      await getTextState(s.deps, { interviewId: s.interview.id, linkToken: "text-token" }),
    ).toMatchObject({ status: "completed", endedReason: "time-cap" });
  });
});

describe("getTextState's server time", () => {
  it("includes the server's clock for the participant's countdown", async () => {
    const s = await setupTextSession({ studyType: "discovery" });
    await s.startedWith(seed);

    const before = Date.now();
    const state = await getTextState(s.deps, {
      interviewId: s.interview.id,
      linkToken: "text-token",
    });
    const after = Date.now();

    const serverTime = Date.parse(state?.serverTime ?? "");
    expect(serverTime).toBeGreaterThanOrEqual(before);
    expect(serverTime).toBeLessThanOrEqual(after);
  });
});
