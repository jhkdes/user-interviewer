import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAudioCache, generateApiKey, hashApiKey } from "@/partner-api";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

let partners = new InMemoryPartnerRepository();
let studies = new InMemoryStudyRepository();
let invitations = new InMemoryPartnerInvitationRepository();
let interviews = new InMemoryInterviewRepository();
vi.mock("@/repositories/get-partner-repository", () => ({ getPartnerRepository: () => partners }));
vi.mock("@/repositories/get-partner-rate-limit-repository", async () => {
  const { InMemoryPartnerRateLimitRepository } =
    await import("@/repositories/in-memory/in-memory-partner-rate-limit-repository");
  return { getPartnerRateLimitRepository: () => new InMemoryPartnerRateLimitRepository() };
});
vi.mock("@/repositories/get-partner-idempotency-repository", async () => {
  const { InMemoryPartnerIdempotencyRepository } =
    await import("@/repositories/in-memory/in-memory-partner-idempotency-repository");
  return { getPartnerIdempotencyRepository: () => new InMemoryPartnerIdempotencyRepository() };
});
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => studies }));
vi.mock("@/repositories/get-partner-invitation-repository", () => ({
  getPartnerInvitationRepository: () => invitations,
}));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => interviews,
}));
const fetchAudio = vi.hoisted(() => vi.fn());
vi.mock("@/lib/elevenlabs/client", () => ({ fetchConversationAudioResult: fetchAudio }));

import { GET as getAudio } from "../interviews/[interviewId]/audio/route";
import { GET as getInterview } from "../interviews/[interviewId]/route";
import { GET as getTranscript } from "../interviews/[interviewId]/transcript/route";

let keyA: string;
let keyB: string;
let partnerAId: string;

beforeEach(async () => {
  partners = new InMemoryPartnerRepository();
  studies = new InMemoryStudyRepository();
  invitations = new InMemoryPartnerInvitationRepository();
  interviews = new InMemoryInterviewRepository();
  seeded = 0;
  clearAudioCache();
  fetchAudio.mockReset();
  keyA = generateApiKey();
  keyB = generateApiKey();
  partnerAId = (await partners.create({ name: "pfa-preview", keyHash: hashApiKey(keyA) })).id;
  await partners.create({ name: "other", keyHash: hashApiKey(keyB) });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

let seeded = 0;
const AUDIO = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));

/** A partner study with one invitation and one interview. */
async function seed(
  overrides: Parameters<InMemoryInterviewRepository["update"]>[1] = {},
  mode: "voice" | "text" = "voice",
) {
  const study = await studies.create({
    type: "feedback",
    title: "Feedback",
    description: "Jae",
    preInterviewQuestions: [],
    linkToken: "voice-token",
    partnerId: partnerAId,
    // One study per owner, so a second seed in the same test needs its own.
    ownerRef: ++seeded === 1 ? "pfa_user_123" : `pfa_user_${seeded}`,
    voiceProvider: "elevenlabs",
  });
  const invitation = await invitations.create({
    studyId: study.id,
    trackingId: "t".repeat(22),
    colleagueFirstName: "Priya",
    context: {},
  });
  const interview = await interviews.create({
    studyId: study.id,
    firstName: "Priya R",
    email: "priya.private@example.com",
    trackingId: invitation.trackingId,
    voiceProvider: "elevenlabs",
    mode,
  });
  const updated = await interviews.update(interview.id, {
    invitationId: invitation.id,
    ...overrides,
  });
  return { study, invitation, interview: updated };
}

const finished = {
  status: "completed" as const,
  endCause: "finished" as const,
  startedAt: new Date("2026-11-05T10:00:00.000Z"),
  completedAt: new Date("2026-11-05T10:05:12.000Z"),
  elevenLabsConversationId: "conv-1",
  transcript: [
    { speaker: "interviewer" as const, text: "Hi Priya.", timestampMs: 0 },
    { speaker: "participant" as const, text: "Hello!", timestampMs: 3000 },
    { speaker: "interviewer" as const, text: "How was it?", timestampMs: 5000 },
    { speaker: "participant" as const, text: "Great.", timestampMs: 12000 },
  ],
};

const call = (
  handler: typeof getInterview,
  id: string,
  headers: Record<string, string> = {},
  key = keyA,
) =>
  handler(
    new Request(`http://ui.test/api/partner/v1/interviews/${id}`, {
      headers: { Authorization: `Bearer ${key}`, ...headers },
    }),
    { params: { interviewId: id } },
  );

describe("GET /interviews/{id}", () => {
  it("describes an ended interview without the participant's email or last name", async () => {
    const { interview, study, invitation } = await seed(finished);

    const res = await call(getInterview, interview.id);
    const text = await res.text();
    const body = JSON.parse(text);

    expect(res.status).toBe(200);
    expect(body).toEqual({
      interviewId: interview.id,
      studyId: study.id,
      invitationId: invitation.id,
      trackingId: "t".repeat(22),
      colleagueFirstName: "Priya",
      status: "completed",
      endCause: "finished",
      mode: "voice",
      startedAt: "2026-11-05T10:00:00.000Z",
      endedAt: "2026-11-05T10:05:12.000Z",
      durationMs: 312_000,
      participantTurns: 2,
      hasAudio: true,
    });
    expect(text).not.toContain("priya.private@example.com");
    expect(text).not.toContain("Priya R");
  });

  it("shows a running interview as pending, with nothing but its identity filled in", async () => {
    const { interview } = await seed({ status: "in-progress", startedAt: new Date() });

    const body = await (await call(getInterview, interview.id)).json();

    expect(body).toMatchObject({
      status: "pending",
      endCause: null,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      participantTurns: 0,
      hasAudio: false,
    });
  });

  it("says a typed interview has no audio", async () => {
    const { interview } = await seed({ ...finished, elevenLabsConversationId: null }, "text");

    expect((await (await call(getInterview, interview.id)).json()).hasAudio).toBe(false);
  });

  it("reports a dropped call as completed with endCause interrupted", async () => {
    const { interview } = await seed({ ...finished, endCause: "interrupted" });

    expect(await (await call(getInterview, interview.id)).json()).toMatchObject({
      status: "completed",
      endCause: "interrupted",
    });
  });

  it("is a 404 for another partner, a dashboard study, an unknown id and a malformed id", async () => {
    const { interview } = await seed(finished);
    const dashboardStudy = await studies.create({
      type: "feedback",
      title: "x",
      description: "x",
      preInterviewQuestions: [],
      linkToken: "dash",
    });
    const dashboardInterview = await interviews.create({
      studyId: dashboardStudy.id,
      firstName: "D",
      email: "d@example.com",
    });

    for (const [id, key] of [
      [interview.id, keyB],
      [dashboardInterview.id, keyA],
      ["00000000-0000-4000-8000-000000000000", keyA],
      ["not-a-uuid", keyA],
    ] as const) {
      expect((await call(getInterview, id, {}, key)).status).toBe(404);
    }
  });

  it("checks X-Owner-Ref only when it is sent", async () => {
    const { interview } = await seed(finished);

    expect((await call(getInterview, interview.id)).status).toBe(200);
    expect((await call(getInterview, interview.id, { "X-Owner-Ref": "pfa_user_123" })).status).toBe(
      200,
    );
    expect((await call(getInterview, interview.id, { "X-Owner-Ref": "someone_else" })).status).toBe(
      409,
    );
  });

  it("is 401 without a key", async () => {
    const { interview } = await seed(finished);

    const res = await getInterview(new Request("http://ui.test/x"), {
      params: { interviewId: interview.id },
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /interviews/{id}/transcript", () => {
  it("returns turn-level timing, with each turn ending where the next begins", async () => {
    const { interview } = await seed(finished);

    const res = await call(getTranscript, interview.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.timing).toBe("turn");
    expect(body.durationMs).toBe(312_000);
    expect(body.turns).toEqual([
      { index: 0, speaker: "interviewer", text: "Hi Priya.", startMs: 0, endMs: 3000 },
      { index: 1, speaker: "participant", text: "Hello!", startMs: 3000, endMs: 5000 },
      { index: 2, speaker: "interviewer", text: "How was it?", startMs: 5000, endMs: 12000 },
      // The last turn runs to the end of the recording.
      { index: 3, speaker: "participant", text: "Great.", startMs: 12000, endMs: 312_000 },
    ]);
  });

  it("offers no word timing", async () => {
    const { interview } = await seed(finished);

    const withWords = await call(
      (r, c) => getTranscript(new Request(`${r.url}?include=words`, { headers: r.headers }), c),
      interview.id,
    );
    const body = await withWords.json();

    expect(JSON.stringify(body)).not.toContain('"words"');
    expect(body.timing).toBe("turn");
  });

  it("is 409 until the interview has ended, and 404 for another partner", async () => {
    const running = await seed({ status: "in-progress", startedAt: new Date() });

    expect((await call(getTranscript, running.interview.id)).status).toBe(409);
    const ended = await seed(finished);
    expect((await call(getTranscript, ended.interview.id, {}, keyB)).status).toBe(404);
  });

  it("gives an interview that ended with no speech an empty transcript", async () => {
    const { interview } = await seed({ ...finished, transcript: [] });

    expect((await (await call(getTranscript, interview.id)).json()).turns).toEqual([]);
  });
});

describe("GET /interviews/{id}/audio", () => {
  const withAudio = () => fetchAudio.mockResolvedValue({ ok: true, audio: AUDIO });

  it("streams the whole recording with its format", async () => {
    withAudio();
    const { interview } = await seed(finished);

    const res = await call(getAudio, interview.id);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("x-audio-format")).toBe("mp3; 16000 Hz; mono; 128 kbps");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(AUDIO);
    expect(fetchAudio).toHaveBeenCalledWith("conv-1");
  });

  it("returns exactly the bytes asked for, and 416 for a span past the end", async () => {
    withAudio();
    const { interview } = await seed(finished);

    const part = await call(getAudio, interview.id, { Range: "bytes=1000-1999" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 1000-1999/5000");
    expect(Buffer.from(await part.arrayBuffer())).toEqual(AUDIO.subarray(1000, 2000));

    expect((await call(getAudio, interview.id, { Range: "bytes=9000-" })).status).toBe(416);
  });

  it("fetches the recording once for several spans in a row", async () => {
    withAudio();
    const { interview } = await seed(finished);

    await call(getAudio, interview.id, { Range: "bytes=0-99" });
    await call(getAudio, interview.id, { Range: "bytes=100-199" });
    await call(getAudio, interview.id, { Range: "bytes=200-299" });

    expect(fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("is 404 for a typed interview and for one with no conversation, without calling the provider", async () => {
    const typed = await seed({ ...finished, elevenLabsConversationId: null }, "text");
    const noConversation = await seed({ ...finished, elevenLabsConversationId: null });

    expect((await call(getAudio, typed.interview.id)).status).toBe(404);
    expect((await call(getAudio, noConversation.interview.id)).status).toBe(404);
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it("is 409 before the interview has ended", async () => {
    const { interview } = await seed({ status: "in-progress", startedAt: new Date() });

    expect((await call(getAudio, interview.id)).status).toBe(409);
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it("is 404 when the provider has no recording, and 502 when the provider fails", async () => {
    const { interview } = await seed(finished);

    fetchAudio.mockResolvedValueOnce({ ok: false, status: 404 });
    expect((await call(getAudio, interview.id)).status).toBe(404);

    fetchAudio.mockResolvedValueOnce({ ok: false, status: 503 });
    const down = await call(getAudio, interview.id);
    expect(down.status).toBe(502);
    expect((await down.json()).error.code).toBe("provider_error");

    fetchAudio.mockResolvedValueOnce({ ok: false, status: 0 });
    expect((await call(getAudio, interview.id)).status).toBe(502);
  });

  it("does not let another partner hear it, and never reveals a provider link", async () => {
    withAudio();
    const { interview } = await seed(finished);

    expect((await call(getAudio, interview.id, {}, keyB)).status).toBe(404);
    expect(fetchAudio).not.toHaveBeenCalled();
    const ok = await call(getAudio, interview.id);
    expect(JSON.stringify([...ok.headers])).not.toMatch(/elevenlabs|xi-api|https?:\/\//i);
  });
});
