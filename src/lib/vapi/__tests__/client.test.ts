import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFreshRecordingUrl } from "../client";

describe("fetchFreshRecordingUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.VAPI_API_KEY = "test-vapi-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("returns the presigned stereo URL from a successful call lookup", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        artifact: { presignedStereoUrl: "https://recordings.example.com/stereo.wav?sig=abc" },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const url = await fetchFreshRecordingUrl("call-1");

    expect(url).toBe("https://recordings.example.com/stereo.wav?sig=abc");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.vapi.ai/call/call-1",
      expect.objectContaining({ headers: { Authorization: "Bearer test-vapi-key" } }),
    );
  });

  it("falls back to the presigned mono URL when stereo isn't present", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        artifact: { presignedMonoUrl: "https://recordings.example.com/mono.wav" },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchFreshRecordingUrl("call-1")).toBe("https://recordings.example.com/mono.wav");
  });

  it("returns null when the call has no artifact recording URLs", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchFreshRecordingUrl("call-1")).toBeNull();
  });

  it("returns null (not throw) when the Vapi API responds with an error status", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchFreshRecordingUrl("call-1")).toBeNull();
  });

  it("returns null (not throw) when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    expect(await fetchFreshRecordingUrl("call-1")).toBeNull();
  });

  it("returns null when VAPI_API_KEY is not set", async () => {
    delete process.env.VAPI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchFreshRecordingUrl("call-1")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
