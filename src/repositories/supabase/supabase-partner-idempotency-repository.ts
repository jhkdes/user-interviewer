import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IDEMPOTENCY_IN_FLIGHT_MS,
  IDEMPOTENCY_TTL_MS,
  type IdempotencyBegin,
  type PartnerIdempotencyRepository,
  type StoredResponse,
} from "../partner-idempotency-repository";

interface KeyRow {
  request_hash: string;
  response_status: number | null;
  response_body: string | null;
  response_content_type: string | null;
  created_at: string;
}

const TABLE = "partner_idempotency_keys";

export class SupabasePartnerIdempotencyRepository implements PartnerIdempotencyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async begin(
    partnerId: string,
    key: string,
    requestHash: string,
    now: Date,
  ): Promise<IdempotencyBegin> {
    const reserve = () =>
      this.client.from(TABLE).insert({
        partner_id: partnerId,
        idempotency_key: key,
        request_hash: requestHash,
        created_at: now.toISOString(),
      });

    const first = await reserve();
    if (!first.error) return { state: "new" };

    const existing = await this.read(partnerId, key);
    if (!existing) throw new Error(`Failed to reserve idempotency key: ${first.error.message}`);

    const age = now.getTime() - new Date(existing.created_at).getTime();
    const finished = existing.response_status !== null;
    if (age >= (finished ? IDEMPOTENCY_TTL_MS : IDEMPOTENCY_IN_FLIGHT_MS)) {
      // Too old to count. Free it with a conditional delete, so only one caller wins the retry.
      await this.client
        .from(TABLE)
        .delete()
        .eq("partner_id", partnerId)
        .eq("idempotency_key", key)
        .eq("created_at", existing.created_at);
      const again = await reserve();
      if (!again.error) return { state: "new" };
      const raced = await this.read(partnerId, key);
      if (!raced) throw new Error(`Failed to reserve idempotency key: ${again.error.message}`);
      return this.describe(raced, requestHash);
    }
    return this.describe(existing, requestHash);
  }

  async complete(partnerId: string, key: string, response: StoredResponse, now: Date) {
    const { error } = await this.client
      .from(TABLE)
      .update({
        response_status: response.status,
        response_body: response.body,
        response_content_type: response.contentType,
        completed_at: now.toISOString(),
      })
      .eq("partner_id", partnerId)
      .eq("idempotency_key", key);
    if (error) throw new Error(`Failed to store idempotent response: ${error.message}`);
  }

  async release(partnerId: string, key: string) {
    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq("partner_id", partnerId)
      .eq("idempotency_key", key);
    if (error) throw new Error(`Failed to release idempotency key: ${error.message}`);
  }

  private async read(partnerId: string, key: string): Promise<KeyRow | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select()
      .eq("partner_id", partnerId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new Error(`Failed to read idempotency key: ${error.message}`);
    return (data as KeyRow | null) ?? null;
  }

  private describe(row: KeyRow, requestHash: string): IdempotencyBegin {
    if (row.request_hash !== requestHash) return { state: "mismatch" };
    if (row.response_status === null) return { state: "in_progress" };
    return {
      state: "replay",
      status: row.response_status,
      body: row.response_body,
      contentType: row.response_content_type,
    };
  }
}
