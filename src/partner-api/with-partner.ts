import type { Partner } from "@/domain";
import { getPartnerIdempotencyRepository } from "@/repositories/get-partner-idempotency-repository";
import { getPartnerRateLimitRepository } from "@/repositories/get-partner-rate-limit-repository";
import { getPartnerRepository } from "@/repositories/get-partner-repository";
import { authenticatePartner } from "./authenticate";
import { errorResponse, requestIdFor } from "./errors";
import { readIdempotencyKey, runIdempotent, type IdempotencyKeyRead } from "./idempotency";
import { checkRateLimit, rateLimitPerMinute } from "./rate-limit";

export interface PartnerRequestContext<P> {
  request: Request;
  partner: Partner;
  requestId: string;
  params: P;
}

/**
 * Wraps a partner API route handler: authenticates the caller, gives the
 * handler its partner and a request id, turns any unexpected error into a
 * `500 internal` (without leaking the cause), and logs one line per request.
 * The log carries the request id, partner name, method, path and status, and
 * never a key, a header or a body.
 *
 * Every authenticated request counts against the partner's rate limit (`429`
 * with `Retry-After` beyond it). A handler marked `idempotent` (the writes)
 * honours an `Idempotency-Key` header: a retry with the same key and request
 * gets the first answer instead of repeating the work.
 */
export function withPartner<P = Record<string, never>>(
  handler: (context: PartnerRequestContext<P>) => Promise<Response>,
  options: { idempotent?: boolean } = {},
) {
  return async (request: Request, routeContext: { params: P }): Promise<Response> => {
    const requestId = requestIdFor(request);
    const startedAt = Date.now();
    const { pathname } = new URL(request.url);
    let partnerName = "-";
    let response: Response;

    try {
      const auth = await authenticatePartner(request, getPartnerRepository(), requestId);
      if (!auth.ok) {
        response = auth.response;
      } else {
        partnerName = auth.partner.name;
        const { partner } = auth;
        const run = () => handler({ request, partner, requestId, params: routeContext.params });

        const limit = await checkRateLimit(
          getPartnerRateLimitRepository(),
          partner.id,
          rateLimitPerMinute(),
        );
        const idempotency: IdempotencyKeyRead = options.idempotent
          ? readIdempotencyKey(request)
          : { kind: "none" };

        if (!limit.allowed) {
          response = errorResponse(
            "rate_limited",
            `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`,
            429,
            requestId,
            { "Retry-After": String(limit.retryAfterSeconds) },
          );
        } else if (idempotency.kind === "invalid") {
          response = errorResponse(
            "invalid_request",
            "Idempotency-Key must be 1 to 255 characters from A-Z, a-z, 0-9 and . _ : ~ -",
            400,
            requestId,
          );
        } else if (idempotency.kind === "key") {
          response = await runIdempotent({
            repository: getPartnerIdempotencyRepository(),
            partnerId: partner.id,
            key: idempotency.key,
            request,
            requestId,
            execute: run,
          });
        } else {
          response = await run();
        }
      }
    } catch (error) {
      console.error(`[partner-api] ${requestId} unhandled error:`, error);
      response = errorResponse("internal", "Something went wrong.", 500, requestId);
    }

    console.log(
      `[partner-api] ${requestId} ${partnerName} ${request.method} ${pathname} -> ${response.status} (${Date.now() - startedAt}ms)`,
    );
    return response;
  };
}
