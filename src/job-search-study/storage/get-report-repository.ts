import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabaseJobSearchReportRepository } from "./supabase-report-repository";
import type { JobSearchReportRepository } from "./types";

/** Resolves the live JobSearchReportRepository for API routes and workers (server-only). */
export function getJobSearchReportRepository(): JobSearchReportRepository {
  return new SupabaseJobSearchReportRepository(createServerSupabaseClient());
}
