import type { Study } from "@/domain";

export const LINK_EXPIRY_DAYS = 7;
const LINK_EXPIRY_MS = LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type LinkValidity = "valid" | "closed" | "expired";

/**
 * A study link is invalid once the PM closes the study, or automatically
 * 7 days after creation (or after the PM last extended it, via
 * `linkExtendedAt`), whichever comes first — per REQUIREMENTS.md's Link
 * Lifecycle section. `status` on Study only ever tracks the manual-close
 * case; expiry is derived here rather than stored, so it's always correct
 * relative to `now` without a background job to flip it.
 */
export function checkLinkValidity(study: Study, now: Date = new Date()): LinkValidity {
  if (study.status === "closed") return "closed";
  const windowStart = study.linkExtendedAt ?? study.createdAt;
  if (now.getTime() - windowStart.getTime() >= LINK_EXPIRY_MS) return "expired";
  return "valid";
}

/**
 * A link within this many days of its expiry is flagged as "expiring soon"
 * (see `getLinkExpiryInfo`'s `isExpiringSoon`) — the whole point being to
 * surface this *before* it actually expires, not just once it has.
 */
export const LINK_EXPIRY_WARNING_DAYS = 2;

export interface LinkExpiryInfo {
  validity: LinkValidity;
  /** `null` for a closed study — a manual close has no expiry countdown to show. */
  expiresAt: Date | null;
  /**
   * Whole days remaining until `expiresAt`, rounded up (so "1 day left" shows
   * for the entire final day rather than flipping to 0 hours before it
   * actually expires). Zero or negative once expired. `null` when closed.
   */
  daysRemaining: number | null;
  /** True once within `LINK_EXPIRY_WARNING_DAYS` of expiring, but not yet expired. */
  isExpiringSoon: boolean;
}

/**
 * The full picture behind `checkLinkValidity`'s single verdict — when the
 * link actually expires and how close it is — so the dashboard can warn a PM
 * before a link goes dead instead of only reporting it after the fact.
 */
export function getLinkExpiryInfo(study: Study, now: Date = new Date()): LinkExpiryInfo {
  const validity = checkLinkValidity(study, now);
  if (validity === "closed") {
    return { validity, expiresAt: null, daysRemaining: null, isExpiringSoon: false };
  }

  const windowStart = study.linkExtendedAt ?? study.createdAt;
  const expiresAt = new Date(windowStart.getTime() + LINK_EXPIRY_MS);
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const isExpiringSoon = validity === "valid" && daysRemaining <= LINK_EXPIRY_WARNING_DAYS;

  return { validity, expiresAt, daysRemaining, isExpiringSoon };
}
