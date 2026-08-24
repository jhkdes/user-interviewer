import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabaseInterviewRepository } from "./supabase/supabase-interview-repository";
import type { InterviewRepository } from "./interview-repository";

/** Resolves the live InterviewRepository for API routes (server-only). */
export function getInterviewRepository(): InterviewRepository {
  return new SupabaseInterviewRepository(createServerSupabaseClient());
}
