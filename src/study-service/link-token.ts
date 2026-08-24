import { randomBytes } from "node:crypto";

/** URL-safe, unguessable token for a study's shareable link. */
export function generateLinkToken(): string {
  return randomBytes(24).toString("base64url");
}
