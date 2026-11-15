import type { PartnerRateLimitRepository } from "@/repositories/partner-rate-limit-repository";

/** Requests a partner may make in one minute, unless PARTNER_API_RATE_LIMIT_PER_MINUTE says otherwise. */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const WINDOW_MS = 60_000;

/** The configured limit: a positive whole number, or the default for anything else. */
export function rateLimitPerMinute(value = process.env.PARTNER_API_RATE_LIMIT_PER_MINUTE): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Counts one request against the partner's current minute (a fixed window).
 * Over the limit, says how many seconds until the next minute starts. If the
 * counter cannot be reached the request is let through: a fault on UI's side
 * should not stop the partner's users.
 */
export async function checkRateLimit(
  repository: PartnerRateLimitRepository,
  partnerId: string,
  limit: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  try {
    const count = await repository.hit(partnerId, windowStart);
    if (count <= limit) return { allowed: true };
  } catch (error) {
    console.error("[partner-api] rate limit check failed; letting the request through:", error);
    return { allowed: true };
  }
  const retryAfterSeconds = Math.max(
    Math.ceil((windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000),
    1,
  );
  return { allowed: false, retryAfterSeconds };
}
