import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabasePartnerIdempotencyRepository } from "./supabase/supabase-partner-idempotency-repository";
import type { PartnerIdempotencyRepository } from "./partner-idempotency-repository";

/** Resolves the live PartnerIdempotencyRepository (server-only). */
export function getPartnerIdempotencyRepository(): PartnerIdempotencyRepository {
  return new SupabasePartnerIdempotencyRepository(createServerSupabaseClient());
}
