/** A stored answer is kept this long, then the key can be used again. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A request that never finished (the server died) blocks its key for this long, then the key is free again. */
export const IDEMPOTENCY_IN_FLIGHT_MS = 2 * 60 * 1000;

export interface StoredResponse {
  status: number;
  body: string | null;
  contentType: string | null;
}

export type IdempotencyBegin =
  /** First use of the key: the caller does the work, then calls `complete` or `release`. */
  | { state: "new" }
  /** The same request was already answered: send this again. */
  | ({ state: "replay" } & StoredResponse)
  /** The key was used with a different request. */
  | { state: "mismatch" }
  /** The same request is still being worked on. */
  | { state: "in_progress" };

export interface PartnerIdempotencyRepository {
  /** Reserves `key` for a partner's request, or says what became of an earlier use of it. */
  begin(partnerId: string, key: string, requestHash: string, now: Date): Promise<IdempotencyBegin>;
  /** Stores the answer so a retry gets it back. */
  complete(partnerId: string, key: string, response: StoredResponse, now: Date): Promise<void>;
  /** Gives the key back (the request failed), so a retry runs again. */
  release(partnerId: string, key: string): Promise<void>;
}
