import { timingSafeEqual } from "node:crypto";
import type { Partner } from "@/domain";
import type { PartnerRepository } from "@/repositories/partner-repository";
import { hashApiKey } from "./api-key";
import { errorResponse } from "./errors";

export type PartnerAuthResult = { ok: true; partner: Partner } | { ok: false; response: Response };

const UNAUTHORIZED = "Missing or invalid API key.";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Identifies the partner behind `Authorization: Bearer <key>`. A missing,
 * unknown or revoked key all get the same `401`, so a caller cannot tell which.
 * The key's hash is compared with every registered partner's in constant time
 * and without stopping early, so response time does not reveal how close a
 * guess came. (There are only a handful of partners, so reading them all is
 * cheap.)
 */
export async function authenticatePartner(
  request: Request,
  partners: PartnerRepository,
  requestId: string,
): Promise<PartnerAuthResult> {
  const unauthorized = (): PartnerAuthResult => ({
    ok: false,
    response: errorResponse("unauthorized", UNAUTHORIZED, 401, requestId, {
      "WWW-Authenticate": "Bearer",
    }),
  });

  const key = bearerToken(request);
  if (!key) return unauthorized();

  const presented = Buffer.from(hashApiKey(key), "hex");
  let match: Partner | null = null;
  for (const partner of await partners.list()) {
    const stored = Buffer.from(partner.keyHash, "hex");
    if (stored.length === presented.length && timingSafeEqual(stored, presented)) match = partner;
  }

  if (!match || match.revokedAt) return unauthorized();
  return { ok: true, partner: match };
}
