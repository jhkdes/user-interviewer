import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabasePartnerRepository } from "./supabase/supabase-partner-repository";
import type { PartnerRepository } from "./partner-repository";

/** Resolves the live PartnerRepository for API routes and scripts (server-only). */
export function getPartnerRepository(): PartnerRepository {
  return new SupabasePartnerRepository(createServerSupabaseClient());
}
