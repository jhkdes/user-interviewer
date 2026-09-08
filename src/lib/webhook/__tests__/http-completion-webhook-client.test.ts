import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpCompletionWebhookClient } from "../http-completion-webhook-client";

const samplePayload = {
  participantTrackingId: "third-party-abc-123",
  interviewId: "interview-1",
  studyId: "study-1",
  status: "completed" as const,
  completedAt: "2026-01-01T00:00:00.000Z",
};

describe("HttpCompletionWebhookClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PARTICIPANT_COMPLETION_WEBHOOK_URL = "https://third-party.example.com/webhook";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("posts the payload as JSON to the configured webhook URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await new HttpCompletionWebhookClient().send(samplePayload);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://third-party.example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws immediately (no retry) on a non-retryable 4xx response", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, text: async () => "not found" });
    vi.stubGlobal("fetch", fetchSpy);

    // maxAttempts: 3 — proves this isn't just "happened to only try once".
    await expect(new HttpCompletionWebhookClient(3, 0).send(samplePayload)).rejects.toThrow(
      /Completion webhook error \(404\)/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when PARTICIPANT_COMPLETION_WEBHOOK_URL is not set", async () => {
    delete process.env.PARTICIPANT_COMPLETION_WEBHOOK_URL;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(new HttpCompletionWebhookClient().send(samplePayload)).rejects.toThrow(
      /PARTICIPANT_COMPLETION_WEBHOOK_URL/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("retry behavior for transient failures", () => {
    it("retries a 5xx response and succeeds if a later attempt is ok", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "unavailable" })
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchSpy);

      await new HttpCompletionWebhookClient(3, 0).send(samplePayload);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries when fetch itself throws (network error) and succeeds if a later attempt is ok", async () => {
      const fetchSpy = vi
        .fn()
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchSpy);

      await new HttpCompletionWebhookClient(3, 0).send(samplePayload);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting all retries on a persistent 5xx", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, text: async () => "down" });
      vi.stubGlobal("fetch", fetchSpy);

      await expect(new HttpCompletionWebhookClient(3, 0).send(samplePayload)).rejects.toThrow(
        /Completion webhook error \(500\)/,
      );
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("throws after exhausting all retries on a persistent network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

      await expect(new HttpCompletionWebhookClient(3, 0).send(samplePayload)).rejects.toThrow(
        /Failed to reach completion webhook/,
      );
    });
  });
});
