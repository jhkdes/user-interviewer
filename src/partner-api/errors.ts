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
  details?: string[],
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(details ? { details } : {}) } }),
    {
      status,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...headers },
    },
  );
}

export function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
  });
}

/** A rejected request body: the first problem as the message, every problem under `details`. */
export function validationErrorResponse(
  errors: string[],
  requestId: string,
  code: PartnerErrorCode = "invalid_request",
  status = 400,
): Response {
  const message = errors.length > 1 ? `${errors[0]} (and ${errors.length - 1} more)` : errors[0];
  return errorResponse(code, message ?? "Invalid request.", status, requestId, {}, errors);
}

/** Reads a JSON object body, or answers `400` for anything else. */
export async function readJsonBody(
  request: Request,
  requestId: string,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        "invalid_request",
        "Request body must be valid JSON.",
        400,
        requestId,
      ),
    };
  }
}
