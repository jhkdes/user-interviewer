import type { Partner } from "@/domain";
import { getPartnerRepository } from "@/repositories/get-partner-repository";
import { authenticatePartner } from "./authenticate";
import { errorResponse, requestIdFor } from "./errors";

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
 */
export function withPartner<P = Record<string, never>>(
  handler: (context: PartnerRequestContext<P>) => Promise<Response>,
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
        response = await handler({
          request,
          partner: auth.partner,
          requestId,
          params: routeContext.params,
        });
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
