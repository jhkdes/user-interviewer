import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendEmailClient } from "../resend-client";

describe("ResendEmailClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "jkim@discoverfirst.co";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("posts to the Resend API with the configured from-address and given fields", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await new ResendEmailClient().send({
      to: "jordan@example.com",
      subject: "Here's what you told us",
      html: "<p>Thanks!</p>",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-resend-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "jkim@discoverfirst.co",
          to: "jordan@example.com",
          subject: "Here's what you told us",
          html: "<p>Thanks!</p>",
        }),
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws immediately (no retry) on a non-retryable 4xx response", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422, text: async () => "Invalid `to` field" });
    vi.stubGlobal("fetch", fetchSpy);

    // maxAttempts: 3 — proves this isn't just "happened to only try once".
    await expect(
      new ResendEmailClient(3, 0).send({ to: "bad", subject: "s", html: "h" }),
    ).rejects.toThrow(/Resend API error \(422\)/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      new ResendEmailClient().send({ to: "a@example.com", subject: "s", html: "h" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when RESEND_FROM_EMAIL is not set", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      new ResendEmailClient().send({ to: "a@example.com", subject: "s", html: "h" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("retry behavior for transient failures", () => {
    it("retries a 5xx response and succeeds if a later attempt is ok", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "unavailable" })
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchSpy);

      await new ResendEmailClient(3, 0).send({ to: "a@example.com", subject: "s", html: "h" });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries when fetch itself throws (network error) and succeeds if a later attempt is ok", async () => {
      const fetchSpy = vi
        .fn()
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchSpy);

      await new ResendEmailClient(3, 0).send({ to: "a@example.com", subject: "s", html: "h" });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting all retries on a persistent 5xx", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, text: async () => "down" });
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        new ResendEmailClient(3, 0).send({ to: "a@example.com", subject: "s", html: "h" }),
      ).rejects.toThrow(/Resend API error \(500\)/);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("throws after exhausting all retries on a persistent network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

      await expect(
        new ResendEmailClient(3, 0).send({ to: "a@example.com", subject: "s", html: "h" }),
      ).rejects.toThrow(/Failed to reach Resend/);
    });
  });
});
