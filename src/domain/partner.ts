/**
 * A registered API client of the partner API (see partner-api-phase1/
 * UI-PARTNER-API-SPEC.md). Only a hash of its key is ever stored.
 */
export interface Partner {
  id: string;
  /** Unique, human-readable, e.g. "pfa-production". */
  name: string;
  /** SHA-256 (hex) of the API key. */
  keyHash: string;
  /** Where completion webhooks are sent; null until configured. */
  webhookUrl: string | null;
  /** Signs those webhooks; null until configured. */
  webhookSecret: string | null;
  createdAt: Date;
  /** Set when the key is revoked; a revoked partner can no longer call the API. */
  revokedAt: Date | null;
}
