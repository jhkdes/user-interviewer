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
  });

  it("throws when the Resend API responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "Invalid `to` field" }),
    );

    await expect(
      new ResendEmailClient().send({ to: "bad", subject: "s", html: "h" }),
    ).rejects.toThrow(/Resend API error \(422\)/);
  });

  it("throws when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(
      new ResendEmailClient().send({ to: "a@example.com", subject: "s", html: "h" }),
    ).rejects.toThrow("network error");
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
});
