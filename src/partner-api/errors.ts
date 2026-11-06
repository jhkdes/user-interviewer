import { randomUUID } from "node:crypto";

export type PartnerErrorCode =
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "invalid_tracking_id"
  | "unsupported_provider"
  | "rate_limited"
  | "provider_error"
  | "internal";

/** An id for correlating a request with the log. Reuses the caller's `X-Request-Id` when it is sane. */
export function requestIdFor(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._-]{1,64}$/.test(supplied) ? supplied : randomUUID();
}

/** The API's one error shape: `{ "error": { "code": "...", "message": "..." } }`. */
export function errorResponse(
  code: PartnerErrorCode,
  message: string,
  status: number,
  requestId: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...headers },
  });
}

export function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
  });
}
