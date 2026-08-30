import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../client";

const SECRET = "whsec_test_secret";

function sign(rawBody: string, timestamp: number, secret = SECRET): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v0=${signature}`;
}

describe("verifyWebhookSignature", () => {
  const rawBody = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "c1" } });

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
