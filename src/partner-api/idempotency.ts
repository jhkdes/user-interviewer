import { createHash } from "node:crypto";
import type { PartnerIdempotencyRepository } from "@/repositories/partner-idempotency-repository";
import { errorResponse } from "./errors";

const KEY_PATTERN = /^[A-Za-z0-9._:~-]{1,255}$/;

export type IdempotencyKeyRead =
  { kind: "none" } | { kind: "invalid" } | { kind: "key"; key: string };

/** The request's `Idempotency-Key`: absent, malformed, or the key. */
export function readIdempotencyKey(request: Request): IdempotencyKeyRead {
  const value = request.headers.get("idempotency-key");
  if (value === null) return { kind: "none" };
  return KEY_PATTERN.test(value) ? { kind: "key", key: value } : { kind: "invalid" };
}

/** What makes two requests "the same": method, address, owner and body. */
export function hashRequest(request: Request, body: string): string {
  const url = new URL(request.url);
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.method,
        url.pathname + url.search,
        request.headers.get("x-owner-ref") ?? "",
        body,
      ]),
    )
    .digest("hex");
}

/**
 * Runs a write once per `Idempotency-Key`. A retry with the same key and the
 * same request gets the first answer back (marked `Idempotent-Replayed: true`)
 * without the work being done again; the same key with a different request is
 * a `409`. Only successful answers are kept: a failed request gives its key
 * back, so the retry really runs.
 */
export async function runIdempotent(args: {
  repository: PartnerIdempotencyRepository;
  partnerId: string;
  key: string;
  request: Request;
  requestId: string;
  execute: () => Promise<Response>;
  now?: Date;
}): Promise<Response> {
  const { repository, partnerId, key, request, requestId } = args;
  const body = await request.clone().text();
  const hash = hashRequest(request, body);

  const began = await repository.begin(partnerId, key, hash, args.now ?? new Date());
  switch (began.state) {
    case "mismatch":
      return errorResponse(
        "conflict",
        "This Idempotency-Key was already used with a different request.",
        409,
        requestId,
      );
    case "in_progress":
      return errorResponse(
        "conflict",
        "A request with this Idempotency-Key is still being processed; retry shortly.",
        409,
        requestId,
        { "Retry-After": "1" },
      );
    case "replay":
      return new Response(began.status === 204 ? null : began.body, {
        status: began.status,
        headers: {
          ...(began.contentType ? { "Content-Type": began.contentType } : {}),
          "X-Request-Id": requestId,
          "Idempotent-Replayed": "true",
        },
      });
    case "new":
      break;
  }

  let response: Response;
  try {
    response = await args.execute();
  } catch (error) {
    await repository.release(partnerId, key).catch(() => undefined);
    throw error;
  }

  // The work is done either way; a failure to remember the answer must not turn
  // a success into an error. The key then stays reserved until it times out.
  try {
    if (response.status >= 200 && response.status < 300) {
      await repository.complete(
        partnerId,
        key,
        {
          status: response.status,
          body: response.status === 204 ? null : await response.clone().text(),
          contentType: response.headers.get("content-type"),
        },
        args.now ?? new Date(),
      );
    } else {
      await repository.release(partnerId, key);
    }
  } catch (error) {
    console.error(`[partner-api] ${requestId} could not store the idempotent response:`, error);
  }
  return response;
}
