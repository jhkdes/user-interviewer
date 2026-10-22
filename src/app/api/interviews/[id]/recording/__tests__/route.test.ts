import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import type { PmContext } from "@/pm-auth";

const mocks = vi.hoisted(() => ({
  getCurrentPmContext: vi.fn(),
  getById: vi.fn(),
  fetchConversationAudio: vi.fn(),
  fetchFreshRecordingUrl: vi.fn(),
  upstreamFetch: vi.fn(),
}));

vi.mock("@/pm-auth/current-pm-context", () => ({ getCurrentPmContext: mocks.getCurrentPmContext }));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => ({ getById: mocks.getById }),
}));
vi.mock("@/lib/elevenlabs/client", () => ({
  fetchConversationAudio: mocks.fetchConversationAudio,
}));

vi.mock("@/lib/vapi/client", () => ({ fetchFreshRecordingUrl: mocks.fetchFreshRecordingUrl }));

import { GET } from "../route";

const interview = (overrides: Partial<Interview> = {}) =>
  ({
    id: "int-1",
    studyId: "study-1",
    status: "completed",
    mode: "voice",
    voiceProvider: "elevenlabs",
    elevenLabsConversationId: "conv-1",
    ...overrides,
  }) as Interview;

const ctx = (role: PmContext["role"], grantedStudyIds: string[] = []): PmContext => ({
  userId: "u",
  email: "u@example.com",
  role,
  grantedStudyIds,
});

const call = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/interviews/int-1/recording", { headers }), {
    params: { id: "int-1" },
  });

describe("GET /api/interviews/[id]/recording", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getById.mockResolvedValue(interview());
    mocks.fetchConversationAudio.mockResolvedValue(Buffer.from("audio-bytes"));
  });

  it("is 401 without a session, and does not look up the interview or fetch audio", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("is 403 for a signed-in user with no role", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx(null));
    expect((await call()).status).toBe(403);
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("serves audio to an admin", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("admin"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("serves audio to a viewer granted the interview's study", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["study-1"]));
    expect((await call()).status).toBe(200);
  });

  it("is 404 for a viewer who was not granted the study", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["other-study"]));
    expect((await call()).status).toBe(404);
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("is 404 for a viewer asking for an interview that is not completed", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["study-1"]));
    mocks.getById.mockResolvedValue(interview({ status: "in-progress" }));
    expect((await call()).status).toBe(404);
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("is 404 for an unknown interview", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("admin"));
    mocks.getById.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  describe("a Vapi interview", () => {
    const vapi = (overrides: Partial<Interview> = {}) =>
      interview({
        voiceProvider: "vapi",
        elevenLabsConversationId: null,
        vapiCallId: "call-1",
        recordingUrl: "https://stored.example/rec.wav",
        ...overrides,
      });

    beforeEach(() => {
      vi.stubGlobal("fetch", mocks.upstreamFetch);
      mocks.getById.mockResolvedValue(vapi());
      mocks.fetchFreshRecordingUrl.mockResolvedValue("https://vapi.example/fresh.wav?sig=abc");
      mocks.upstreamFetch.mockImplementation(
        async () =>
          new Response("wav-bytes", {
            status: 200,
            headers: { "content-type": "audio/wav", "content-length": "9" },
          }),
      );
      mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["study-1"]));
    });

    it("streams the audio through, without handing out the presigned URL", async () => {
      const res = await call();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/wav");
      expect(await res.text()).toBe("wav-bytes");
      expect(mocks.upstreamFetch.mock.calls[0][0]).toBe("https://vapi.example/fresh.wav?sig=abc");
      expect(JSON.stringify([...res.headers])).not.toContain("vapi.example");
    });

    it("forwards Range so the player can seek, and passes back a partial response", async () => {
      mocks.upstreamFetch.mockImplementation(
        async () =>
          new Response("av", {
            status: 206,
            headers: { "content-type": "audio/wav", "content-range": "bytes 2-3/9" },
          }),
      );

      const res = await call({ range: "bytes=2-3" });

      expect(mocks.upstreamFetch.mock.calls[0][1].headers).toEqual({ Range: "bytes=2-3" });
      expect(res.status).toBe(206);
      expect(res.headers.get("content-range")).toBe("bytes 2-3/9");
    });

    it("falls back to the stored URL when there is no call id", async () => {
      mocks.getById.mockResolvedValue(vapi({ vapiCallId: null }));
      expect((await call()).status).toBe(200);
      expect(mocks.fetchFreshRecordingUrl).not.toHaveBeenCalled();
      expect(mocks.upstreamFetch.mock.calls[0][0]).toBe("https://stored.example/rec.wav");
    });

    it("is 404 when there is nothing to play or the provider no longer has it", async () => {
      mocks.fetchFreshRecordingUrl.mockResolvedValue(null);
      expect((await call()).status).toBe(404);

      mocks.fetchFreshRecordingUrl.mockResolvedValue("https://vapi.example/fresh.wav");
      mocks.upstreamFetch.mockImplementation(async () => new Response("gone", { status: 403 }));
      expect((await call()).status).toBe(404);
    });

    it("applies the same access rules as ElevenLabs", async () => {
      mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["other-study"]));
      expect((await call()).status).toBe(404);

      mocks.getCurrentPmContext.mockResolvedValue(null);
      expect((await call()).status).toBe(401);
      expect(mocks.upstreamFetch).not.toHaveBeenCalled();
    });
  });
});
