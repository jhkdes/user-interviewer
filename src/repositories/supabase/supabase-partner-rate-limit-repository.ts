import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartnerRateLimitRepository } from "../partner-rate-limit-repository";

export class SupabasePartnerRateLimitRepository implements PartnerRateLimitRepository {
  constructor(private readonly client: SupabaseClient) {}

  async hit(partnerId: string, windowStart: Date) {
    const { data, error } = await this.client.rpc("partner_rate_limit_hit", {
      p_partner_id: partnerId,
      p_window_start: windowStart.toISOString(),
    });
    if (error) throw new Error(`Failed to count partner request: ${error.message}`);
    return data as number;
  }
}
