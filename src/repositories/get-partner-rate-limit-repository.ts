import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabasePartnerRateLimitRepository } from "./supabase/supabase-partner-rate-limit-repository";
import type { PartnerRateLimitRepository } from "./partner-rate-limit-repository";

/** Resolves the live PartnerRateLimitRepository (server-only). */
export function getPartnerRateLimitRepository(): PartnerRateLimitRepository {
  return new SupabasePartnerRateLimitRepository(createServerSupabaseClient());
}
