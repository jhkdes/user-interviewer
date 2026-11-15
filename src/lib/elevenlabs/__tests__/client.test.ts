import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteConversationResult,
  fetchConversationAudioResult,
  fetchConversationAudioState,
  verifyWebhookSignature,
} from "../client";

const SECRET = "whsec_test_secret";

function sign(rawBody: string, timestamp: number, secret = SECRET): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v0=${signature}`;
}

describe("verifyWebhookSignature", () => {
  const rawBody = JSON.stringify({
    type: "post_call_transcription",
    data: { conversation_id: "c1" },
  });

  it("accepts a correctly signed, fresh payload", () => {
    const header = sign(rawBody, Math.floor(Date.now() / 1000));
    expect(verifyWebhookSignature(rawBody, header, SECRET)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const header = sign(rawBody, Math.floor(Date.now() / 1000), "wrong_secret");
    expect(verifyWebhookSignature(rawBody, header, SECRET)).toBe(false);
  });

  it("rejects a signature computed over a different body", () => {
    const header = sign(rawBody, Math.floor(Date.now() / 1000));
    expect(verifyWebhookSignature(JSON.stringify({ tampered: true }), header, SECRET)).toBe(false);
  });

  it("rejects a timestamp older than the 30-minute replay window", () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 31 * 60;
    const header = sign(rawBody, staleTimestamp);
    expect(verifyWebhookSignature(rawBody, header, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(rawBody, null, SECRET)).toBe(false);
  });

  it("rejects a malformed header missing the v0 or t component", () => {
    expect(verifyWebhookSignature(rawBody, "t=12345", SECRET)).toBe(false);
    expect(verifyWebhookSignature(rawBody, "v0=abcdef", SECRET)).toBe(false);
  });
});

describe("provider calls that say what happened", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const respond = (status: number, body?: unknown) => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  };

  describe("fetchConversationAudioResult", () => {
    it("returns the audio, and the provider's status when it has none", async () => {
      const fetchSpy = respond(200, "audio-bytes");
      const ok = await fetchConversationAudioResult("c1");
      expect(ok.ok).toBe(true);
      expect(String(fetchSpy.mock.calls[0][0])).toContain("/v1/convai/conversations/c1/audio");

      respond(404);
      expect(await fetchConversationAudioResult("c1")).toEqual({ ok: false, status: 404 });
      respond(503);
      expect(await fetchConversationAudioResult("c1")).toEqual({ ok: false, status: 503 });
    });

    it("reports status 0 when it cannot reach the provider or has no key", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      expect(await fetchConversationAudioResult("c1")).toEqual({ ok: false, status: 0 });

      vi.stubEnv("ELEVENLABS_API_KEY", "");
      expect(await fetchConversationAudioResult("c1")).toEqual({ ok: false, status: 0 });
    });
  });

  describe("fetchConversationAudioState", () => {
    it.each([
      [{ status: "done", has_audio: true }, "ready"],
      [{ status: "processing", has_audio: true }, "ready"],
      [{ status: "done", has_audio: false }, "none"],
      [{ status: "failed", has_audio: false }, "none"],
      [{ status: "processing", has_audio: false }, "pending"],
      [{ status: "in-progress" }, "pending"],
    ])("reads %j as %s", async (body, expected) => {
      respond(200, body);
      expect(await fetchConversationAudioState("c1")).toBe(expected);
    });

    it("says unknown when the provider errors, cannot be reached, or there is no key", async () => {
      respond(500);
      expect(await fetchConversationAudioState("c1")).toBe("unknown");

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      expect(await fetchConversationAudioState("c1")).toBe("unknown");

      vi.stubEnv("ELEVENLABS_API_KEY", "");
      expect(await fetchConversationAudioState("c1")).toBe("unknown");
    });
  });

  describe("deleteConversationResult", () => {
    it("separates deleted, already gone and failed", async () => {
      const fetchSpy = respond(200);
      expect(await deleteConversationResult("c1")).toBe("deleted");
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "DELETE" });

      respond(404);
      expect(await deleteConversationResult("c1")).toBe("missing");
      respond(500);
      expect(await deleteConversationResult("c1")).toBe("failed");
    });

    it("fails, without throwing, when the provider cannot be reached or there is no key", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      expect(await deleteConversationResult("c1")).toBe("failed");

      vi.stubEnv("ELEVENLABS_API_KEY", "");
      expect(await deleteConversationResult("c1")).toBe("failed");
    });
  });
});
