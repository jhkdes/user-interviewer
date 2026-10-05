import { timingSafeEqual } from "node:crypto";

/**
 * True when the request carries `Authorization: Bearer <secret>` with exactly
 * the given secret. The comparison is constant-time, so a caller can't learn
 * the secret by timing repeated guesses. Always false for an empty secret, so
 * a route whose secret was never configured can't be opened by sending an
 * empty bearer token.
 */
export function hasValidBearerToken(request: Request, secret: string): boolean {
  if (secret === "") return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
