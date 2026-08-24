import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabaseStudyReportRepository } from "./supabase/supabase-study-report-repository";
import type { StudyReportRepository } from "./study-report-repository";

/** Resolves the live StudyReportRepository for API routes (server-only). */
export function getStudyReportRepository(): StudyReportRepository {
  return new SupabaseStudyReportRepository(createServerSupabaseClient());
}
