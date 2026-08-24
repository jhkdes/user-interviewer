import type { Study } from "@/domain";

export const LINK_EXPIRY_DAYS = 7;
const LINK_EXPIRY_MS = LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type LinkValidity = "valid" | "closed" | "expired";

/**
 * A study link is invalid once the PM closes the study, or automatically
 * 7 days after creation, whichever comes first — per REQUIREMENTS.md's Link
 * Lifecycle section. `status` on Study only ever tracks the manual-close
 * case; expiry is derived here rather than stored, so it's always correct
 * relative to `now` without a background job to flip it.
 */
export function checkLinkValidity(study: Study, now: Date = new Date()): LinkValidity {
  if (study.status === "closed") return "closed";
  if (now.getTime() - study.createdAt.getTime() >= LINK_EXPIRY_MS) return "expired";
  return "valid";
}
