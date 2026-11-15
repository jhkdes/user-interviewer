import { createHash, randomBytes } from "node:crypto";

/** Every partner API key starts with this, so a leaked one is recognizable (and greppable). */
export const API_KEY_PREFIX = "uip_";

/** A new key: the prefix plus 256 random bits. Shown once, to the operator; only its hash is stored. */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/**
 * SHA-256 (hex) of a key. A plain hash is enough here, unlike for passwords:
 * the key is 256 random bits, so there is nothing to guess or brute-force.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** A new webhook signing secret. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}
