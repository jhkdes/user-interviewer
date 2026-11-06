import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabasePartnerInvitationRepository } from "./supabase/supabase-partner-invitation-repository";
import type { PartnerInvitationRepository } from "./partner-invitation-repository";

/** Resolves the live PartnerInvitationRepository for API routes and pages (server-only). */
export function getPartnerInvitationRepository(): PartnerInvitationRepository {
  return new SupabasePartnerInvitationRepository(createServerSupabaseClient());
}
