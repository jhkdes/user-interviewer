import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The webhook signature (partner-api-phase1/UI-PARTNER-API-SPEC.md, 3.8):
 * `sha256=<hex HMAC-SHA256 of the raw request body, keyed with the partner's
 * webhook secret>`. Sent as `X-UI-Signature`.
 */
export function signBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/** What a receiver does: recompute the signature over the raw body and compare in constant time. */
export function verifySignature(
  secret: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signBody(secret, rawBody));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
