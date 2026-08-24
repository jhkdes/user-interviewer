import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabaseSummaryRepository } from "./supabase/supabase-summary-repository";
import type { SummaryRepository } from "./summary-repository";

/** Resolves the live SummaryRepository for API routes (server-only). */
export function getSummaryRepository(): SummaryRepository {
  return new SupabaseSummaryRepository(createServerSupabaseClient());
}
