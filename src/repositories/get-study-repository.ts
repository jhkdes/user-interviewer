import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabaseStudyRepository } from "./supabase/supabase-study-repository";
import type { StudyRepository } from "./study-repository";

/** Resolves the live StudyRepository for API routes (server-only). */
export function getStudyRepository(): StudyRepository {
  return new SupabaseStudyRepository(createServerSupabaseClient());
}
